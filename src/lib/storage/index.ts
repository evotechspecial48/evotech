import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";
import { logger } from "../logger";

// Абстракция файлового хранилища:
//   LocalStorage  — диск сервера (разработка);
//   WebDavStorage — Облако Mail.ru (основной объём: проекты, модели, документы) или любой WebDAV-сервер;
//   S3Storage     — заготовка под S3-совместимое хранилище.
// Ключ файла — относительный путь в хранилище (см. services/files.ts → storageKeyFor).

export interface FileStorage {
  readonly name: string;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Потоковое чтение — большие модели и архивы не загружаются в память сервера. */
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements FileStorage {
  readonly name = "local";
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("Недопустимый путь файла");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async stream(key: string) {
    const full = this.resolve(key);
    await fs.access(full);
    return Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  }
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/**
 * WebDAV (RFC 4918). Для Облака Mail.ru: адрес https://webdav.cloud.mail.ru, логин — почта,
 * пароль — «пароль для внешнего приложения» с доступом «Облако (WebDAV)». Папки создаются автоматически.
 */
export class WebDavStorage implements FileStorage {
  readonly name = "webdav";
  private auth: string;
  private knownDirs = new Set<string>();

  constructor(
    private baseUrl: string,
    user: string,
    password: string,
    private root: string,
  ) {
    this.auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  }

  private safeKey(key: string): string[] {
    const parts = key.split("/").filter(Boolean);
    if (parts.some((p) => p === ".." || p === ".")) throw new Error("Недопустимый путь файла");
    return parts;
  }

  private url(parts: string[]): string {
    const all = [...this.root.split("/").filter(Boolean), ...parts].map(encodeURIComponent);
    return `${this.baseUrl.replace(/\/+$/, "")}/${all.join("/")}`;
  }

  private async request(method: string, url: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<Response> {
    let lastErr: unknown;
    // Повторы при сетевых сбоях и 5xx — облако периодически отвечает с задержкой
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          method,
          headers: { Authorization: this.auth, ...(init.headers ?? {}) },
          signal: AbortSignal.timeout(method === "PUT" || method === "GET" ? 15 * 60_000 : 60_000),
        });
        if (res.ok || okStatuses.includes(res.status)) return res;
        if (res.status >= 500 && attempt < 3) {
          lastErr = new Error(`WebDAV ${method}: ${res.status}`);
        } else {
          throw new Error(res.status === 401 ? "WebDAV: неверный логин или пароль приложения" : `WebDAV ${method} ${res.status}: ${res.statusText}`);
        }
      } catch (err) {
        lastErr = err;
        if (err instanceof Error && /неверный логин|WebDAV \w+ 4\d\d/.test(err.message)) throw err;
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    throw lastErr instanceof Error ? lastErr : new Error("WebDAV: ошибка соединения");
  }

  /** MKCOL для каждой папки пути; уже существующие (405) пропускаются и запоминаются. */
  private async ensureDirs(parts: string[]) {
    const rootParts = this.root.split("/").filter(Boolean);
    const all = [...rootParts, ...parts.slice(0, -1)];
    for (let i = 1; i <= all.length; i++) {
      const dir = all.slice(0, i).join("/");
      if (this.knownDirs.has(dir)) continue;
      const url = `${this.baseUrl.replace(/\/+$/, "")}/${all.slice(0, i).map(encodeURIComponent).join("/")}/`;
      await this.request("MKCOL", url, {}, [405, 301]);
      this.knownDirs.add(dir);
    }
  }

  async put(key: string, data: Buffer, mime: string) {
    const parts = this.safeKey(key);
    await this.ensureDirs(parts);
    await this.request("PUT", this.url(parts), { body: new Uint8Array(data), headers: { "Content-Type": mime, "Content-Length": String(data.length) } });
  }

  async get(key: string) {
    const res = await this.request("GET", this.url(this.safeKey(key)));
    return Buffer.from(await res.arrayBuffer());
  }

  async stream(key: string) {
    const res = await this.request("GET", this.url(this.safeKey(key)));
    if (!res.body) throw new Error("WebDAV: пустой ответ");
    return res.body;
  }

  async remove(key: string) {
    await this.request("DELETE", this.url(this.safeKey(key)), {}, [404]);
  }

  /** Проверка подключения (раздел «Настройки» и диагностика). */
  async check(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.request("PROPFIND", `${this.baseUrl.replace(/\/+$/, "")}/`, { headers: { Depth: "0" } }, [207]);
      return { ok: true, message: "Подключение к хранилищу работает" };
    } catch (err) {
      logger.warn("storage.webdav_check_failed", { err });
      return { ok: false, message: err instanceof Error ? err.message : "Ошибка подключения" };
    }
  }
}

class S3Storage implements FileStorage {
  readonly name = "s3";
  // Подключение: установить @aws-sdk/client-s3 и реализовать методы через PutObject/GetObject/DeleteObject.
  async put(): Promise<void> {
    throw new Error("S3-хранилище не настроено: реализуйте S3Storage (см. docs/ARCHITECTURE.md)");
  }
  async get(): Promise<Buffer> {
    throw new Error("S3-хранилище не настроено");
  }
  async stream(): Promise<ReadableStream<Uint8Array>> {
    throw new Error("S3-хранилище не настроено");
  }
  async remove(): Promise<void> {
    throw new Error("S3-хранилище не настроено");
  }
}

let instance: FileStorage | null = null;
export function storage(): FileStorage {
  if (!instance) {
    if (env.STORAGE_DRIVER === "webdav") {
      if (!env.WEBDAV_URL || !env.WEBDAV_USER || !env.WEBDAV_PASSWORD) throw new Error("Не заданы WEBDAV_URL / WEBDAV_USER / WEBDAV_PASSWORD");
      instance = new WebDavStorage(env.WEBDAV_URL, env.WEBDAV_USER, env.WEBDAV_PASSWORD, env.WEBDAV_ROOT);
    } else if (env.STORAGE_DRIVER === "s3") instance = new S3Storage();
    else instance = new LocalStorage(path.resolve(env.STORAGE_DIR));
  }
  return instance;
}

// Антивирусная проверка — точка расширения (ClamAV через clamd, облачный сканер).
export interface VirusScanner {
  scan(data: Buffer, name: string): Promise<"CLEAN" | "INFECTED" | "SKIPPED">;
}

export const scanner: VirusScanner = {
  async scan(data) {
    // EICAR — тестовая сигнатура для проверки сценария заражённого файла
    if (data.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))) return "INFECTED";
    return "SKIPPED";
  },
};
