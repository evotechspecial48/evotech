// Таймер срока проекта. Чистые функции: расчёт ведётся по датам начала, паузам и режиму
// (календарные или рабочие дни). Паузы не учитываются в затраченном времени и
// сдвигают прогнозную дату завершения.

export type TimeModeT = "CALENDAR" | "WORKING";
export type TimerStateT = "not_started" | "running" | "paused_waiting_customer" | "completed" | "overdue";

export const DAY_MS = 24 * 60 * 60 * 1000;
// Расчёт календаря ведётся в московском времени (UTC+3, без перехода на летнее время).
export const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface PauseLike {
  startedAt: Date;
  endedAt: Date | null;
}

export interface TimerInput {
  startedAt: Date | null;
  durationDays: number;
  mode: TimeModeT;
  completedAt: Date | null;
  pauses: PauseLike[];
  /** Праздничные нерабочие дни в формате YYYY-MM-DD (только для режима WORKING). */
  holidays?: string[];
}

export interface TimerView {
  state: TimerStateT;
  /** Затрачено «расчётных» дней (рабочих или календарных) без учёта пауз. */
  elapsedDays: number;
  /** Осталось расчётных дней; отрицательное значение — просрочка. */
  remainingDays: number;
  pausedMs: number;
  pauseCount: number;
  activePause: PauseLike | null;
  /** Договорная дата окончания без учёта пауз. */
  contractualEnd: Date | null;
  /** Прогнозная дата окончания с учётом пауз. */
  forecastEnd: Date | null;
  warning: boolean;
  percentUsed: number;
}

function localDayStart(ts: number): number {
  return Math.floor((ts + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
}

function localDateKey(ts: number): string {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export function isCountedDay(ts: number, mode: TimeModeT, holidays: Set<string>): boolean {
  if (mode === "CALENDAR") return true;
  const weekday = new Date(ts + TZ_OFFSET_MS).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(localDateKey(ts));
}

/** Сколько «расчётного» времени (мс) в интервале [from, to). */
export function countedMs(from: number, to: number, mode: TimeModeT, holidays: Set<string> = new Set()): number {
  if (to <= from) return 0;
  if (mode === "CALENDAR") return to - from;
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const dayEnd = localDayStart(cursor) + DAY_MS;
    const segEnd = Math.min(dayEnd, to);
    if (isCountedDay(cursor, mode, holidays)) total += segEnd - cursor;
    cursor = segEnd;
  }
  return total;
}

/** Сдвинуть момент на amountMs «расчётного» времени вперёд. */
export function advance(from: number, amountMs: number, mode: TimeModeT, holidays: Set<string> = new Set()): number {
  if (amountMs <= 0) return from;
  if (mode === "CALENDAR") return from + amountMs;
  let left = amountMs;
  let cursor = from;
  // Ограничение защищает от бесконечного цикла при некорректном календаре
  for (let guard = 0; guard < 10000; guard++) {
    const dayEnd = localDayStart(cursor) + DAY_MS;
    if (isCountedDay(cursor, mode, holidays)) {
      const seg = dayEnd - cursor;
      if (left <= seg) return cursor + left;
      left -= seg;
    }
    cursor = dayEnd;
  }
  return cursor;
}

/** Интервалы активного отсчёта: [start, end) за вычетом пауз. */
export function activeIntervals(start: number, end: number, pauses: PauseLike[]): [number, number][] {
  const sorted = pauses
    .map((p) => [p.startedAt.getTime(), p.endedAt ? p.endedAt.getTime() : Infinity] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [];
  let cursor = start;
  for (const [ps, pe] of sorted) {
    if (pe <= cursor) continue;
    if (ps >= end) break;
    if (ps > cursor) result.push([cursor, Math.min(ps, end)]);
    cursor = Math.max(cursor, pe);
    if (cursor >= end) break;
  }
  if (cursor < end) result.push([cursor, end]);
  return result;
}

export function computeTimer(input: TimerInput, now: Date = new Date()): TimerView {
  const holidays = new Set(input.holidays ?? []);
  const durationMs = input.durationDays * DAY_MS;
  const pausedMs = input.pauses.reduce((s, p) => {
    const end = p.endedAt ? p.endedAt.getTime() : now.getTime();
    return s + Math.max(0, end - p.startedAt.getTime());
  }, 0);
  const activePause = input.pauses.find((p) => p.endedAt === null) ?? null;

  if (!input.startedAt) {
    return {
      state: "not_started",
      elapsedDays: 0,
      remainingDays: input.durationDays,
      pausedMs: 0,
      pauseCount: 0,
      activePause: null,
      contractualEnd: null,
      forecastEnd: null,
      warning: false,
      percentUsed: 0,
    };
  }

  const start = input.startedAt.getTime();
  const end = input.completedAt ? input.completedAt.getTime() : now.getTime();
  const elapsedMs = activeIntervals(start, end, input.pauses).reduce(
    (s, [a, b]) => s + countedMs(a, b, input.mode, holidays),
    0,
  );
  const remainingMs = durationMs - elapsedMs;
  const contractualEnd = new Date(advance(start, durationMs, input.mode, holidays));
  const forecastEnd = input.completedAt
    ? input.completedAt
    : remainingMs > 0
      ? new Date(advance(now.getTime(), remainingMs, input.mode, holidays))
      : null;

  let state: TimerStateT;
  if (input.completedAt) state = "completed";
  else if (activePause) state = "paused_waiting_customer";
  else if (remainingMs < 0) state = "overdue";
  else state = "running";

  const remainingDays = remainingMs / DAY_MS;
  const warningThreshold = Math.max(2, input.durationDays * 0.15);
  return {
    state,
    elapsedDays: elapsedMs / DAY_MS,
    remainingDays,
    pausedMs,
    pauseCount: input.pauses.length,
    activePause,
    contractualEnd,
    forecastEnd,
    warning: state === "running" && remainingDays <= warningThreshold,
    percentUsed: durationMs > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMs / durationMs) * 100))) : 0,
  };
}

/**
 * Решение о паузе по наличию ожидаемых от заказчика действий.
 * Автоматическая пауза открывается, когда есть хотя бы один открытый запрос или
 * объект на согласовании у заказчика, и закрывается, когда таких не осталось.
 * Ручные паузы этим правилом не управляются.
 */
export function autoPauseDecision(
  pendingCustomerItems: number,
  openAutoPause: boolean,
  timerRunning: boolean,
): "open" | "close" | "none" {
  if (pendingCustomerItems > 0 && !openAutoPause && timerRunning) return "open";
  if (pendingCustomerItems === 0 && openAutoPause) return "close";
  return "none";
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} д`);
  if (hours) parts.push(`${hours} ч`);
  if (!days && minutes) parts.push(`${minutes} мин`);
  return parts.length ? parts.join(" ") : "менее минуты";
}
