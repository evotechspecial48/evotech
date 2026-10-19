import { db } from "./db";

/** Ограничение частоты в окне (защита от перебора паролей и спама). Хранится в БД — работает при нескольких инстансах. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfter: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || row.windowStart < windowStart) {
    await db.rateLimit.upsert({ where: { key }, create: { key, count: 1, windowStart: now }, update: { count: 1, windowStart: now } });
    return { ok: true, retryAfter: 0 };
  }
  if (row.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((row.windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000) };
  }
  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return { ok: true, retryAfter: 0 };
}
