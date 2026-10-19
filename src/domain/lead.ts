// Воронка заявок: допустимые переходы статусов.

export const LEAD_FLOW = [
  "new",
  "qualification",
  "tz_preparation",
  "commercial_offer",
  "contract_approval",
  "awaiting_signature",
  "won",
] as const;

export type LeadStatusCode = (typeof LEAD_FLOW)[number] | "lost";

export type LeadTransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Правила:
 * - вперёд на любой следующий шаг воронки до «Ожидает подписания» и назад на любой предыдущий;
 * - «Договор заключён» (won) — только через конвертацию в проект при подписанном договоре;
 * - «Отказ» (lost) — из любого незавершённого статуса, причина обязательна;
 * - из «Отказ» можно вернуть заявку в «Новая» (повторная работа).
 */
export function checkLeadTransition(
  from: LeadStatusCode,
  to: LeadStatusCode,
  opts: { reason?: string; viaConversion?: boolean } = {},
): LeadTransitionCheck {
  if (from === to) return { ok: false, reason: "Заявка уже в этом статусе" };
  if (from === "won") return { ok: false, reason: "Заявка уже конвертирована в проект" };
  if (to === "lost") {
    if (!opts.reason || opts.reason.trim().length < 3) {
      return { ok: false, reason: "Укажите причину отказа" };
    }
    return { ok: true };
  }
  if (from === "lost") {
    return to === "new" ? { ok: true } : { ok: false, reason: "Отказную заявку можно только вернуть в статус «Новая»" };
  }
  if (to === "won") {
    return opts.viaConversion
      ? { ok: true }
      : { ok: false, reason: "Статус «Договор заключён» устанавливается при создании проекта" };
  }
  return { ok: true };
}

export function nextLeadStatus(from: LeadStatusCode): LeadStatusCode | null {
  const idx = LEAD_FLOW.indexOf(from as (typeof LEAD_FLOW)[number]);
  if (idx < 0 || idx >= LEAD_FLOW.length - 2) return null;
  return LEAD_FLOW[idx + 1];
}
