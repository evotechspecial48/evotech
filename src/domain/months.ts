// Месяцы для группировки проектов и аналитики (по московскому времени).

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MSK_OFFSET_MS = 3 * 3600 * 1000;

/** Ключ месяца «ГГГГ-ММ». */
export function monthKey(d: Date): string {
  const msk = new Date(d.getTime() + MSK_OFFSET_MS);
  return `${msk.getUTCFullYear()}-${String(msk.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** «Октябрь 2026». */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Границы месяца [начало, начало следующего) в UTC. */
export function monthRange(key: string): { from: Date; to: Date } {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - MSK_OFFSET_MS), to: new Date(Date.UTC(y, m, 1) - MSK_OFFSET_MS) };
}

/** Последние n месяцев, от текущего назад: ["2026-11", "2026-10", …]. */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Дата, по которой проект относится к месяцу: подписание договора, иначе создание проекта. */
export function projectMonthDate(p: { createdAt: Date; contracts: { signedAt: Date | null }[] }): Date {
  const signed = p.contracts.map((c) => c.signedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  return signed[0] ?? p.createdAt;
}
