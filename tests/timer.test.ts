import { describe, expect, it } from "vitest";
import { activeIntervals, advance, autoPauseDecision, computeTimer, countedMs, DAY_MS } from "@/domain/timer";

// Даты в московском времени: 2026-10-05 — понедельник
const msk = (s: string) => new Date(`${s}+03:00`);

describe("countedMs / advance", () => {
  it("в календарном режиме считает всё время", () => {
    expect(countedMs(msk("2026-10-05T00:00:00").getTime(), msk("2026-10-12T00:00:00").getTime(), "CALENDAR")).toBe(7 * DAY_MS);
  });

  it("в режиме рабочих дней пропускает выходные", () => {
    const from = msk("2026-10-05T00:00:00").getTime();
    const to = msk("2026-10-12T00:00:00").getTime();
    expect(countedMs(from, to, "WORKING")).toBe(5 * DAY_MS);
  });

  it("учитывает праздники", () => {
    const from = msk("2026-10-05T00:00:00").getTime();
    const to = msk("2026-10-12T00:00:00").getTime();
    expect(countedMs(from, to, "WORKING", new Set(["2026-10-07"]))).toBe(4 * DAY_MS);
  });

  it("advance переносит через выходные", () => {
    // пятница 00:00 + 2 рабочих дня = вторник 00:00
    const fri = msk("2026-10-09T00:00:00").getTime();
    expect(new Date(advance(fri, 2 * DAY_MS, "WORKING")).toISOString()).toBe(msk("2026-10-13T00:00:00").toISOString());
  });
});

describe("activeIntervals", () => {
  it("вычитает паузы, включая открытую", () => {
    const s = 0;
    const e = 100;
    const res = activeIntervals(s, e, [
      { startedAt: new Date(10), endedAt: new Date(20) },
      { startedAt: new Date(50), endedAt: null },
    ]);
    expect(res).toEqual([
      [0, 10],
      [20, 50],
    ]);
  });
});

describe("computeTimer", () => {
  const base = { durationDays: 10, mode: "CALENDAR" as const, completedAt: null, pauses: [] };

  it("not_started без даты начала", () => {
    expect(computeTimer({ ...base, startedAt: null }).state).toBe("not_started");
  });

  it("running и остаток дней", () => {
    const v = computeTimer({ ...base, startedAt: msk("2026-10-01T00:00:00") }, msk("2026-10-04T00:00:00"));
    expect(v.state).toBe("running");
    expect(v.remainingDays).toBeCloseTo(7);
    expect(v.forecastEnd?.toISOString()).toBe(msk("2026-10-11T00:00:00").toISOString());
  });

  it("пауза останавливает отсчёт и сдвигает прогноз", () => {
    const v = computeTimer(
      {
        ...base,
        startedAt: msk("2026-10-01T00:00:00"),
        pauses: [{ startedAt: msk("2026-10-03T00:00:00"), endedAt: null }],
      },
      msk("2026-10-08T00:00:00"),
    );
    expect(v.state).toBe("paused_waiting_customer");
    expect(v.elapsedDays).toBeCloseTo(2);
    expect(v.remainingDays).toBeCloseTo(8);
    expect(v.pausedMs).toBe(5 * DAY_MS);
    // договорная дата не меняется, прогнозная — сдвигается
    expect(v.contractualEnd?.toISOString()).toBe(msk("2026-10-11T00:00:00").toISOString());
    expect(v.forecastEnd?.toISOString()).toBe(msk("2026-10-16T00:00:00").toISOString());
  });

  it("после возобновления отсчёт продолжается", () => {
    const v = computeTimer(
      {
        ...base,
        startedAt: msk("2026-10-01T00:00:00"),
        pauses: [{ startedAt: msk("2026-10-03T00:00:00"), endedAt: msk("2026-10-05T00:00:00") }],
      },
      msk("2026-10-06T00:00:00"),
    );
    expect(v.state).toBe("running");
    expect(v.elapsedDays).toBeCloseTo(3);
  });

  it("overdue при исчерпании срока", () => {
    const v = computeTimer({ ...base, startedAt: msk("2026-10-01T00:00:00") }, msk("2026-10-13T00:00:00"));
    expect(v.state).toBe("overdue");
    expect(v.remainingDays).toBeLessThan(0);
    expect(v.forecastEnd).toBeNull();
  });

  it("предупреждение о приближении срока", () => {
    const v = computeTimer({ ...base, startedAt: msk("2026-10-01T00:00:00") }, msk("2026-10-09T12:00:00"));
    expect(v.warning).toBe(true);
  });

  it("completed фиксирует время завершения", () => {
    const v = computeTimer(
      { ...base, startedAt: msk("2026-10-01T00:00:00"), completedAt: msk("2026-10-05T00:00:00") },
      msk("2026-10-30T00:00:00"),
    );
    expect(v.state).toBe("completed");
    expect(v.elapsedDays).toBeCloseTo(4);
  });
});

describe("autoPauseDecision", () => {
  it("открывает паузу при ожидании заказчика", () => {
    expect(autoPauseDecision(1, false, true)).toBe("open");
  });
  it("не открывает повторно", () => {
    expect(autoPauseDecision(2, true, true)).toBe("none");
  });
  it("закрывает, когда ожиданий нет", () => {
    expect(autoPauseDecision(0, true, true)).toBe("close");
  });
  it("не открывает паузу у незапущенного таймера", () => {
    expect(autoPauseDecision(1, false, false)).toBe("none");
  });
});
