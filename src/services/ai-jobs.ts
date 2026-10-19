import JSZip from "jszip";
import type { AIJob, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { logger } from "@/lib/logger";
import { aiProvider } from "@/lib/ai";
import { UserError, NotFoundError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import type { QuickOrderParams, StructureTypeT } from "@/domain/quick-order";
import { MAX_JOB_ATTEMPTS, retryTarget, type AIJobStatusT } from "@/domain/ai-job";
import { can, ForbiddenError } from "@/domain/rbac";
import type { VariantGeometry } from "@/lib/ai/sketch";
import { saveGenerated } from "./files";

// Очередь AI-задач в БД. Задача захватывается атомарным updateMany по статусу/блокировке,
// поэтому её безопасно обрабатывать одновременно из веб-процесса и воркера.

const STALE_LOCK_MS = 10 * 60_000;

export interface JobInput {
  structureType: StructureTypeT;
  params: QuickOrderParams;
  specText?: string;
}

/** Запуск обработки без ожидания (в веб-процессе); воркер подхватит задачу, если процесс перезапустится. */
export function kickJob(jobId: string) {
  setTimeout(() => {
    processJob(jobId).catch((err) => logger.error("ai.kick_failed", { jobId, err }));
  }, 50);
}

async function claim(job: AIJob): Promise<boolean> {
  const stale = new Date(Date.now() - STALE_LOCK_MS);
  if (job.status === "queued") {
    const r = await db.aIJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "processing", lockedAt: new Date(), startedAt: new Date(), attempts: { increment: 1 } },
    });
    return r.count === 1;
  }
  if (job.status === "generating_package" || job.status === "processing") {
    const r = await db.aIJob.updateMany({
      where: { id: job.id, status: job.status, OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }] },
      data: { lockedAt: new Date(), attempts: { increment: 1 } },
    });
    return r.count === 1;
  }
  return false;
}

async function fail(job: AIJob, phase: AIJobStatusT, err: unknown) {
  const message = err instanceof Error ? err.message : "Неизвестная ошибка";
  logger.error("ai.job_failed", { jobId: job.id, phase, message });
  await db.aIJob.update({ where: { id: job.id }, data: { status: "failed", failedPhase: phase, error: message.slice(0, 1000), lockedAt: null, finishedAt: new Date() } });
  const qo = job.quickOrderId ? await db.quickOrder.findUnique({ where: { id: job.quickOrderId }, select: { customerId: true, number: true } }) : null;
  if (qo) {
    const staff = await db.user.findMany({ where: { role: { in: ["DIRECTOR", "PROJECT_MANAGER"] }, status: "ACTIVE" }, select: { id: true } });
    await notify(staff.map((s) => s.id), "status.changed", `Ошибка AI-задачи по заказу №${qo.number}`, message, `/cabinet/quick-orders/${job.quickOrderId}`, { email: false });
  }
}

export async function processJob(jobId: string): Promise<void> {
  const job = await db.aIJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const phase: AIJobStatusT = job.status === "generating_package" ? "generating_package" : "processing";
  if (!(await claim(job))) return;
  const input = job.input as unknown as JobInput;
  const provider = aiProvider();
  try {
    if (phase === "processing") {
      const variants = await provider.generateVariants({ structureType: input.structureType, params: input.params, specText: input.specText, count: 3 });
      await db.$transaction(async (tx) => {
        await tx.designVariant.deleteMany({ where: { aiJobId: job.id } });
        for (const v of variants) {
          await tx.designVariant.create({
            data: {
              aiJobId: job.id,
              quickOrderId: job.quickOrderId,
              projectId: job.projectId,
              title: v.title,
              description: v.description,
              params: v.geometry as unknown as Prisma.InputJsonValue,
              imageSvg: v.svg,
              priceDelta: v.priceDelta,
            },
          });
        }
        await tx.aIJob.update({
          where: { id: job.id },
          data: { status: "awaiting_selection", lockedAt: null, error: null, failedPhase: null, output: { variants: variants.length }, provider: provider.name, demo: provider.demo },
        });
        if (job.quickOrderId) await tx.quickOrder.update({ where: { id: job.quickOrderId }, data: { status: "AWAITING_SELECTION" } });
      });
      if (job.quickOrderId) {
        const qo = await db.quickOrder.findUnique({ where: { id: job.quickOrderId }, select: { customerId: true, number: true } });
        await notify([qo?.customerId], "approval.pending", `Варианты по заказу №${qo?.number} готовы`, "Сравните варианты эскиза и выберите подходящий.", `/cabinet/quick-orders/${job.quickOrderId}`);
      }
      if (job.projectId) {
        const p = await db.project.findUnique({ where: { id: job.projectId }, select: { customerId: true, managerId: true, number: true } });
        await notify([p?.customerId, p?.managerId], "approval.pending", `Варианты конструкции по проекту №${p?.number} готовы`, undefined, `/cabinet/projects/${job.projectId}?tab=variants`);
      }
      return;
    }

    // Формирование итогового пакета
    if (!job.quickOrderId) throw new Error("Пакет формируется только для быстрых заказов");
    const qo = await db.quickOrder.findUniqueOrThrow({ where: { id: job.quickOrderId }, include: { selectedVariant: true } });
    if (!qo.selectedVariant) throw new Error("Вариант не выбран");
    const files = await provider.generatePackage({
      orderNumber: `БЗ-${qo.number}`,
      structureType: qo.structureType,
      params: qo.params as unknown as QuickOrderParams,
      variant: {
        title: qo.selectedVariant.title,
        description: qo.selectedVariant.description,
        geometry: qo.selectedVariant.params as unknown as VariantGeometry,
        svg: qo.selectedVariant.imageSvg,
      },
    });
    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.content);
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const asset = await saveGenerated(buffer, `EvoTechnology_БЗ-${qo.number}.zip`, "application/zip", { quickOrderId: qo.id, category: "ARCHIVE" }, null);
    await db.$transaction([
      db.aIJob.update({ where: { id: job.id }, data: { status: "completed", lockedAt: null, finishedAt: new Date(), error: null, failedPhase: null, output: { files: files.map((f) => f.path), archiveFileId: asset.id } } }),
      db.quickOrder.update({ where: { id: qo.id }, data: { status: "COMPLETED", archiveFileId: asset.id } }),
    ]);
    await notify([qo.customerId], "archive.ready", `Документация по заказу №${qo.number} готова`, "Итоговый архив доступен для скачивания в личном кабинете.", `/cabinet/quick-orders/${qo.id}`);
  } catch (err) {
    await fail(job, phase, err);
  }
}

/** Повторный запуск задачи после ошибки. */
export async function retryJob(user: SessionUser, jobId: string) {
  const job = await db.aIJob.findUnique({ where: { id: jobId }, include: { quickOrder: { select: { customerId: true } } } });
  if (!job) throw new NotFoundError("AI-задача");
  const isOwner = job.quickOrder?.customerId === user.id;
  if (!isOwner && !can(user.role, "quick_orders.view_all") && !can(user.role, "projects.manage")) throw new ForbiddenError();
  if (job.status !== "failed") throw new UserError("Перезапустить можно только задачу с ошибкой");
  if (job.attempts >= MAX_JOB_ATTEMPTS && user.role === "CUSTOMER") throw new UserError("Превышено число попыток. Мы уже разбираемся с проблемой — менеджер свяжется с вами.");
  const target = retryTarget(job.failedPhase as AIJobStatusT | null);
  await db.aIJob.update({ where: { id: jobId }, data: { status: target, error: null, lockedAt: null } });
  await audit({ actorId: user.id, action: "ai.retry", entityType: "AIJob", entityId: jobId, meta: { target } });
  kickJob(jobId);
}

/** Обработка зависших и ожидающих задач (вызывается воркером). */
export async function runPendingJobs(): Promise<number> {
  const stale = new Date(Date.now() - STALE_LOCK_MS);
  const jobs = await db.aIJob.findMany({
    where: {
      OR: [
        { status: "queued" },
        { status: "generating_package", OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }] },
        { status: "processing", lockedAt: { lt: stale } },
      ],
    },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  for (const j of jobs) {
    // Зависшая обработка возвращается в очередь
    if (j.status === "processing") await db.aIJob.update({ where: { id: j.id }, data: { status: "queued", lockedAt: null } });
    await processJob(j.id);
  }
  return jobs.length;
}
