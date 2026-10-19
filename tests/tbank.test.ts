import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canApplyPaymentStatus, mapTbankStatus, tbankToken, verifyTbankToken } from "@/domain/tbank";

describe("Т-Банк: подпись", () => {
  // Пример из документации Т-Банка (Init): итоговая строка
  // "100000Подарочная карта на 1000 рублей21090TinkoffBankTestTinkoffBankTest"
  it("считает токен по документированному алгоритму", () => {
    const token = tbankToken(
      {
        TerminalKey: "TinkoffBankTest",
        Amount: 100000,
        OrderId: "21090",
        Description: "Подарочная карта на 1000 рублей",
        DATA: { Phone: "+71234567890" },
        Receipt: { Items: [] },
      },
      "TinkoffBankTest",
    );
    const expected = createHash("sha256")
      .update("100000Подарочная карта на 1000 рублей21090TinkoffBankTestTinkoffBankTest")
      .digest("hex");
    expect(token).toBe(expected);
  });

  it("проверяет токен уведомления и отклоняет подмену", () => {
    const body: Record<string, unknown> = { TerminalKey: "T", OrderId: "1", Success: true, Status: "CONFIRMED", PaymentId: 13660, Amount: 100000 };
    body.Token = tbankToken(body, "secret");
    expect(verifyTbankToken(body, "secret")).toBe(true);
    expect(verifyTbankToken({ ...body, Amount: 1 }, "secret")).toBe(false);
    expect(verifyTbankToken(body, "other")).toBe(false);
  });
});

describe("Т-Банк: статусы", () => {
  it("маппинг", () => {
    expect(mapTbankStatus("CONFIRMED")).toBe("paid");
    expect(mapTbankStatus("REJECTED")).toBe("failed");
  });
  it("не откатывает финальный статус", () => {
    expect(canApplyPaymentStatus("paid", "authorized")).toBe(false);
    expect(canApplyPaymentStatus("paid", "paid")).toBe(false);
    expect(canApplyPaymentStatus("pending", "paid")).toBe(true);
    expect(canApplyPaymentStatus("paid", "refunded")).toBe(true);
  });
});
