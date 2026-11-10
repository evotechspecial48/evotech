import { db } from "@/lib/db";
import { computeTimer } from "@/domain/timer";
import { holidays } from "./timer";
import { lastMonths, monthKey, monthRange, projectMonthDate } from "@/domain/months";

export interface Analytics {
  periodDays: number;
  newLeads: number;
  leadsBySource: { source: string; count: number }[];
  leadsByStatus: { status: string; count: number }[];
  conversion: number;
  projectsByStatus: { status: string; count: number }[];
  designerLoad: { name: string; projects: number; openStages: number }[];
  avgStageDays: { code: string; days: number; samples: number }[];
  returnsCount: number;
  atRisk: { id: string; number: number; title: string; remainingDays: number; state: string }[];
  payments: { status: string; count: number; amount: number }[];
  paidTotal: number;
  quickOrders: { status: string; count: number }[];
}

export interface MonthRow {
  month: string;
  leads: number;
  lost: number;
  contracts: number;
  contractsAmount: number;
  projectsStarted: number;
  projectsCompleted: number;
  paid: number;
}

/**
 * Итоги по месяцам (московское время), от текущего месяца назад.
 * Договоры — по дате подписания; начатые проекты — по месяцу проекта (договор, иначе создание);
 * завершённые — по дате перехода в «Завершён»; оплаты — по дате зачисления (₽).
 */
export async function getMonthlyStats(count = 12, now = new Date()): Promise<MonthRow[]> {
  const keys = lastMonths(count, now);
  const since = monthRange(keys[keys.length - 1]).from;
  const [leads, lost, contracts, projects, completed, paid] = await Promise.all([
    db.lead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.statusChange.findMany({ where: { entityType: "Lead", toStatus: "lost", createdAt: { gte: since } }, select: { createdAt: true } }),
    db.contract.findMany({ where: { status: "SIGNED", signedAt: { gte: since }, quickOrderId: null }, select: { signedAt: true, amount: true } }),
    db.project.findMany({ select: { createdAt: true, contracts: { where: { status: { not: "CANCELLED" } }, select: { signedAt: true } } } }),
    db.statusChange.findMany({ where: { entityType: "Project", toStatus: "COMPLETED", createdAt: { gte: since } }, select: { entityId: true, createdAt: true } }),
    db.payment.findMany({ where: { status: "paid", paidAt: { gte: since } }, select: { paidAt: true, amount: true } }),
  ]);
  const rows = new Map<string, MonthRow>(keys.map((month) => [month, { month, leads: 0, lost: 0, contracts: 0, contractsAmount: 0, projectsStarted: 0, projectsCompleted: 0, paid: 0 }]));
  const at = (d: Date) => rows.get(monthKey(d));
  for (const l of leads) {
    const r = at(l.createdAt);
    if (r) r.leads++;
  }
  for (const l of lost) {
    const r = at(l.createdAt);
    if (r) r.lost++;
  }
  for (const c of contracts) {
    const r = at(c.signedAt!);
    if (r) {
      r.contracts++;
      r.contractsAmount += c.amount;
    }
  }
  for (const p of projects) {
    const r = at(projectMonthDate(p));
    if (r) r.projectsStarted++;
  }
  // Проект, завершённый, возвращённый в работу и завершённый снова, учитывается по последнему завершению
  const lastCompletion = new Map<string, Date>();
  for (const c of completed) if (!lastCompletion.has(c.entityId) || lastCompletion.get(c.entityId)! < c.createdAt) lastCompletion.set(c.entityId, c.createdAt);
  for (const d of lastCompletion.values()) {
    const r = at(d);
    if (r) r.projectsCompleted++;
  }
  for (const p of paid) {
    const r = at(p.paidAt!);
    if (r) r.paid += p.amount / 100;
  }
  return keys.map((k) => rows.get(k)!);
}

export async function getAnalytics(periodDays = 30): Promise<Analytics> {
  const since = new Date(Date.now() - periodDays * 86400_000);
  const [newLeads, bySource, byStatus, decided, won, projByStatus, designers, completedStages, returns, timers, payments, qos] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: since } } }),
    db.lead.groupBy({ by: ["source"], _count: true, where: { createdAt: { gte: since } } }),
    db.lead.groupBy({ by: ["status"], _count: true }),
    db.lead.count({ where: { status: { in: ["won", "lost"] } } }),
    db.lead.count({ where: { status: "won" } }),
    db.project.groupBy({ by: ["status"], _count: true }),
    db.user.findMany({
      where: { role: "DESIGNER", status: "ACTIVE" },
      select: { name: true, memberships: { where: { project: { status: "ACTIVE" } }, select: { project: { select: { stages: { where: { status: { in: ["in_progress", "internal_review", "changes_requested"] } }, select: { id: true } } } } } } },
    }),
    db.projectStage.findMany({ where: { completedAt: { not: null }, startedAt: { not: null } }, select: { code: true, startedAt: true, completedAt: true } }),
    db.approval.count({ where: { decision: "CHANGES_REQUESTED", createdAt: { gte: since } } }),
    db.timer.findMany({ where: { startedAt: { not: null }, completedAt: null }, include: { pauses: true, project: { select: { id: true, number: true, title: true, status: true } } } }),
    db.payment.groupBy({ by: ["status"], _count: true, _sum: { amount: true } }),
    db.quickOrder.groupBy({ by: ["status"], _count: true }),
  ]);

  const stageAgg = new Map<string, { total: number; n: number }>();
  for (const s of completedStages) {
    const d = (s.completedAt!.getTime() - s.startedAt!.getTime()) / 86400_000;
    const a = stageAgg.get(s.code) ?? { total: 0, n: 0 };
    stageAgg.set(s.code, { total: a.total + d, n: a.n + 1 });
  }
  const hol = await holidays();
  const atRisk = timers
    .filter((t) => t.project.status === "ACTIVE")
    .map((t) => ({ t, v: computeTimer({ ...t, holidays: hol }) }))
    .filter(({ v }) => v.warning || v.state === "overdue" || v.remainingDays < 3)
    .map(({ t, v }) => ({ id: t.project.id, number: t.project.number, title: t.project.title, remainingDays: v.remainingDays, state: v.state }))
    .sort((a, b) => a.remainingDays - b.remainingDays);

  const pay = payments.map((p) => ({ status: p.status, count: p._count, amount: (p._sum.amount ?? 0) / 100 }));
  return {
    periodDays,
    newLeads,
    leadsBySource: bySource.map((s) => ({ source: s.source, count: s._count })).sort((a, b) => b.count - a.count),
    leadsByStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    conversion: decided ? Math.round((won / decided) * 100) : 0,
    projectsByStatus: projByStatus.map((s) => ({ status: s.status, count: s._count })),
    designerLoad: designers.map((d) => ({
      name: d.name,
      projects: d.memberships.length,
      openStages: d.memberships.reduce((s, m) => s + m.project.stages.length, 0),
    })),
    avgStageDays: [...stageAgg.entries()].map(([code, a]) => ({ code, days: Math.round((a.total / a.n) * 10) / 10, samples: a.n })),
    returnsCount: returns,
    atRisk,
    payments: pay,
    paidTotal: pay.find((p) => p.status === "paid")?.amount ?? 0,
    quickOrders: qos.map((q) => ({ status: q.status, count: q._count })),
  };
}
