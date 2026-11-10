// QR-код «оплата по реквизитам» (ГОСТ Р 56042-2014, формат ST00012): распознаётся приложениями банков РФ,
// подставляет получателя, счёт, сумму и назначение. Не требует подключения к API банка.

export interface PayeeRequisites {
  name: string;
  account: string;
  bankName: string;
  bik: string;
  corrAccount: string;
  inn: string;
}

const clean = (v: string) => v.replace(/[|\r\n]/g, " ").replace(/\s+/g, " ").trim();

/** Строка для QR-кода; sumRub — сумма в рублях. */
export function gostPaymentString(payee: PayeeRequisites, sumRub: number, purpose: string): string {
  const fields: [string, string][] = [
    ["Name", payee.name],
    ["PersonalAcc", payee.account],
    ["BankName", payee.bankName],
    ["BIC", payee.bik],
    ["CorrespAcc", payee.corrAccount],
    ["PayeeINN", payee.inn],
    ["Sum", String(Math.round(sumRub * 100))],
    ["Purpose", purpose],
  ];
  return ["ST00012", ...fields.map(([k, v]) => `${k}=${clean(v)}`)].join("|");
}
