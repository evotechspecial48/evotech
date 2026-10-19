import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { UserError } from "@/lib/errors";
import { autoPauseDecision, computeTimer, type TimerView } from "@/domain/timer";

type Tx = Prisma.TransactionClient;

export async function holidays(): Promise<string[]> {
  const s = await db.setting.findUnique({ where: { key: "calendar.holidays" } });
  return Array.isArray(s?.value) ? (s!.value as string[]) : [];
}

export async function timerView(projectId: string, now = new Date()): Promise<(TimerView & { durationDays: number; mode: "CALENDAR" | "WORKING"; startedAt: Date | null }) | null> {
  const timer = await db.timer.findUnique({ where: { projectId }, include: { pauses: true } });
  if (!timer) return null;
  const view = computeTimer({ ...timer, holidays: await holidays() }, now);
  return { ...view, durationDays: timer.durationDays, mode: timer.mode, startedAt: timer.startedAt };
}

/** Количество объектов, по которым ожидается действие заказчика. */
async function pendingCustomerItems(tx: Tx, projectId: string): Promise<{ count: number; reason: string }> {
  const [requests, stages] = await Promise.all([
    tx.customerRequest.findMany({ where: { projectId, status: "OPEN", pausesTimer: true }, select: { question: true } }),
    tx.projectStage.findMany({ where: { projectId, status: "customer_review" }, select: { title: true } }),
  ]);
  const reason = requests.length
    ? `Ожидается ответ заказчика: «${requests[0].question.slice(0, 80)}»`
    : stages.length
      ? `На согласовании у заказчика: ${stages[0].title.toLowerCase()}`
      : "";
  return { count: requests.length + stages.length, reason };
}

/**
 * Синхронизация автоматической паузы с состоянием проекта. Вызывается после любых
 * изменений запросов и статусов этапов. Идемпотентна.
 */
export async function syncAutoPause(projectId: string, actorId: string | null, tx: Tx = db): Promise<"opened" | "closed" | null> {
  const timer = await tx.timer.findUnique({ where: { projectId }, include: { pauses: { where: { endedAt: null } } } });
  if (!timer || timer.completedAt) return null;
  const openAuto = timer.pauses.find((p) => p.kind === "AUTO");
  const pending = await pendingCustomerItems(tx, projectId);
  const decision = autoPauseDecision(pending.count, !!openAuto, !!timer.startedAt);
  const now = new Date();
  if (decision === "open") {
    await tx.timerPause.create({ data: { timerId: timer.id, kind: "AUTO", reason: pending.reason, initiatorId: actorId, startedAt: now } });
    await tx.timer.update({ where: { id: timer.id }, data: { state: "paused_waiting_customer" } });
    await audit({ actorId, action: "timer.pause", entityType: "Timer", entityId: timer.id, projectId, meta: { reason: pending.reason, kind: "AUTO" } }, tx);
    return "opened";
  }
  if (decision === "close" && openAuto) {
    await tx.timerPause.update({ where: { id: openAuto.id }, data: { endedAt: now, resumedById: actorId, resumeNote: "Получены данные от заказчика" } });
    const stillPaused = timer.pauses.some((p) => p.kind === "MANUAL");
    await tx.timer.update({ where: { id: timer.id }, data: { state: stillPaused ? "paused_waiting_customer" : "running" } });
    await audit({ actorId, action: "timer.resume", entityType: "Timer", entityId: timer.id, projectId, meta: { kind: "AUTO" } }, tx);
    return "closed";
  }
  return null;
}

export async function notifyTimerChange(projectId: string, change: "opened" | "closed" | null) {
  if (!change) return;
  const p = await db.project.findUnique({ where: { id: projectId }, select: { title: true, number: true, managerId: true, customerId: true, members: { select: { userId: true } } } });
  if (!p) return;
  const ids = [p.managerId, p.customerId, ...p.members.map((m) => m.userId)];
  await notify(
    ids,
    change === "opened" ? "timer.paused" : "timer.resumed",
    change === "opened" ? `Таймер проекта №${p.number} приостановлен` : `Таймер проекта №${p.number} возобновлён`,
    change === "opened" ? `Отсчёт срока остановлен до получения данных от заказчика. Проект «${p.title}».` : `Отсчёт срока продолжен. Проект «${p.title}».`,
    `/cabinet/projects/${projectId}`,
    { email: false },
  );
}

export async function startTimer(projectId: string, actorId: string, startedAt = new Date()) {
  const timer = await db.timer.findUnique({ where: { projectId } });
  if (!timer) throw new UserError("Таймер проекта не создан");
  if (timer.startedAt) throw new UserError("Таймер уже запущен");
  await db.timer.update({ where: { id: timer.id }, data: { startedAt, state: "running" } });
  await audit({ actorId, action: "timer.start", entityType: "Timer", entityId: timer.id, projectId });
  await syncAutoPause(projectId, actorId);
}

export async function manualPause(projectId: string, actorId: string, reason: string) {
  if (reason.trim().length < 3) throw new UserError("Укажите причину остановки таймера");
  const timer = await db.timer.findUnique({ where: { projectId }, include: { pauses: { where: { endedAt: null } } } });
  if (!timer?.startedAt) throw new UserError("Таймер не запущен");
  if (timer.completedAt) throw new UserError("Проект завершён");
  if (timer.pauses.some((p) => p.kind === "MANUAL")) throw new UserError("Таймер уже остановлен вручную");
  await db.$transaction([
    db.timerPause.create({ data: { timerId: timer.id, kind: "MANUAL", reason, initiatorId: actorId, startedAt: new Date() } }),
    db.timer.update({ where: { id: timer.id }, data: { state: "paused_waiting_customer" } }),
  ]);
  await audit({ actorId, action: "timer.pause", entityType: "Timer", entityId: timer.id, projectId, meta: { reason, kind: "MANUAL" } });
  await notifyTimerChange(projectId, "opened");
}

export async function manualResume(projectId: string, actorId: string, note: string) {
  const timer = await db.timer.findUnique({ where: { projectId }, include: { pauses: { where: { endedAt: null } } } });
  const pause = timer?.pauses.find((p) => p.kind === "MANUAL");
  if (!timer || !pause) throw new UserError("Нет активной ручной паузы");
  await db.$transaction(async (tx) => {
    await tx.timerPause.update({ where: { id: pause.id }, data: { endedAt: new Date(), resumedById: actorId, resumeNote: note || null } });
    const otherOpen = timer.pauses.some((p) => p.id !== pause.id);
    await tx.timer.update({ where: { id: timer.id }, data: { state: otherOpen ? "paused_waiting_customer" : "running" } });
  });
  await audit({ actorId, action: "timer.resume", entityType: "Timer", entityId: timer.id, projectId, meta: { kind: "MANUAL", note } });
  await notifyTimerChange(projectId, "closed");
}

/** Удаление паузы — только с административным правом, с обязательной причиной и записью в журнал. */
export async function deletePause(pauseId: string, actorId: string, reason: string) {
  if (reason.trim().length < 5) throw new UserError("Укажите причину удаления записи о паузе");
  const pause = await db.timerPause.findUnique({ where: { id: pauseId }, include: { timer: true } });
  if (!pause) throw new UserError("Пауза не найдена");
  await db.timerPause.delete({ where: { id: pauseId } });
  await audit({
    actorId,
    action: "timer.pause_deleted",
    entityType: "TimerPause",
    entityId: pauseId,
    projectId: pause.timer.projectId,
    meta: { reason, pause: { startedAt: pause.startedAt.toISOString(), endedAt: pause.endedAt?.toISOString() ?? null, reasonText: pause.reason } },
  });
}

export async function updateDeadline(projectId: string, actorId: string, durationDays: number, mode: "CALENDAR" | "WORKING", startedAt: Date | null, reason: string) {
  if (durationDays < 1 || durationDays > 730) throw new UserError("Срок должен быть от 1 до 730 дней");
  if (reason.trim().length < 3) throw new UserError("Укажите основание изменения сроков");
  const timer = await db.timer.findUnique({ where: { projectId } });
  if (!timer) throw new UserError("Таймер не найден");
  await db.timer.update({ where: { id: timer.id }, data: { durationDays, mode, ...(startedAt ? { startedAt } : {}) } });
  await audit({
    actorId,
    action: "timer.update",
    entityType: "Timer",
    entityId: timer.id,
    projectId,
    meta: { from: { durationDays: timer.durationDays, mode: timer.mode }, to: { durationDays, mode }, reason },
  });
}

/** Обновляет сохранённое состояние таймеров и рассылает предупреждения о сроках (вызывается воркером). */
export async function refreshTimers(now = new Date()): Promise<number> {
  const timers = await db.timer.findMany({
    where: { startedAt: { not: null }, completedAt: null },
    include: { pauses: true, project: { select: { id: true, number: true, title: true, managerId: true, members: { select: { userId: true } } } } },
  });
  const hol = await holidays();
  let warned = 0;
  for (const t of timers) {
    const v = computeTimer({ ...t, holidays: hol }, now);
    if (v.state !== t.state) await db.timer.update({ where: { id: t.id }, data: { state: v.state } });
    if ((v.warning || v.state === "overdue") && !t.warnedAt) {
      await db.timer.update({ where: { id: t.id }, data: { warnedAt: now } });
      await notify(
        [t.project.managerId, ...t.project.members.map((m) => m.userId)],
        "deadline.warning",
        v.state === "overdue" ? `Проект №${t.project.number} просрочен` : `Приближается срок проекта №${t.project.number}`,
        `«${t.project.title}»: осталось ${v.remainingDays.toFixed(1)} дн.`,
        `/cabinet/projects/${t.project.id}`,
      );
      warned++;
    }
  }
  return warned;
}
