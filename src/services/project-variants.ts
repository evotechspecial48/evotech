import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { ForbiddenError } from "@/domain/rbac";
import { SPEC_FIELDS, type SpecData } from "@/domain/spec";
import type { QuickOrderParams } from "@/domain/quick-order";
import { loadProjectAccess } from "./scope";
import { kickJob } from "./ai-jobs";
import { specToText } from "./specs";

// Будущий AI-поток для обычных проектов: утверждённое ТЗ → варианты конструкции → выбор заказчиком.

function paramsFromSpec(data: SpecData): QuickOrderParams {
  const nums = (data.dimensions ?? "").match(/\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(",", "."))) ?? [];
  const height = Number((data.spans ?? "").match(/(\d+(?:[.,]\d+)?)\s*м/)?.[1]?.replace(",", ".") ?? 6);
  return {
    length: nums[1] ?? nums[0] ?? 24,
    width: nums[0] ?? 12,
    height: Number.isFinite(height) ? height : 6,
    roofType: "gable",
    covering: "sandwich",
    frame: "i_beam",
    foundation: "columnar",
    region: data.address || "Не указан",
    snowDistrict: "III",
    color: data.coating ?? "",
    attachedToBuilding: false,
    notes: data.comments,
  };
}

export async function startProjectVariants(user: SessionUser, projectId: string) {
  const access = await loadProjectAccess(user, projectId);
  if (!access.canManage) throw new ForbiddenError("Запускает генерацию руководитель проекта");
  const spec = await db.technicalSpecification.findUnique({ where: { projectId }, include: { approvedVersion: true } });
  if (!spec?.approvedVersion) throw new UserError("Сначала утвердите техническое задание");
  const running = await db.aIJob.findFirst({ where: { projectId, status: { in: ["queued", "processing"] } } });
  if (running) throw new UserError("Генерация уже выполняется");
  const data = spec.approvedVersion.data as SpecData;
  const job = await db.aIJob.create({
    data: {
      projectId,
      status: "queued",
      provider: "pending",
      input: { structureType: "HANGAR", params: paramsFromSpec(data), specText: specToText(data, SPEC_FIELDS) } as unknown as Prisma.InputJsonValue,
    },
  });
  await audit({ actorId: user.id, action: "ai.retry", entityType: "AIJob", entityId: job.id, projectId, meta: { start: "project_variants" } });
  kickJob(job.id);
}

export async function selectProjectVariant(user: SessionUser, variantId: string) {
  const v = await db.designVariant.findUnique({ where: { id: variantId } });
  if (!v?.projectId) throw new NotFoundError("Вариант");
  const access = await loadProjectAccess(user, v.projectId);
  if (user.role !== "CUSTOMER") throw new ForbiddenError("Вариант выбирает заказчик");
  await db.$transaction([
    db.designVariant.updateMany({ where: { aiJobId: v.aiJobId }, data: { status: "REJECTED" } }),
    db.designVariant.update({ where: { id: variantId }, data: { status: "SELECTED" } }),
    db.aIJob.update({ where: { id: v.aiJobId }, data: { status: "selected" } }),
  ]);
  await notify([access.info.managerId, ...access.info.memberIds], "approval.approved", `Заказчик выбрал вариант «${v.title}»`, `Проект №${access.project.number}. Можно приступать к эскизу.`, `/cabinet/projects/${v.projectId}?tab=variants`);
}
