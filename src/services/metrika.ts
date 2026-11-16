import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Офлайн-конверсии Яндекс Метрики: события, которые происходят в кабинете у менеджера, а не у посетителя сайта.
// Посетитель связан с заявкой через ClientID (cookie _ym_uid, сохраняется в lead.utm.ymClientId при отправке формы).
// Воркер находит события, складывает их в MetrikaConversion и загружает пакетом через API управления Метрикой.

/** «Квалифицированная заявка» — дошла до коммерческого предложения или дальше. */
export const QUALIFIED_STATUSES = ["commercial_offer", "contract_approval", "awaiting_signature", "contract_signed", "won"];
const LOOKBACK_DAYS = 120;

/** Новые конверсии по заявкам с ClientID: квалификация (первый переход в статус из списка) и подписанный договор. */
export async function collectConversions(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000);
  const leads = (await db.lead.findMany({ where: { createdAt: { gte: since }, source: { in: ["site_form", "site_calculator", "site_contact"] } }, select: { id: true, utm: true } }))
    .map((l) => ({ id: l.id, clientId: (l.utm as Record<string, unknown> | null)?.ymClientId }))
    .filter((l): l is { id: string; clientId: string } => typeof l.clientId === "string");
  if (!leads.length) return 0;
  const ids = leads.map((l) => l.id);
  const client = new Map(leads.map((l) => [l.id, l.clientId]));
  const [changes, contracts] = await Promise.all([
    db.statusChange.findMany({ where: { entityType: "Lead", entityId: { in: ids }, toStatus: { in: QUALIFIED_STATUSES } }, orderBy: { createdAt: "asc" }, select: { entityId: true, createdAt: true } }),
    db.contract.findMany({ where: { leadId: { in: ids }, status: "SIGNED", signedAt: { not: null } }, orderBy: { signedAt: "asc" }, select: { leadId: true, signedAt: true, amount: true } }),
  ]);
  const rows = new Map<string, { leadId: string; goal: string; clientId: string; at: Date; price: number | null }>();
  for (const c of changes) if (!rows.has(`${c.entityId}:q`)) rows.set(`${c.entityId}:q`, { leadId: c.entityId, goal: "qualified_lead", clientId: client.get(c.entityId)!, at: c.createdAt, price: null });
  for (const c of contracts) {
    if (rows.has(`${c.leadId}:c`)) continue;
    rows.set(`${c.leadId}:c`, { leadId: c.leadId!, goal: "contract_signed", clientId: client.get(c.leadId!)!, at: c.signedAt!, price: c.amount });
    // Договор без отметки квалификации (подписан сразу) — заявка тоже квалифицированная
    if (!rows.has(`${c.leadId}:q`)) rows.set(`${c.leadId}:q`, { leadId: c.leadId!, goal: "qualified_lead", clientId: client.get(c.leadId!)!, at: c.signedAt!, price: null });
  }
  const res = await db.metrikaConversion.createMany({ data: [...rows.values()], skipDuplicates: true });
  return res.count;
}

/** CSV для загрузки: ClientId,Target,DateTime (unix),Price,Currency. */
export function conversionsCsv(rows: { clientId: string; goal: string; at: Date; price: number | null }[]): string {
  return ["ClientId,Target,DateTime,Price,Currency", ...rows.map((r) => [r.clientId, r.goal, Math.floor(r.at.getTime() / 1000), r.price ?? "", r.price ? "RUB" : ""].join(","))].join("\n") + "\n";
}

/** Загрузка неотправленных конверсий. Без номера счётчика или токена — копятся в базе до подключения. */
export async function uploadConversions(): Promise<number> {
  const counter = env.NEXT_PUBLIC_YM_ID;
  const token = env.YM_OAUTH_TOKEN;
  if (!counter || !token) return 0;
  const pending = await db.metrikaConversion.findMany({ where: { sentAt: null }, orderBy: { at: "asc" }, take: 500 });
  if (!pending.length) return 0;
  const form = new FormData();
  form.append("file", new Blob([conversionsCsv(pending)], { type: "text/csv" }), "conversions.csv");
  try {
    const res = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${counter}/offline_conversions/upload?client_id_type=CLIENT_ID`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Метрика ответила ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await db.metrikaConversion.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { sentAt: new Date(), error: null } });
    return pending.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.metrikaConversion.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { error: message.slice(0, 500) } });
    logger.warn("metrika.upload_failed", { count: pending.length, message });
    return 0;
  }
}

export async function syncMetrika(): Promise<{ collected: number; sent: number }> {
  return { collected: await collectConversions(), sent: await uploadConversions() };
}
