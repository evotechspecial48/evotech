import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { ForbiddenError } from "@/domain/rbac";
import { computeFinance, type FinanceRow } from "@/domain/finance";
import { isMonthKey, lastMonths, monthKey, monthRange, projectMonthDate } from "@/domain/months";

export type FinanceMonthRow = FinanceRow & { month: string };

/**
 * Финансы по месяцам для директора: выручка — подписанные договоры (по дате подписания),
 * проектировщики — оплата исполнителей по проектам месяца, ручные расходы — FinanceMonth.
 */
export async function getFinance(count = 6, now = new Date()): Promise<FinanceMonthRow[]> {
  const keys = lastMonths(count, now).reverse();
  const from = monthRange(keys[0]).from;
  const [contracts, projects, salesManagers, manual] = await Promise.all([
    db.contract.findMany({
      where: { status: "SIGNED", signedAt: { gte: from } },
      select: { amount: true, signedAt: true, isRevision: true, lead: { select: { managerId: true } }, project: { select: { salesManagerId: true } } },
    }),
    db.project.findMany({
      where: { members: { some: { fee: { not: null } } } },
      select: { createdAt: true, contracts: { where: { status: { not: "CANCELLED" } }, select: { signedAt: true } }, members: { select: { fee: true } } },
    }),
    db.user.findMany({ where: { role: "SALES_MANAGER", status: { not: "BLOCKED" } }, select: { id: true } }),
    db.financeMonth.findMany({ where: { month: { in: keys } } }),
  ]);

  const revenue = new Map<string, number>();
  const managerBase = new Map<string, Map<string, number>>(); // месяц → менеджер → база
  for (const c of contracts) {
    const m = monthKey(c.signedAt!);
    revenue.set(m, (revenue.get(m) ?? 0) + c.amount);
    const managerId = c.project?.salesManagerId ?? c.lead?.managerId;
    if (managerId && !c.isRevision) {
      const per = managerBase.get(m) ?? new Map<string, number>();
      per.set(managerId, (per.get(managerId) ?? 0) + c.amount);
      managerBase.set(m, per);
    }
  }
  const designers = new Map<string, number>();
  for (const p of projects) {
    const m = monthKey(projectMonthDate(p));
    designers.set(m, (designers.get(m) ?? 0) + p.members.reduce((s, x) => s + (x.fee ?? 0), 0));
  }
  const manualBy = new Map(manual.map((r) => [r.month, r]));
  return keys.map((month) => {
    const per = managerBase.get(month);
    const x = manualBy.get(month);
    return {
      month,
      ...computeFinance({
        revenue: revenue.get(month) ?? 0,
        designers: designers.get(month) ?? 0,
        managerBases: salesManagers.map((u) => per?.get(u.id) ?? 0),
        sro: x?.sro ?? 0,
        ads: x?.ads ?? 0,
        adsPlatforms: x?.adsPlatforms ?? 0,
        other: x?.other ?? 0,
      }),
    };
  });
}

/** Ручные расходы месяца (директор). */
export async function saveFinanceMonth(user: SessionUser, month: string, v: { sro: number; ads: number; adsPlatforms: number; other: number }) {
  if (user.role !== "DIRECTOR") throw new ForbiddenError("Расходы вносит директор");
  if (!isMonthKey(month)) throw new UserError("Выберите месяц");
  for (const [k, n] of Object.entries(v)) if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new UserError("Суммы — целые числа от 0", { [k]: "Неверная сумма" });
  const data = { sro: Math.round(v.sro), ads: Math.round(v.ads), adsPlatforms: Math.round(v.adsPlatforms), other: Math.round(v.other), updatedById: user.id };
  await db.financeMonth.upsert({ where: { month }, create: { month, ...data }, update: data });
  await audit({ actorId: user.id, action: "finance.update", entityType: "FinanceMonth", entityId: month, meta: data });
}
