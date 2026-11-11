// Общие функции импорта таблицы учёта (Google Таблицы → CSV): разбор CSV, сумм, телефонов,
// заказчики и проектировщики. Используются scripts/import-sheet.ts и scripts/import-closed.ts.

import { db } from "../src/lib/db";

// ---------- CSV ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.map((r) => r.map((v) => v.replace(/\s+/g, " ").trim()));
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const isMessenger = (v: string) => /^(макс|max|тг|телега|telegram|whatsapp)$/i.test(v);

export function phone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 10) return `+7${d}`;
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) return `+7${d.slice(1)}`;
  return null;
}

/** «1 086 000» → 1086000; «80000+2400» → 82400; «2100(200р/т откат)» → 2100. */
export function money(v: string): number | null {
  if (!v) return null;
  const plus = v.split("+").map((p) => Number((p.match(/[\d\s]+/)?.[0] ?? "").replace(/\s/g, "")));
  const sum = plus.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  return sum > 0 ? sum : null;
}

export function translit(s: string): string {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya" };
  return s
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export const normName = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[«»"()]/g, "").replace(/\s+/g, " ").trim();

/** Исполнитель из таблицы → проектировщик (учётная запись без пароля до приглашения). */
export async function designer(name: string): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const email = `designer-${translit(clean)}@evotech.local`;
  const u = await db.user.upsert({ where: { email }, create: { email, name: clean, role: "DESIGNER", status: "INVITED", position: "Исполнитель (из таблицы учёта)" }, update: {} });
  return u.id;
}

/** Заказчик: по почте из таблицы или служебная почта по названию организации. */
export async function customer(name: string, emailRaw: string, phoneRaw: string): Promise<{ id: string; email: string }> {
  const email = isEmail(emailRaw) ? emailRaw.toLowerCase() : `client-${translit(name) || "noname"}@import.local`;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { id: existing.id, email };
  const u = await db.user.create({
    data: { email, name, role: "CUSTOMER", status: "INVITED", phone: phone(phoneRaw), company: /^(ООО|ИП|АО|ПАО|СП|ЗАО)\b/i.test(name) ? { create: { name } } : undefined },
  });
  return { id: u.id, email };
}

export function contractNumber(raw: string, client: string): string {
  const base = raw.replace(/\s+/g, " ").trim();
  // «спец 3» без номера основного договора — добавляем заказчика для уникальности
  return /^\d/.test(base) ? `Д-${base}` : `Д-${base} · ${client}`;
}

/** Дата начала по дате сдачи «23.10» и сроку в рабочих днях (без даты — таймер не запускается). */
export function startFromDeadline(deadline: string, days: number): Date | null {
  const m = deadline.match(/^(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(2026, Number(m[2]) - 1, Number(m[1]), 6));
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export const SCOPE_TYPE: [RegExp, string][] = [
  [/МАФ/i, "Малая архитектурная форма"],
  [/редакц/i, "Корректировка документации"],
  [/КЖ/i, "Железобетонные конструкции"],
  [/КМ|КМД/i, "Металлоконструкции"],
];
