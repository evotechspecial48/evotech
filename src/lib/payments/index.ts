import { createHash } from "node:crypto";
import { env } from "../env";
import { logger } from "../logger";
import { tbankToken, verifyTbankToken } from "@/domain/tbank";

// Абстракция эквайринга. TBankProvider — реальный API Т-Банка (тестовый терминал по ключам из .env),
// MockBankProvider — встроенная демо-форма оплаты, подписывающая уведомления тем же алгоритмом.

export interface InitPaymentInput {
  orderId: string;
  amountKop: number;
  description: string;
  email?: string;
  successUrl: string;
  failUrl: string;
  notificationUrl: string;
}

export interface InitPaymentResult {
  providerPaymentId: string;
  paymentUrl: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly testMode: boolean;
  init(input: InitPaymentInput): Promise<InitPaymentResult>;
  verifyNotification(body: Record<string, unknown>): boolean;
  /** Подготовка к возвратам: отмена/возврат по идентификатору платежа банка. */
  cancel(providerPaymentId: string, amountKop?: number): Promise<{ ok: boolean; status?: string; message?: string }>;
  /** Подпись уведомления (используется демо-формой). */
  sign(body: Record<string, unknown>): string;
}

class TBankProvider implements PaymentProvider {
  readonly name = "tbank";
  readonly testMode: boolean;
  constructor(
    private terminalKey: string,
    private password: string,
    private apiUrl: string,
  ) {
    this.testMode = terminalKey.toUpperCase().includes("DEMO") || terminalKey.toLowerCase().includes("test");
  }

  private async call(method: string, params: Record<string, unknown>) {
    const body = { TerminalKey: this.terminalKey, ...params };
    const res = await fetch(`${this.apiUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, Token: tbankToken(body, this.password) }),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!json.Success) {
      logger.warn("tbank.error", { method, code: json.ErrorCode, message: json.Message });
      throw new Error(`Т-Банк: ${String(json.Message ?? "ошибка")} (${String(json.ErrorCode ?? "")})`);
    }
    return json;
  }

  async init(input: InitPaymentInput): Promise<InitPaymentResult> {
    const json = await this.call("Init", {
      Amount: input.amountKop,
      OrderId: input.orderId,
      Description: input.description.slice(0, 140),
      SuccessURL: input.successUrl,
      FailURL: input.failUrl,
      NotificationURL: input.notificationUrl,
      ...(input.email ? { DATA: { Email: input.email } } : {}),
    });
    return { providerPaymentId: String(json.PaymentId), paymentUrl: String(json.PaymentURL) };
  }

  verifyNotification(body: Record<string, unknown>) {
    return body.TerminalKey === this.terminalKey && verifyTbankToken(body, this.password);
  }

  async cancel(providerPaymentId: string, amountKop?: number) {
    const json = await this.call("Cancel", { PaymentId: providerPaymentId, ...(amountKop ? { Amount: amountKop } : {}) });
    return { ok: true, status: String(json.Status) };
  }

  sign(body: Record<string, unknown>) {
    return tbankToken(body, this.password);
  }
}

class MockBankProvider implements PaymentProvider {
  readonly name = "mock";
  readonly testMode = true;
  readonly terminalKey = "EvoMockTerminal";
  // Пароль демо-терминала выводится из APP_SECRET — подделать уведомление без секрета нельзя
  private password = createHash("sha256").update(`mock-bank:${env.APP_SECRET}`).digest("hex").slice(0, 20);

  async init(input: InitPaymentInput): Promise<InitPaymentResult> {
    const providerPaymentId = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    return { providerPaymentId, paymentUrl: `${env.APP_URL}/pay/mock/${encodeURIComponent(input.orderId)}` };
  }

  verifyNotification(body: Record<string, unknown>) {
    return body.TerminalKey === this.terminalKey && verifyTbankToken(body, this.password);
  }

  async cancel() {
    return { ok: true, status: "REFUNDED", message: "Демо-возврат" };
  }

  sign(body: Record<string, unknown>) {
    return tbankToken(body, this.password);
  }
}

let instance: PaymentProvider | null = null;
export function paymentProvider(): PaymentProvider {
  if (!instance) {
    if (env.PAYMENT_PROVIDER === "tbank") {
      if (!env.TBANK_TERMINAL_KEY || !env.TBANK_PASSWORD) throw new Error("Не заданы TBANK_TERMINAL_KEY / TBANK_PASSWORD");
      instance = new TBankProvider(env.TBANK_TERMINAL_KEY, env.TBANK_PASSWORD, env.TBANK_API_URL);
    } else instance = new MockBankProvider();
  }
  return instance;
}

export function mockTerminalKey(): string {
  return "EvoMockTerminal";
}
