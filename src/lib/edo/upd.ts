import { randomUUID } from "node:crypto";

// УПД со статусом «2» (передаточный документ, без счёта-фактуры): исполнитель на АУСН, НДС не облагается.
// Формат ФНС 5.03 (приказ ЕД-7-26/970@), файл ON_NSCHFDOPPR в кодировке windows-1251.
// Идентификаторы участников ЭДО в имени файла не заполняются — их подставляет Saby при отправке.
// shortcut: XML собран по формату без проверки XSD, первую отправку проверить в Saby (карточка должна открыться как УПД).

export interface UpdParty {
  inn: string;
  kpp?: string | null;
  name: string;
  fio?: { last: string; first: string; middle?: string } | null;
  address?: string | null;
}

export interface UpdInput {
  number: string;
  date: Date;
  seller: UpdParty;
  buyer: UpdParty;
  rows: { title: string; amount: number }[];
  basis: { name: string; number: string; date: Date }[];
  signer: { last: string; first: string; middle?: string };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const d = (x: Date) => x.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
const sum = (n: number) => n.toFixed(2);
const attrs = (o: Record<string, string | null | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v)
    .map(([k, v]) => ` ${k}="${esc(v!)}"`)
    .join("");
const fio = (f: { last: string; first: string; middle?: string }) => `<ФИО${attrs({ Фамилия: f.last, Имя: f.first, Отчество: f.middle })}/>`;

function party(p: UpdParty): string {
  const id =
    p.inn.length === 10
      ? `<СвЮЛУч${attrs({ НаимОрг: p.name, ИННЮЛ: p.inn, КПП: p.kpp })}/>`
      : `<СвИП${attrs({ ИННФЛ: p.inn })}>${fio(p.fio ?? { last: p.name, first: "-" })}</СвИП>`;
  const address = p.address ? `<Адрес><АдрИнф КодСтр="643" НаимСтран="Россия"${attrs({ АдрТекст: p.address })}/></Адрес>` : "";
  return `<ИдСв>${id}</ИдСв>${address}`;
}

const DOC_NAME = "Документ об отгрузке товаров (выполнении работ), передаче имущественных прав (документ об оказании услуг)";

export function buildUpdXml(input: UpdInput): { fileName: string; xml: string } {
  const ymd = input.date.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }).replace(/-/g, "");
  const fileName = `ON_NSCHFDOPPR___${ymd}_${randomUUID()}_0_0_0_0_0_00`;
  const time = input.date.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour12: false }).replace(/:/g, ".");
  const total = input.rows.reduce((s, r) => s + r.amount, 0);
  const rows = input.rows
    .map(
      (r, i) =>
        `<СведТов${attrs({ НомСтр: String(i + 1), НаимТов: r.title, ОКЕИ_Тов: "796", НаимЕдИзм: "шт", КолТов: "1", ЦенаТов: sum(r.amount), СтТовБезНДС: sum(r.amount), НалСт: "без НДС", СтТовУчНал: sum(r.amount) })}>` +
        `<ДопСведТов ПрТовРаб="3"/><Акциз><БезАкциз>без акциза</БезАкциз></Акциз><СумНал><БезНДС>без НДС</БезНДС></СумНал></СведТов>`,
    )
    .join("");
  const basis = input.basis.map((b) => `<ОснПер${attrs({ РеквНаимДок: b.name, РеквНомерДок: b.number, РеквДатаДок: d(b.date) })}/>`).join("");
  const xml =
    `<?xml version="1.0" encoding="windows-1251"?>\n` +
    `<Файл${attrs({ ИдФайл: fileName, ВерсФорм: "5.03", ВерсПрог: "EvoTech 1.0" })}>` +
    `<Документ${attrs({ КНД: "1115131", Функция: "ДОП", ПоФактХЖ: DOC_NAME, НаимДокОпр: DOC_NAME, ДатаИнфПр: d(input.date), ВремИнфПр: time, НаимЭконСубСост: input.seller.name })}>` +
    `<СвСчФакт${attrs({ НомерДок: input.number, ДатаДок: d(input.date) })}>` +
    `<СвПрод>${party(input.seller)}</СвПрод><СвПокуп>${party(input.buyer)}</СвПокуп><ДенИзм КодОКВ="643" НаимОКВ="Российский рубль"/>` +
    `</СвСчФакт>` +
    `<ТаблСчФакт>${rows}<ВсегоОпл${attrs({ СтТовБезНДСВсего: sum(total), СтТовУчНалВсего: sum(total) })}><СумНалВсего><БезНДС>без НДС</БезНДС></СумНалВсего></ВсегоОпл></ТаблСчФакт>` +
    `<СвПродПер><СвПер${attrs({ СодОпер: "Работы выполнены в полном объёме", ДатаПер: d(input.date) })}>${basis}</СвПер></СвПродПер>` +
    `<Подписант${attrs({ Должн: "Индивидуальный предприниматель", ТипПодпис: "1", СпосПодтПолном: "1" })}>${fio(input.signer)}</Подписант>` +
    `</Документ></Файл>`;
  return { fileName, xml };
}

/** UTF-16 → windows-1251: латиница как есть, кириллица и типографские знаки по таблице, прочее — «?». */
export function toCp1251(s: string): Buffer {
  const extra: Record<string, number> = { "Ё": 0xa8, "ё": 0xb8, "№": 0xb9, "«": 0xab, "»": 0xbb, "—": 0x97, "–": 0x96, "“": 0x93, "”": 0x94, "„": 0x84, "…": 0x85, " ": 0xa0 };
  const out = Buffer.alloc(s.length);
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out[n++] = c < 0x80 ? c : c >= 0x410 && c <= 0x44f ? c - 0x350 : (extra[ch] ?? 0x3f);
  }
  return out.subarray(0, n);
}
