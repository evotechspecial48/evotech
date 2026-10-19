// Фоновый воркер: AI-задачи (в т.ч. зависшие после перезапуска), повторная отправка писем,
// обновление состояния таймеров и предупреждения о сроках.
// Запуск: npm run worker (переменные окружения — из .env).

import { runPendingJobs } from "../src/services/ai-jobs";
import { retryFailedEmails } from "../src/lib/mailer";
import { refreshTimers } from "../src/services/timer";
import { logger } from "../src/lib/logger";

const TICK_MS = 5_000;
const TIMERS_EVERY_MS = 5 * 60_000;
let lastTimers = 0;
let stopping = false;

async function tick() {
  try {
    const jobs = await runPendingJobs();
    const mails = await retryFailedEmails();
    if (Date.now() - lastTimers > TIMERS_EVERY_MS) {
      const warned = await refreshTimers();
      lastTimers = Date.now();
      if (warned) logger.info("worker.deadline_warnings", { warned });
    }
    if (jobs || mails) logger.info("worker.tick", { jobs, mails });
  } catch (err) {
    logger.error("worker.tick_failed", { err });
  }
}

async function main() {
  logger.info("worker.started", { tickMs: TICK_MS });
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  logger.info("worker.stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
void main();
