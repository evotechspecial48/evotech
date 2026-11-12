// Импорт сводки «Проекты» из таблицы учёта (data/import/projects-sheet.csv) в FinanceMonth.
// Лист — блоки финансовых лет «EvoTech ГГГГ-ГГГГ» (июнь–май) с июня 2021; подпись года в листе может повторяться,
// поэтому год берётся по порядку блока. Прошедшие месяцы — факт (выручка, зарплаты, налог заменяют расчёт),
// текущий месяц — только ручные статьи (СРО, реклама, прочие), будущие пропускаются.
// Аренда, коммунальные, интернет и вложения входят в «Прочие расходы». Сверка: прибыль = строка «Прибыль» листа.
// Запуск: npx tsx scripts/import-finance-sheet.ts [--apply]

import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { monthKey } from "../src/domain/months";
import { parseCsv } from "./import-lib";

type Field = "revenue" | "designers" | "pm" | "managers" | "tax" | "sro" | "ads" | "adsPlatforms" | "other";

/** Строка листа → поле. «Налог/СРО» — общей суммой в налог. */
export function fieldOf(label: string): Field | null {
  const l = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (l === "выручка") return "revenue";
  if (/^з\/п (руководитель|руководитель \d)$/.test(l)) return "pm";
  if (l.startsWith("з/п")) return "designers"; // фрилансерам, штатная, проектировщики
  if (l === "менеджер") return "managers";
  if (l.startsWith("налог")) return "tax";
  if (l === "срo" || l === "сро") return "sro";
  if (l === "реклама") return "ads";
  if (l === "реклама площадки") return "adsPlatforms";
  if (/^(аренда|ком\. услуги|интернет|вложения|прочие расходы)$/.test(l)) return "other";
  return null; // прибыль, долги, пустые
}

const num = (v: string | undefined) => Number((v ?? "").replace(/\s/g, "").replace(",", ".")) || 0;

export interface SheetMonth extends Record<Field, number> {
  month: string;
  sheetProfit: number | null;
}

export function parseSheet(csv: string, startYear = 2021): SheetMonth[] {
  const out: SheetMonth[] = [];
  let block: SheetMonth[] | null = null;
  let n = 0;
  for (const row of parseCsv(csv)) {
    if (/^EvoTech/i.test(row[0] ?? "")) {
      const y = startYear + n++;
      block = Array.from({ length: 12 }, (_, i) => {
        const m = ((i + 5) % 12) + 1; // июнь…май
        return { month: `${m >= 6 ? y : y + 1}-${String(m).padStart(2, "0")}`, revenue: 0, designers: 0, pm: 0, managers: 0, tax: 0, sro: 0, ads: 0, adsPlatforms: 0, other: 0, sheetProfit: null };
      });
      out.push(...block);
      continue;
    }
    if (!block) continue;
    if (/^прибыль$/i.test((row[0] ?? "").trim())) block.forEach((b, i) => (b.sheetProfit = row[i + 1] ? num(row[i + 1]) : null));
    const f = fieldOf(row[0] ?? "");
    if (f) block.forEach((b, i) => (b[f] += num(row[i + 1])));
  }
  return out;
}

const profit = (m: SheetMonth) => m.revenue - m.designers - m.pm - m.managers - m.tax - m.sro - m.ads - m.adsPlatforms - m.other;

async function main() {
  const apply = process.argv.includes("--apply");
  const current = monthKey(new Date());
  const months = parseSheet(readFileSync("data/import/projects-sheet.csv", "utf8")).filter((m) => m.month <= current);
  console.table(months.map((m) => ({ месяц: m.month, выручка: m.revenue, проектировщики: m.designers, рп: m.pm, менеджер: m.managers, налог: m.tax, прибыль: profit(m), в_листе: m.sheetProfit, сверка: m.sheetProfit === null || m.sheetProfit === profit(m) ? "" : "РАСХОЖДЕНИЕ" })));
  if (!apply) return console.log("Пробный прогон — для записи добавьте --apply");
  for (const m of months) {
    const manual = { sro: m.sro, ads: m.ads, adsPlatforms: m.adsPlatforms, other: m.other };
    // Текущий месяц ещё идёт — выручку и зарплаты считает система по договорам
    const fact = m.month < current ? { revenue: m.revenue, designers: m.designers, pm: m.pm, managers: m.managers, tax: m.tax } : {};
    await db.financeMonth.upsert({ where: { month: m.month }, create: { month: m.month, ...manual, ...fact }, update: { ...manual, ...fact } });
  }
  console.log(`Записано месяцев: ${months.length} (факт: ${months.filter((m) => m.month < current).length})`);
}

if (process.argv[1]?.includes("import-finance-sheet")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
