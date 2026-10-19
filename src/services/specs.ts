import type { Prisma, TechnicalSpecification } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify, staffWithRole } from "@/lib/notify";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { can, ForbiddenError } from "@/domain/rbac";
import { checksum, diffSpec, missingRequired, sanitizeSpec, type SpecData } from "@/domain/spec";
import { loadLeadAccess, loadProjectAccess } from "./scope";

async function accessSpec(user: SessionUser, spec: TechnicalSpecification) {
  if (spec.projectId) {
    const a = await loadProjectAccess(user, spec.projectId);
    return { projectId: spec.projectId, leadId: spec.leadId, customerId: a.info.customerId, staffIds: [a.info.managerId, a.info.salesManagerId, ...a.info.memberIds] };
  }
  if (spec.leadId) {
    const lead = await loadLeadAccess(user, spec.leadId);
    return { projectId: null, leadId: lead.id, customerId: lead.customerId, staffIds: [lead.managerId] };
  }
  throw new NotFoundError("ТЗ");
}

export async function getSpecForUser(user: SessionUser, specId: string) {
  const spec = await db.technicalSpecification.findUnique({ where: { id: specId } });
  if (!spec) throw new NotFoundError("Техническое задание");
  const ctx = await accessSpec(user, spec);
  return { spec, ctx };
}

/** ТЗ создаётся вместе с заявкой; для заявки без ТЗ — по запросу. */
export async function ensureLeadSpec(user: SessionUser, leadId: string) {
  const lead = await loadLeadAccess(user, leadId);
  const existing = await db.technicalSpecification.findUnique({ where: { leadId } });
  if (existing) return existing;
  return db.technicalSpecification.create({
    data: { leadId, data: { objectName: lead.title, objectType: lead.objectType ?? "", purpose: lead.description ?? "", budget: lead.budget ?? "" } },
  });
}

/**
 * Сохранение ТЗ: каждое сохранение с изменениями — новая версия с автором, временем и перечнем изменённых полей.
 * Утверждённое ТЗ не редактируется: снимок неизменяем.
 */
export async function saveSpec(user: SessionUser, specId: string, raw: Record<string, unknown>, changeNote: string) {
  if (!can(user.role, "spec.edit")) throw new ForbiddenError();
  const { spec, ctx } = await getSpecForUser(user, specId);
  if (spec.status === "APPROVED") throw new UserError("ТЗ утверждено. Изменения вносятся через запрос изменений руководителю проекта.");
  if (user.role === "CUSTOMER" && spec.status === "SUBMITTED") throw new UserError("ТЗ на проверке у сотрудников компании");
  const next = sanitizeSpec(raw);
  const prev = spec.data as SpecData;
  const changed = diffSpec(prev, next);
  if (!changed.length) return { changed: 0 };
  const version = spec.currentVersion + 1;
  await db.$transaction([
    db.technicalSpecificationVersion.create({
      data: { specId, version, data: next, changeNote: changeNote || null, changedKeys: changed, authorId: user.id, checksum: checksum(next) },
    }),
    db.technicalSpecification.update({
      where: { id: specId },
      data: { data: next, currentVersion: version },
    }),
  ]);
  await audit({ actorId: user.id, action: "spec.save", entityType: "TechnicalSpecification", entityId: specId, projectId: ctx.projectId, meta: { version, changed } });
  return { changed: changed.length };
}

export async function submitSpec(user: SessionUser, specId: string) {
  const { spec, ctx } = await getSpecForUser(user, specId);
  if (!["DRAFT", "CLARIFICATION"].includes(spec.status)) throw new UserError("ТЗ уже отправлено или утверждено");
  const missing = missingRequired(spec.data as SpecData);
  if (missing.length) throw new UserError(`Заполните обязательные поля: ${missing.map((m) => m.label).join(", ")}`);
  if (spec.currentVersion === 0) {
    await db.technicalSpecificationVersion.create({
      data: { specId, version: 1, data: spec.data as Prisma.InputJsonValue, changedKeys: Object.keys(spec.data as object), authorId: user.id, checksum: checksum(spec.data), changeNote: "Первая версия" },
    });
    await db.technicalSpecification.update({ where: { id: specId }, data: { currentVersion: 1 } });
  }
  await db.technicalSpecification.update({ where: { id: specId }, data: { status: "SUBMITTED", clarification: null } });
  await db.approval.create({ data: { specId, specVersion: Math.max(1, spec.currentVersion), kind: "SPEC", decision: "SUBMITTED", userId: user.id } });
  await audit({ actorId: user.id, action: "spec.submit", entityType: "TechnicalSpecification", entityId: specId, projectId: ctx.projectId });
  const staff = ctx.staffIds.filter(Boolean).length ? ctx.staffIds : await staffWithRole("SALES_MANAGER");
  await notify(staff, "approval.pending", "ТЗ отправлено на проверку", undefined, `/cabinet/specs/${specId}`, { exceptUserId: user.id });
}

export async function requestClarification(user: SessionUser, specId: string, comment: string) {
  if (user.role === "CUSTOMER" || !can(user.role, "spec.edit")) throw new ForbiddenError();
  if (comment.trim().length < 5) throw new UserError("Опишите, какие уточнения нужны");
  const { spec, ctx } = await getSpecForUser(user, specId);
  if (spec.status !== "SUBMITTED") throw new UserError("Уточнения запрашиваются по отправленному ТЗ");
  await db.technicalSpecification.update({ where: { id: specId }, data: { status: "CLARIFICATION", clarification: comment } });
  await db.approval.create({ data: { specId, specVersion: spec.currentVersion, kind: "SPEC", decision: "CHANGES_REQUESTED", comment, userId: user.id } });
  await audit({ actorId: user.id, action: "spec.clarify", entityType: "TechnicalSpecification", entityId: specId, projectId: ctx.projectId });
  await notify([ctx.customerId], "approval.changes", "Требуются уточнения по ТЗ", comment, `/cabinet/specs/${specId}`);
}

/** Утверждение ТЗ: создаётся неизменяемый снимок-версия, на основании которого запускается проектирование. */
export async function approveSpec(user: SessionUser, specId: string) {
  if (!can(user.role, "spec.approve")) throw new ForbiddenError("Утверждает ТЗ руководитель проектов или директор");
  const { spec, ctx } = await getSpecForUser(user, specId);
  if (spec.status !== "SUBMITTED") throw new UserError("Утверждается ТЗ в статусе «На проверке»");
  const data = spec.data as SpecData;
  const missing = missingRequired(data);
  if (missing.length) throw new UserError(`Не заполнены поля: ${missing.map((m) => m.label).join(", ")}`);
  const version = spec.currentVersion + 1;
  await db.$transaction(async (tx) => {
    const snap = await tx.technicalSpecificationVersion.create({
      data: { specId, version, data, changedKeys: [], authorId: user.id, isSnapshot: true, checksum: checksum(data), changeNote: "Утверждённая версия (снимок)" },
    });
    await tx.technicalSpecification.update({ where: { id: specId }, data: { status: "APPROVED", currentVersion: version, approvedVersionId: snap.id } });
    await tx.approval.create({ data: { specId, specVersion: version, kind: "SPEC", decision: "APPROVED", userId: user.id } });
    if (spec.projectId) {
      const now = new Date();
      await tx.projectStage.updateMany({ where: { projectId: spec.projectId, code: "brief" }, data: { status: "completed", completedAt: now } });
      await tx.projectStage.updateMany({ where: { projectId: spec.projectId, code: "sketch", status: "not_started" }, data: { status: "in_progress", startedAt: now } });
      await tx.statusChange.create({ data: { entityType: "ProjectStage", entityId: spec.projectId, projectId: spec.projectId, fromStatus: "in_progress", toStatus: "completed", actorId: user.id, comment: "ТЗ утверждено" } });
    }
  });
  await audit({ actorId: user.id, action: "spec.approve", entityType: "TechnicalSpecification", entityId: specId, projectId: ctx.projectId, meta: { version } });
  await notify([ctx.customerId, ...ctx.staffIds], "approval.approved", "Техническое задание утверждено", `Версия ${version} зафиксирована как основа для проектирования.`, `/cabinet/specs/${specId}`, { exceptUserId: user.id });
}

export function specToText(data: SpecData, labels: { key: string; label: string }[]): string {
  return labels
    .filter((f) => data[f.key])
    .map((f) => `${f.label}: ${data[f.key]}`)
    .join("\n");
}
