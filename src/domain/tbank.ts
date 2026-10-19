// Подпись запросов и уведомлений Т-Банк Эквайринга (Token).
// Алгоритм: берутся параметры корневого уровня (без вложенных объектов и самого Token),
// добавляется пара Password, ключи сортируются по алфавиту, значения конкатенируются,
// от строки считается SHA-256 (hex).

import { createHash, timingSafeEqual } from "node:crypto";

type Scalar = string | number | boolean | null | undefined;

export function tbankToken(params: Record<string, unknown>, password: string): string {
  const pairs: Record<string, string> = { Password: password };
  for (const [key, value] of Object.entries(params)) {
    if (key === "Token") continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    pairs[key] = String(value as Scalar);
  }
  const concatenated = Object.keys(pairs)
    .sort()
    .map((k) => pairs[k])
    .join("");
  return createHash("sha256").update(concatenated, "utf8").digest("hex");
}

export function verifyTbankToken(params: Record<string, unknown>, password: string): boolean {
  const received = typeof params.Token === "string" ? params.Token : "";
  const expected = tbankToken(params, password);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/** Статусы уведомлений Т-Банка → внутренние статусы платежа. */
export function mapTbankStatus(status: string): "pending" | "authorized" | "paid" | "cancelled" | "failed" | "refunded" {
  switch (status) {
    case "AUTHORIZED":
      return "authorized";
    case "CONFIRMED":
      return "paid";
    case "CANCELED":
    case "REVERSED":
    case "DEADLINE_EXPIRED":
      return "cancelled";
    case "REJECTED":
    case "AUTH_FAIL":
      return "failed";
    case "REFUNDED":
    case "PARTIAL_REFUNDED":
      return "refunded";
    default:
      return "pending";
  }
}

const FINAL = new Set(["paid", "cancelled", "failed", "refunded"]);

/**
 * Можно ли применить новый статус к платежу. Защищает от «отката» статуса при
 * повторной или запоздалой доставке webhook (например, AUTHORIZED после CONFIRMED).
 */
export function canApplyPaymentStatus(current: string, next: string): boolean {
  if (current === next) return false;
  if (current === "paid") return next === "refunded";
  if (FINAL.has(current)) return false;
  if (current === "authorized") return next !== "pending";
  return true;
}
