import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";

// Абстракция файлового хранилища. LocalStorage — для разработки,
// S3Storage — заготовка под S3-совместимое хранилище (Yandex Object Storage, MinIO и т. п.).

export interface FileStorage {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements FileStorage {
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
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements FileStorage {
  // Подключение: установить @aws-sdk/client-s3 и реализовать методы через PutObject/GetObject/DeleteObject.
  async put(): Promise<void> {
    throw new Error("S3-хранилище не настроено: реализуйте S3Storage (см. docs/ARCHITECTURE.md)");
  }
  async get(): Promise<Buffer> {
    throw new Error("S3-хранилище не настроено");
  }
  async remove(): Promise<void> {
    throw new Error("S3-хранилище не настроено");
  }
}

let instance: FileStorage | null = null;
export function storage(): FileStorage {
  if (!instance) instance = env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage(path.resolve(env.STORAGE_DIR));
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
