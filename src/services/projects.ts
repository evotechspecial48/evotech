import type { Prisma, StageCode } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { STAGES } from "@/domain/stage";
import { ForbiddenError } from "@/domain/rbac";
import { loadLeadAccess, loadProjectAccess } from "./scope";
import { notifyTimerChange, syncAutoPause } from "./timer";

export async function defaultTimeMode(): Promise<"CALENDAR" | "WORKING"> {
  const s = await db.setting.findUnique({ where: { key: "timer.defaultMode" } });
  return s?.value === "CALENDAR" ? "CALENDAR" : "WORKING";
}

export interface CreateProjectInput {
  title: string;
  customerId: string;
  leadId?: string | null;
  managerId?: string | null;
  salesManagerId?: string | null;
  objectType?: string | null;
  address?: string | null;
  description?: string | null;
  durationDays: number;
  startedAt?: Date | null;
  briefApproved?: boolean;
}

export async function createProjectTx(tx: Prisma.TransactionClient, input: CreateProjectInput, actorId: string) {
  const mode = await defaultTimeMode();
  const project = await tx.project.create({
    data: {
      title: input.title,
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      managerId: input.managerId ?? null,
      salesManagerId: input.salesManagerId ?? null,
      objectType: input.objectType ?? null,
      address: input.address ?? null,
      description: input.description ?? null,
      stages: {
        create: STAGES.map((s, i) => ({
          code: s.code as StageCode,
          order: i + 1,
          title: s.title,
          status: s.code === "brief" ? (input.briefApproved ? "completed" : "in_progress") : s.code === "sketch" && input.briefApproved ? "in_progress" : "not_started",
          startedAt: s.code === "brief" || (s.code === "sketch" && input.briefApproved) ? new Date() : null,
          completedAt: s.code === "brief" && input.briefApproved ? new Date() : null,
        })),
      },
      timer: {
        create: {
          durationDays: input.durationDays,
          mode,
          startedAt: input.startedAt ?? null,
          state: input.startedAt ? "running" : "not_started",
        },
      },
    },
  });
  await tx.statusChange.create({ data: { entityType: "Project", entityId: project.id, projectId: project.id, toStatus: "ACTIVE", actorId } });
  return project;
}

/**
 * Конвертация заявки в проект: только при подписанном договоре.
 * ТЗ заявки переходит в проект; если ТЗ утверждено — этап ТЗ сразу завершён.
 * Таймер запускается с даты подписания договора на договорной срок.
 */
export async function convertLeadToProject(user: SessionUser, leadId: string, managerId: string | null) {
  const lead = await loadLeadAccess(user, leadId);
  if (lead.status === "won") throw new UserError("Проект по заявке уже создан");
  if (!lead.customerId) throw new UserError("У заявки нет учётной записи заказчика — сформируйте договор, чтобы пригласить заказчика");
  const contract = await db.contract.findFirst({ where: { leadId, status: "SIGNED" }, orderBy: { createdAt: "desc" } });
  if (!contract) throw new UserError("Нет подписанного договора по заявке");
  const spec = await db.technicalSpecification.findUnique({ where: { leadId } });

  const project = await db.$transaction(async (tx) => {
    const p = await createProjectTx(
      tx,
      {
        title: lead.title,
        customerId: lead.customerId!,
        leadId,
        managerId,
        salesManagerId: lead.managerId ?? user.id,
        objectType: lead.objectType,
        description: lead.description,
        durationDays: contract.termDays,
        startedAt: contract.signedAt ?? new Date(),
        briefApproved: spec?.status === "APPROVED",
      },
      user.id,
    );
    if (spec) await tx.technicalSpecification.update({ where: { id: spec.id }, data: { projectId: p.id } });
    await tx.contract.update({ where: { id: contract.id }, data: { projectId: p.id } });
    await tx.fileAsset.updateMany({ where: { leadId }, data: { projectId: p.id } });
    await tx.lead.update({ where: { id: leadId }, data: { status: "won" } });
    await tx.statusChange.create({ data: { entityType: "Lead", entityId: leadId, fromStatus: lead.status, toStatus: "won", actorId: user.id, comment: `Создан проект №${p.number}` } });
    return p;
  });
  await audit({ actorId: user.id, action: "lead.convert", entityType: "Lead", entityId: leadId, projectId: project.id });
  await notify([managerId], "project.assigned", `Вам передан проект №${project.number}`, `«${project.title}». Договор подписан, таймер запущен.`, `/cabinet/projects/${project.id}`);
  await notify([lead.customerId], "status.changed", `Проект №${project.number} запущен`, `Работы по «${project.title}» начаты. Следите за прогрессом в личном кабинете.`, `/cabinet/projects/${project.id}`);
  return project;
}

export async function assignTeam(user: SessionUser, projectId: string, managerId: string | null, designerIds: string[]) {
  const access = await loadProjectAccess(user, projectId);
  if (!access.canManage) throw new ForbiddenError("Назначать участников может руководитель проекта или директор");
  const designers = await db.user.findMany({ where: { id: { in: designerIds }, role: "DESIGNER", status: "ACTIVE" }, select: { id: true } });
  if (managerId) {
    const m = await db.user.findFirst({ where: { id: managerId, role: { in: ["PROJECT_MANAGER", "DIRECTOR"] } } });
    if (!m) throw new UserError("Руководитель проекта не найден");
  }
  const before = access.info.memberIds;
  const after = designers.map((d) => d.id);
  await db.$transaction([
    db.project.update({ where: { id: projectId }, data: { managerId } }),
    db.projectMember.deleteMany({ where: { projectId, userId: { notIn: after } } }),
    ...after.filter((id) => !before.includes(id)).map((userId) => db.projectMember.create({ data: { projectId, userId } })),
    db.projectStage.updateMany({ where: { projectId, assigneeId: { notIn: after } }, data: { assigneeId: null } }),
  ]);
  await audit({ actorId: user.id, action: "project.assign", entityType: "Project", entityId: projectId, projectId, meta: { managerId, designers: after } });
  const added = after.filter((id) => !before.includes(id));
  const p = access.project;
  await notify(added, "project.assigned", `Вы назначены на проект №${p.number}`, `«${p.title}»`, `/cabinet/projects/${projectId}`);
  if (managerId && managerId !== access.info.managerId) {
    await notify([managerId], "project.assigned", `Вы руководитель проекта №${p.number}`, `«${p.title}»`, `/cabinet/projects/${projectId}`);
  }
}

export async function setProjectStatus(user: SessionUser, projectId: string, status: "ACTIVE" | "ON_HOLD" | "CANCELLED", comment: string) {
  const access = await loadProjectAccess(user, projectId);
  if (!access.canManage) throw new ForbiddenError();
  if (comment.trim().length < 3) throw new UserError("Укажите причину изменения статуса");
  await db.$transaction([
    db.project.update({ where: { id: projectId }, data: { status } }),
    db.statusChange.create({ data: { entityType: "Project", entityId: projectId, projectId, fromStatus: access.project.status, toStatus: status, actorId: user.id, comment } }),
  ]);
  await audit({ actorId: user.id, action: "project.update", entityType: "Project", entityId: projectId, projectId, meta: { status, comment } });
  await notify([access.info.customerId, ...access.info.memberIds], "status.changed", `Статус проекта №${access.project.number} изменён`, comment, `/cabinet/projects/${projectId}`, { exceptUserId: user.id });
}

// ---------- Комментарии и запросы ----------

/** Упоминания вида @Имя Фамилия или @email — распознаются по участникам проекта. */
export async function addProjectComment(user: SessionUser, projectId: string, body: string, internal: boolean, stageId?: string | null) {
  const access = await loadProjectAccess(user, projectId);
  if (body.trim().length < 1) throw new UserError("Введите текст комментария");
  const isInternal = user.role !== "CUSTOMER" && internal;
  const participants = await db.user.findMany({
    where: { id: { in: [access.info.customerId, access.info.managerId, ...access.info.memberIds].filter((x): x is string => !!x) } },
    select: { id: true, name: true, email: true, role: true },
  });
  const lower = body.toLowerCase();
  const mentions = participants
    .filter((u) => lower.includes(`@${u.name.toLowerCase()}`) || lower.includes(`@${u.email.toLowerCase()}`))
    .filter((u) => !(isInternal && u.role === "CUSTOMER"))
    .map((u) => u.id);
  await db.comment.create({ data: { projectId, stageId: stageId ?? null, authorId: user.id, body, mentions, internal: isInternal } });
  const p = access.project;
  const recipients = isInternal ? [access.info.managerId, ...access.info.memberIds] : [access.info.customerId, access.info.managerId, ...access.info.memberIds];
  await notify(recipients, "comment.new", `Новый комментарий в проекте №${p.number}`, `${user.name}: ${body.slice(0, 200)}`, `/cabinet/projects/${projectId}?tab=comments`, { exceptUserId: user.id, email: false });
  if (mentions.length) {
    await notify(mentions, "comment.new", `${user.name} упомянул(а) вас в проекте №${p.number}`, body.slice(0, 300), `/cabinet/projects/${projectId}?tab=comments`, { exceptUserId: user.id });
  }
}

export async function createCustomerRequest(user: SessionUser, projectId: string, question: string, stageCode: StageCode | null, pausesTimer: boolean) {
  const access = await loadProjectAccess(user, projectId);
  if (user.role === "CUSTOMER" || !access.actorKind) throw new ForbiddenError();
  if (question.trim().length < 5) throw new UserError("Сформулируйте запрос подробнее");
  const req = await db.customerRequest.create({ data: { projectId, question, stageCode, pausesTimer, authorId: user.id } });
  await audit({ actorId: user.id, action: "request.create", entityType: "CustomerRequest", entityId: req.id, projectId, meta: { pausesTimer } });
  const change = await syncAutoPause(projectId, user.id);
  await notifyTimerChange(projectId, change);
  await notify([access.info.customerId], "request.new", `Запрос по проекту №${access.project.number}`, question, `/cabinet/projects/${projectId}?tab=requests`);
  return req;
}

export async function answerCustomerRequest(user: SessionUser, requestId: string, answer: string) {
  const req = await db.customerRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError("Запрос");
  const access = await loadProjectAccess(user, req.projectId);
  if (user.role !== "CUSTOMER" && !access.canManage) throw new ForbiddenError("Ответить может заказчик");
  if (req.status !== "OPEN") throw new UserError("Запрос уже закрыт");
  if (answer.trim().length < 1) throw new UserError("Введите ответ");
  await db.customerRequest.update({ where: { id: requestId }, data: { status: "ANSWERED", answer, answeredById: user.id, answeredAt: new Date() } });
  await audit({ actorId: user.id, action: "request.answer", entityType: "CustomerRequest", entityId: requestId, projectId: req.projectId });
  const change = await syncAutoPause(req.projectId, user.id);
  await notifyTimerChange(req.projectId, change);
  await notify([req.authorId, access.info.managerId], "request.answered", `Получен ответ заказчика (проект №${access.project.number})`, answer.slice(0, 300), `/cabinet/projects/${req.projectId}?tab=requests`, { exceptUserId: user.id });
}

export async function cancelCustomerRequest(user: SessionUser, requestId: string) {
  const req = await db.customerRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError("Запрос");
  const access = await loadProjectAccess(user, req.projectId);
  if (!access.canManage && req.authorId !== user.id) throw new ForbiddenError();
  if (req.status !== "OPEN") throw new UserError("Запрос уже закрыт");
  await db.customerRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  const change = await syncAutoPause(req.projectId, user.id);
  await notifyTimerChange(req.projectId, change);
}

export async function getProjectOrThrow(id: string) {
  const p = await db.project.findUnique({ where: { id } });
  if (!p) throw new NotFoundError("Проект");
  return p;
}
