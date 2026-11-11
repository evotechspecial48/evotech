import { describe, expect, it } from "vitest";
import { numberToWords, rublesInWords } from "@/domain/money-words";
import { gostPaymentString } from "@/domain/payment-qr";
import { lastMonths, monthKey, monthLabel, monthRange, projectMonthDate } from "@/domain/months";
import { mapInvoiceStatus, mapQrStatus } from "@/lib/payments/tbank-business";
import { invoiceAmount } from "@/services/invoices";

describe("сумма прописью", () => {
  it("склоняет рубли, тысячи и копейки", () => {
    expect(rublesInWords(1)).toBe("один рубль 00 копеек");
    expect(rublesInWords(2)).toBe("два рубля 00 копеек");
    expect(rublesInWords(11)).toBe("одиннадцать рублей 00 копеек");
    expect(rublesInWords(2001)).toBe("две тысячи один рубль 00 копеек");
    expect(rublesInWords(120000)).toBe("сто двадцать тысяч рублей 00 копеек");
    expect(rublesInWords(150000.5)).toBe("сто пятьдесят тысяч рублей 50 копеек");
    expect(numberToWords(1234567)).toBe("один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь");
  });
});

describe("месяцы", () => {
  it("считает месяц по московскому времени", () => {
    // 31 октября 22:30 UTC — уже 1 ноября в Москве
    expect(monthKey(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11");
    expect(monthLabel("2026-10")).toBe("Октябрь 2026");
    expect(monthRange("2026-10").from.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(lastMonths(3, new Date("2026-01-15T10:00:00Z"))).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
  it("относит проект к месяцу подписания договора, иначе — к созданию", () => {
    const createdAt = new Date("2026-11-05T10:00:00Z");
    expect(monthKey(projectMonthDate({ createdAt, contracts: [{ signedAt: new Date("2026-10-01T09:00:00Z") }] }))).toBe("2026-10");
    expect(monthKey(projectMonthDate({ createdAt, contracts: [{ signedAt: null }] }))).toBe("2026-11");
  });
});

describe("оплата по счёту и СБП", () => {
  it("QR по ГОСТ Р 56042: сумма в копейках, без символа-разделителя в значениях", () => {
    const s = gostPaymentString({ name: "ИП Левонидских Е.О.", account: "40802810200001244202", bankName: "АО «ТБанк»", bik: "044525974", corrAccount: "30101810145250000974", inn: "481303880005" }, 60000.5, "Предоплата | по договору");
    expect(s.startsWith("ST00012|Name=ИП Левонидских Е.О.|PersonalAcc=40802810200001244202|")).toBe(true);
    expect(s).toContain("|Sum=6000050|");
    expect(s.endsWith("|Purpose=Предоплата по договору")).toBe(true);
  });
  it("сумма счёта: предоплата — половина, окончательный — остаток", () => {
    expect(invoiceAmount("prepay", 120000, 0, null)).toBe(60000);
    expect(invoiceAmount("final", 120000, 60000, null)).toBe(60000);
    expect(invoiceAmount("final", 120000, 120000, null)).toBe(0);
    expect(invoiceAmount("custom", 120000, 0, 15000.555)).toBe(15000.56);
  });
  it("статусы Т-Бизнеса", () => {
    expect(mapInvoiceStatus("EXECUTED")).toBe("paid");
    expect(mapInvoiceStatus("SUBMITTED")).toBe("pending");
    expect(mapQrStatus("Paid")).toBe("paid");
    expect(mapQrStatus("Expired")).toBe("cancelled");
    expect(mapQrStatus("Failed")).toBe("failed");
    expect(mapQrStatus("Ready")).toBe("pending");
  });
});

describe("ЭДО СБИС: стороны документа", () => {
  it("организация — СвЮЛ с КПП, ИП — СвФЛ с ФИО", async () => {
    const { sbisParty } = await import("@/lib/edo/sbis");
    const { fioFrom } = await import("@/services/edo");
    expect(sbisParty({ inn: "4800000003", kpp: "480001001", name: "ООО «Ромашка»" })).toEqual({ СвЮЛ: { ИНН: "4800000003", КПП: "480001001", Название: "ООО «Ромашка»" } });
    expect(fioFrom("индивидуальный предприниматель Левонидских Евгений Олегович")).toEqual({ last: "Левонидских", first: "Евгений", middle: "Олегович" });
    expect(sbisParty({ inn: "481303880005", name: "ИП", fio: fioFrom("ИП Левонидских Евгений Олегович") })).toEqual({ СвФЛ: { ИНН: "481303880005", Фамилия: "Левонидских", Имя: "Евгений", Отчество: "Олегович" } });
  });
});
