import QRCode from "qrcode";
import { createPdf } from "./pdf";
import { gostPaymentString } from "@/domain/payment-qr";
import { rublesInWords } from "@/domain/money-words";

export interface InvoicePdfInput {
  number: number;
  date: Date;
  requisites: Record<string, string>;
  payer: { name: string; inn?: string | null; kpp?: string | null; address?: string | null };
  basis: string;
  items: { name: string; qty: number; unit: string; price: number }[];
  purpose: string;
}

const money = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Счёт на оплату в типовой форме: банковский блок, стороны, таблица, сумма прописью, QR «оплата по реквизитам». */
export async function invoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const r = input.requisites;
  const total = input.items.reduce((s, i) => s + i.qty * i.price, 0);
  const date = input.date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "long", year: "numeric" });
  const pdf = await createPdf(`Счёт № ${input.number}`);

  pdf.table(
    [
      [`${r.bankName ?? ""}\nБанк получателя`, `БИК\nСч. №`, `${r.bik ?? ""}\n${r.corrAccount ?? ""}`],
      [`ИНН ${r.inn ?? ""}\n${r.shortName ?? r.name ?? ""}\nПолучатель`, "Сч. №", r.account ?? ""],
    ],
    { widths: [0.55, 0.13, 0.32], size: 9 },
  );
  pdf.heading(`Счёт на оплату № ${input.number} от ${date}`, 14);
  pdf.rule();
  pdf.table(
    [
      ["Поставщик\n(Исполнитель):", `${r.name ?? ""}, ИНН ${r.inn ?? ""}, ОГРНИП ${r.ogrnip ?? ""}, ${r.address ?? ""}, тел.: ${r.phone ?? ""}`],
      ["Покупатель\n(Заказчик):", [input.payer.name, input.payer.inn && `ИНН ${input.payer.inn}`, input.payer.kpp && `КПП ${input.payer.kpp}`, input.payer.address].filter(Boolean).join(", ")],
      ["Основание:", input.basis],
    ],
    { borderless: true, widths: [0.2, 0.8], size: 9.5 },
  );
  pdf.table(
    [
      ["№", "Товары (работы, услуги)", "Кол-во", "Ед.", "Цена", "Сумма"],
      ...input.items.map((i, n) => [String(n + 1), i.name, String(i.qty), i.unit, money(i.price), money(i.qty * i.price)]),
    ],
    { header: true, widths: [0.06, 0.5, 0.09, 0.08, 0.135, 0.135], size: 9 },
  );
  pdf.table(
    [
      ["", "Итого:", money(total)],
      ["", "Без налога (НДС)", "—"],
      ["", "Всего к оплате:", money(total)],
    ],
    { borderless: true, widths: [0.55, 0.3, 0.15], size: 9.5 },
  );
  pdf.paragraph(`Всего наименований ${input.items.length}, на сумму ${money(total)} руб.`);
  pdf.paragraph(`${rublesInWords(total).replace(/^./, (c) => c.toUpperCase())}.`, 10.5);
  pdf.paragraph(`Назначение платежа: ${input.purpose}`, 9.5);
  pdf.rule();

  if (r.account && r.bik && r.inn) {
    const qr = await QRCode.toBuffer(
      gostPaymentString({ name: r.shortName ?? r.name ?? "", account: r.account, bankName: r.bankName ?? "", bik: r.bik, corrAccount: r.corrAccount ?? "", inn: r.inn }, total, input.purpose),
      { type: "png", width: 360, margin: 1, errorCorrectionLevel: "M" },
    );
    pdf.paragraph("Оплата по QR-коду: отсканируйте код в приложении банка — реквизиты, сумма и назначение платежа подставятся автоматически.", 9);
    await pdf.image(qr, 110);
  }
  pdf.spacer(10);
  pdf.paragraph(`Индивидуальный предприниматель  ____________________ ${r.signer ?? ""}`);
  return pdf.save();
}

/** PNG QR-кода «оплата по реквизитам» — для показа в личном кабинете (data URL). */
export async function paymentQrDataUrl(requisites: Record<string, string>, sumRub: number, purpose: string): Promise<string | null> {
  const r = requisites;
  if (!r.account || !r.bik || !r.inn) return null;
  return QRCode.toDataURL(gostPaymentString({ name: r.shortName ?? r.name ?? "", account: r.account, bankName: r.bankName ?? "", bik: r.bik, corrAccount: r.corrAccount ?? "", inn: r.inn }, sumRub, purpose), {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
