import { randomUUID } from "node:crypto";
import { env } from "../env";
import { logger } from "../logger";

// Т-Бизнес (T-API): выставление счёта на расчётный счёт ИП и одноразовая ссылка с QR-кодом СБП.
// Документация: developer.tbank.ru → «Выставление счетов», «Выставление ссылок через СБП».
// Без токена (TBANK_BUSINESS_TOKEN) используется демо-клиент: счета и QR создаются локально,
// оплату отмечает директор кнопкой «Отметить оплату (демо)».

export interface InvoiceInput {
  /** Номер счёта — только цифры, до 15 знаков. */
  invoiceNumber: string;
  dueDate: string; // ГГГГ-ММ-ДД
  accountNumber?: string;
  payer?: { name: string; inn?: string; kpp?: string };
  items: { name: string; price: number; amount: number; unit?: string }[];
  email?: string;
  comment?: string;
  purpose: string;
}

export interface InvoiceResult {
  invoiceId: string;
  pdfUrl: string | null;
  incomingInvoiceUrl: string | null;
}

export interface QrInput {
  sum: number;
  purpose: string;
  accountNumber: string;
  ttlDays: number;
  redirectUrl?: string;
}

export interface QrResult {
  qrId: string;
  paymentUrl: string;
  status: string;
  image: string | null; // data:image/png;base64,…
}

/** pending — ждём оплату; paid — зачислено; cancelled — ссылка отменена или истекла; failed — ошибка банка. */
export type BankPaymentState = "pending" | "paid" | "cancelled" | "failed";

export interface TbankBusinessClient {
  readonly name: "tbank-business" | "tbank-business-mock";
  readonly testMode: boolean;
  createInvoice(input: InvoiceInput): Promise<InvoiceResult>;
  invoiceState(invoiceId: string): Promise<BankPaymentState>;
  createQr(input: QrInput): Promise<QrResult>;
  qrState(qrId: string): Promise<BankPaymentState>;
  /** Скачивание PDF счёта по ссылке банка (ссылка действует 10 дней). */
  downloadPdf(url: string): Promise<Buffer | null>;
}

export function mapInvoiceStatus(status: string): BankPaymentState {
  return status === "EXECUTED" ? "paid" : "pending";
}

export function mapQrStatus(status: string): BankPaymentState {
  switch (status) {
    case "Paid":
      return "paid";
    case "Cancelled":
    case "Expired":
      return "cancelled";
    case "Failed":
      return "failed";
    default:
      return "pending";
  }
}

class HttpClient implements TbankBusinessClient {
  readonly name = "tbank-business" as const;
  readonly testMode: boolean;
  constructor(
    private baseUrl: string,
    private token: string,
  ) {
    this.testMode = /sandbox/.test(baseUrl);
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", "X-Request-Id": randomUUID() },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        message = j.errorMessage ?? j.errorDetails?.message ?? j.message ?? message;
      } catch {}
      logger.warn("tbank_business.error", { path, status: res.status, message });
      throw new Error(`Т-Бизнес ответил ${res.status}: ${message}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
    const r = await this.call<{ invoiceId: string; pdfUrl?: string; incomingInvoiceUrl?: string }>("POST", "/api/v1/invoice/send", {
      invoiceNumber: input.invoiceNumber,
      dueDate: input.dueDate,
      ...(input.accountNumber ? { accountNumber: input.accountNumber } : {}),
      ...(input.payer ? { payer: { name: input.payer.name.slice(0, 512), ...(input.payer.inn ? { inn: input.payer.inn } : {}), ...(input.payer.kpp ? { kpp: input.payer.kpp } : {}) } } : {}),
      items: input.items.map((i) => ({ name: i.name.slice(0, 1000), price: i.price, amount: i.amount, unit: i.unit ?? "усл.", vat: "None" })),
      ...(input.email ? { contacts: [{ email: input.email }] } : {}),
      ...(input.comment ? { comment: input.comment.slice(0, 1000) } : {}),
      customPaymentPurpose: input.purpose.slice(0, 512),
    });
    return { invoiceId: r.invoiceId, pdfUrl: r.pdfUrl ?? null, incomingInvoiceUrl: r.incomingInvoiceUrl ?? null };
  }

  async invoiceState(invoiceId: string): Promise<BankPaymentState> {
    const r = await this.call<{ status: string }>("GET", `/api/v1/openapi/invoice/${encodeURIComponent(invoiceId)}/info`);
    return mapInvoiceStatus(r.status);
  }

  async createQr(input: QrInput): Promise<QrResult> {
    const r = await this.call<{ qrId: string; paymentUrl: string; status: string }>("POST", "/api/v1/b2b/qr/onetime", {
      sum: input.sum,
      purpose: input.purpose.slice(0, 210),
      accountNumber: input.accountNumber,
      ttl: input.ttlDays,
      ...(input.redirectUrl ? { redirectUrl: input.redirectUrl } : {}),
    });
    // Картинка QR отдаётся методом получения информации о ссылке
    const info = await this.call<{ image?: { content: string; mediaType: string } }>("GET", `/api/v1/b2b/qr/${encodeURIComponent(r.qrId)}/info?withImage=true`).catch(() => ({}) as { image?: { content: string; mediaType: string } });
    return { qrId: r.qrId, paymentUrl: r.paymentUrl, status: r.status, image: info.image ? `data:${info.image.mediaType};base64,${info.image.content}` : null };
  }

  async qrState(qrId: string): Promise<BankPaymentState> {
    const r = await this.call<{ status: string }>("GET", `/api/v1/b2b/qr/${encodeURIComponent(qrId)}/info`);
    return mapQrStatus(r.status);
  }

  async downloadPdf(url: string): Promise<Buffer | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      logger.warn("tbank_business.pdf_download_failed", { err });
      return null;
    }
  }
}

/** Демо-клиент: банк не вызывается, статус меняется кнопкой «Отметить оплату (демо)». */
class MockClient implements TbankBusinessClient {
  readonly name = "tbank-business-mock" as const;
  readonly testMode = true;
  async createInvoice(): Promise<InvoiceResult> {
    return { invoiceId: randomUUID(), pdfUrl: null, incomingInvoiceUrl: null };
  }
  async invoiceState(): Promise<BankPaymentState> {
    return "pending";
  }
  async createQr(input: QrInput): Promise<QrResult> {
    const qrId = randomUUID();
    return { qrId, paymentUrl: `${env.APP_URL}/cabinet/payments?demoQr=${qrId}&sum=${input.sum}`, status: "Ready", image: null };
  }
  async qrState(): Promise<BankPaymentState> {
    return "pending";
  }
  async downloadPdf(): Promise<Buffer | null> {
    return null;
  }
}

let client: TbankBusinessClient | null = null;
export function tbankBusiness(): TbankBusinessClient {
  if (!client) client = env.TBANK_BUSINESS_TOKEN ? new HttpClient(env.TBANK_BUSINESS_API_URL, env.TBANK_BUSINESS_TOKEN) : new MockClient();
  return client;
}
