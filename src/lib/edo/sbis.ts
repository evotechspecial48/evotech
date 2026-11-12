import { randomUUID } from "node:crypto";
import { env } from "../env";
import { logger } from "../logger";

// ЭДО СБИС (Saby), JSON-RPC API: saby.ru/help/integration/api.
// Сайт создаёт документ «Договор» (ДоговорДок) с PDF; директор подписывает КЭП и отправляет его в Saby,
// заказчик подписывает у себя. Состояние сверяет воркер (СБИС.ПрочитатьДокумент), код 7 — подписан обеими сторонами.

export interface SbisParty {
  inn: string;
  kpp?: string | null;
  name: string;
  /** ФИО — для ИП и физлица. */
  fio?: { last: string; first: string; middle?: string } | null;
  /** Физическое лицо (не ИП). */
  person?: boolean;
}

export interface SbisDocumentInput {
  number: string;
  date: Date;
  amount: number;
  note: string;
  file: { name: string; data: Buffer };
  our: SbisParty;
  counterparty: SbisParty;
}

/** Пакет «Документ отгрузки» (реализация): акт PDF + УПД XML — тип вложений Saby определяет сам. */
export interface SbisShipmentInput extends Omit<SbisDocumentInput, "file"> {
  files: { name: string; data: Buffer }[];
}

export interface SbisDocumentState {
  code: string;
  name: string;
  link: string | null;
  files: { name: string; url: string }[];
}

export interface SbisClient {
  readonly name: "sbis" | "sbis-mock";
  createContract(input: SbisDocumentInput): Promise<{ id: string; link: string | null }>;
  createShipment(input: SbisShipmentInput): Promise<{ id: string; link: string | null }>;
  read(id: string): Promise<SbisDocumentState>;
  download(url: string): Promise<Buffer>;
}

/** Коды состояния исходящего документа (saby.ru/help/integration/api/sequence/cod). */
export const SBIS_SIGNED = "7";
export const SBIS_FAILED = new Set(["6", "9", "19", "20", "22"]);

const ddmmyyyy = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });

/** Сторона документа: организация — СвЮЛ (ИНН 10 + КПП), ИП и физлицо — СвФЛ (ИНН 12 + ФИО). */
export function sbisParty(p: SbisParty): Record<string, unknown> {
  if (p.inn.length === 10) return { СвЮЛ: { ИНН: p.inn, КПП: p.kpp ?? undefined, Название: p.name } };
  return { СвФЛ: { ИНН: p.inn, Фамилия: p.fio?.last, Имя: p.fio?.first, Отчество: p.fio?.middle, ...(p.person ? { ЧастноеЛицо: "Да" } : {}) } };
}

type SbisDoc = {
  Идентификатор?: string;
  СсылкаДляНашаОрганизация?: string;
  Состояние?: { Код?: string; Название?: string };
  Вложение?: { Файл?: { Имя?: string; Ссылка?: string }; Подпись?: { Файл?: { Имя?: string; Ссылка?: string } }[] }[];
};

class HttpClient implements SbisClient {
  readonly name = "sbis" as const;
  private sid: { value: string; at: number } | null = null;
  constructor(
    private baseUrl: string,
    private login: string,
    private password: string,
  ) {}

  private async rpc<T>(path: string, method: string, params: unknown, sid?: string): Promise<{ status: number; result?: T; error?: { message?: string; details?: string } }> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json-rpc;charset=utf-8", "User-Agent": "EvoTech-Platform/1.0", ...(sid ? { "X-SBISSessionID": sid } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, protocol: 4, id: 0 }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let body: { result?: T; error?: { message?: string; details?: string } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: { message: text.slice(0, 200) } };
    }
    return { status: res.status, ...body };
  }

  private async session(force = false): Promise<string> {
    // Сессия СБИС живёт до 21 дня; обновляем раз в сутки или при 401
    if (!force && this.sid && Date.now() - this.sid.at < 86_400_000) return this.sid.value;
    const r = await this.rpc<string>("/auth/service/", "СБИС.Аутентифицировать", { Параметр: { Логин: this.login, Пароль: this.password } });
    if (!r.result) throw new Error(`СБИС: вход не выполнен — ${r.error?.details ?? r.error?.message ?? `HTTP ${r.status}`}`);
    this.sid = { value: r.result, at: Date.now() };
    return r.result;
  }

  private async call<T>(method: string, params: unknown): Promise<T> {
    let r = await this.rpc<T>("/service/?srv=1", method, params, await this.session());
    if (r.status === 401) r = await this.rpc<T>("/service/?srv=1", method, params, await this.session(true));
    if (r.error || r.result === undefined) {
      const message = r.error?.details ?? r.error?.message ?? `HTTP ${r.status}`;
      logger.warn("sbis.error", { method, status: r.status, message });
      throw new Error(`СБИС: ${message}`);
    }
    return r.result;
  }

  async createContract(input: SbisDocumentInput) {
    const { file, ...rest } = input;
    return this.write("ДоговорДок", { ...rest, files: [file] });
  }

  async createShipment(input: SbisShipmentInput) {
    return this.write("ДокОтгрИсх", input);
  }

  private async write(type: string, input: SbisShipmentInput) {
    const doc = await this.call<SbisDoc>("СБИС.ЗаписатьДокумент", {
      Документ: {
        Тип: type,
        Номер: input.number,
        Дата: ddmmyyyy(input.date),
        Сумма: input.amount.toFixed(2),
        Примечание: input.note.slice(0, 500),
        НашаОрганизация: sbisParty(input.our),
        Контрагент: sbisParty(input.counterparty),
        Вложение: input.files.map((f) => ({ Идентификатор: randomUUID(), Служебный: "Нет", Название: f.name, Файл: { Имя: f.name, ДвоичныеДанные: f.data.toString("base64") } })),
      },
    });
    if (!doc.Идентификатор) throw new Error("СБИС не вернул идентификатор документа");
    return { id: doc.Идентификатор, link: doc.СсылкаДляНашаОрганизация ?? null };
  }

  async read(id: string): Promise<SbisDocumentState> {
    const doc = await this.call<SbisDoc>("СБИС.ПрочитатьДокумент", { Документ: { Идентификатор: id } });
    const files: { name: string; url: string }[] = [];
    for (const v of doc.Вложение ?? []) {
      if (v.Файл?.Ссылка) files.push({ name: v.Файл.Имя ?? "document", url: v.Файл.Ссылка });
      for (const sig of v.Подпись ?? []) if (sig.Файл?.Ссылка) files.push({ name: sig.Файл.Имя ?? "signature.sgn", url: sig.Файл.Ссылка });
    }
    return { code: String(doc.Состояние?.Код ?? ""), name: doc.Состояние?.Название ?? "", link: doc.СсылкаДляНашаОрганизация ?? null, files };
  }

  async download(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { "X-SBISSessionID": await this.session() }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`СБИС: файл не скачан (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Демо-клиент для разработки и тестов: документ «подписывается» по команде теста. */
export class MockSbisClient implements SbisClient {
  readonly name = "sbis-mock" as const;
  readonly docs = new Map<string, SbisDocumentState & { type: string; input: SbisShipmentInput }>();
  async createContract({ file, ...rest }: SbisDocumentInput) {
    return this.add("ДоговорДок", { ...rest, files: [file] });
  }
  async createShipment(input: SbisShipmentInput) {
    return this.add("ДокОтгрИсх", input);
  }
  private async add(type: string, input: SbisShipmentInput) {
    const id = randomUUID();
    this.docs.set(id, { code: "0", name: "Документ редактируется", link: `https://online.sbis.ru/doc/${id}`, files: [], type, input });
    return { id, link: `https://online.sbis.ru/doc/${id}` };
  }
  async read(id: string) {
    const d = this.docs.get(id);
    if (!d) throw new Error("СБИС: документ не найден");
    return d;
  }
  async download(): Promise<Buffer> {
    return Buffer.from("signed");
  }
}

let client: SbisClient | null = null;
export function sbis(): SbisClient | null {
  if (!client && env.SBIS_LOGIN && env.SBIS_PASSWORD) client = new HttpClient(env.SBIS_API_URL, env.SBIS_LOGIN, env.SBIS_PASSWORD);
  return client;
}
/** Для тестов: подменить клиент. */
export function setSbisClient(c: SbisClient | null) {
  client = c;
}
