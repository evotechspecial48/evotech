import type { LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify, staffWithRole } from "@/lib/notify";
import { queueEmail } from "@/lib/mailer";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { can, ForbiddenError } from "@/domain/rbac";
import { checkLeadTransition, type LeadStatusCode } from "@/domain/lead";
import { LEAD_STATUS } from "@/domain/labels";
import { isEmail, normalizeEmail } from "./users";
import { loadLeadAccess } from "./scope";

export interface LeadInput {
  title: string;
  contactName: string;
  email: string;
  phone?: string;
  companyName?: string;
  objectType?: string;
  description?: string;
  budget?: string;
  source: LeadSource;
  utm?: Record<string, string> | null;
  referrer?: string | null;
}

export function validateLead(input: LeadInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (input.contactName.length < 2) e.contactName = "Укажите имя";
  if (!isEmail(normalizeEmail(input.email))) e.email = "Некорректный адрес почты";
  if (input.phone && !/^[\d\s()+-]{6,20}$/.test(input.phone)) e.phone = "Некорректный телефон";
  if (input.title.length < 3) e.title = "Кратко опишите задачу";
  return e;
}

/** Самый свободный менеджер проектов — назначается ответственным автоматически. */
async function pickSalesManager(): Promise<string | null> {
  const managers = await db.user.findMany({
    where: { role: "SALES_MANAGER", status: "ACTIVE" },
    select: { id: true, _count: { select: { managedLeads: { where: { status: { notIn: ["won", "lost"] } } } } } },
  });
  managers.sort((a, b) => a._count.managedLeads - b._count.managedLeads);
  return managers[0]?.id ?? null;
}

/**
 * Создание заявки. Заявка сохраняется до любых внешних вызовов: сбой почты не приводит к потере заявки.
 */
export async function createLead(input: LeadInput, actor: SessionUser | null, ip: string | null) {
  const errors = validateLead(input);
  if (Object.keys(errors).length) throw new UserError("Проверьте поля формы", errors);
  const email = normalizeEmail(input.email);
  const customer = actor?.role === "CUSTOMER" ? actor : await db.user.findFirst({ where: { email, role: "CUSTOMER" } });
  const managerId = actor && actor.role === "SALES_MANAGER" ? actor.id : await pickSalesManager();
  const lead = await db.lead.create({
    data: {
      title: input.title,
      contactName: input.contactName,
      email,
      phone: input.phone || null,
      companyName: input.companyName || null,
      objectType: input.objectType || null,
      description: input.description || null,
      budget: input.budget || null,
      source: input.source,
      utm: (input.utm ?? undefined) as Prisma.InputJsonValue | undefined,
      referrer: input.referrer?.slice(0, 500) || null,
      customerId: customer?.id ?? null,
      managerId,
      spec: { create: { data: { objectName: input.title, objectType: input.objectType ?? "", purpose: input.description ?? "", budget: input.budget ?? "" } } },
    },
  });
  await db.statusChange.create({ data: { entityType: "Lead", entityId: lead.id, toStatus: "new", actorId: actor?.id ?? null, comment: "Заявка создана" } });
  await audit({ actorId: actor?.id ?? null, action: "lead.create", entityType: "Lead", entityId: lead.id, ip, meta: { source: input.source } });
  const recipients = managerId ? [managerId] : await staffWithRole("SALES_MANAGER");
  await notify(recipients, "lead.new", `Новая заявка №${lead.number}`, `${input.contactName}: ${input.title}`, `/cabinet/leads/${lead.id}`, { exceptUserId: actor?.id });
  if (!actor) {
    await queueEmail(email, `Заявка №${lead.number} принята`, `Здравствуйте, ${input.contactName}!\n\nМы получили вашу заявку «${input.title}». Менеджер свяжется с вами в течение рабочего дня.\n\n— EvoTechnology`);
  }
  return lead;
}

export async function changeLeadStatus(user: SessionUser, leadId: string, to: LeadStatus, reason: string) {
  if (!can(user.role, "leads.manage")) throw new ForbiddenError();
  const lead = await loadLeadAccess(user, leadId);
  const check = checkLeadTransition(lead.status as LeadStatusCode, to as LeadStatusCode, { reason });
  if (!check.ok) throw new UserError(check.reason);
  await db.$transaction([
    db.lead.update({ where: { id: leadId }, data: { status: to, lostReason: to === "lost" ? reason : null } }),
    db.statusChange.create({ data: { entityType: "Lead", entityId: leadId, fromStatus: lead.status, toStatus: to, actorId: user.id, comment: reason || null } }),
  ]);
  await audit({ actorId: user.id, action: "lead.status", entityType: "Lead", entityId: leadId, meta: { from: lead.status, to } });
  await notify([lead.customerId], "status.changed", `Статус заявки №${lead.number}: ${LEAD_STATUS[to].label}`, undefined, `/cabinet/leads/${leadId}`, { email: false });
}

export async function assignLeadManager(user: SessionUser, leadId: string, managerId: string) {
  if (!can(user.role, "leads.manage")) throw new ForbiddenError();
  const lead = await loadLeadAccess(user, leadId);
  const m = await db.user.findFirst({ where: { id: managerId, role: { in: ["SALES_MANAGER", "DIRECTOR"] }, status: "ACTIVE" } });
  if (!m) throw new UserError("Менеджер не найден");
  await db.lead.update({ where: { id: leadId }, data: { managerId } });
  await audit({ actorId: user.id, action: "lead.assign", entityType: "Lead", entityId: leadId, meta: { from: lead.managerId, to: managerId } });
  await notify([managerId], "project.assigned", `Вам назначена заявка №${lead.number}`, lead.title, `/cabinet/leads/${leadId}`, { exceptUserId: user.id });
}

export async function addLeadComment(user: SessionUser, leadId: string, body: string, internal: boolean) {
  const lead = await loadLeadAccess(user, leadId);
  if (!body.trim()) throw new UserError("Введите текст комментария");
  const isInternal = user.role !== "CUSTOMER" && internal;
  await db.comment.create({ data: { leadId, authorId: user.id, body, internal: isInternal } });
  const to = user.role === "CUSTOMER" ? [lead.managerId] : isInternal ? [] : [lead.customerId];
  await notify(to, "comment.new", `Комментарий к заявке №${lead.number}`, body.slice(0, 200), `/cabinet/leads/${leadId}`, { email: false });
}

export async function addLeadTask(user: SessionUser, leadId: string, title: string, dueAt: Date | null, assigneeId: string | null) {
  if (!can(user.role, "leads.manage")) throw new ForbiddenError();
  await loadLeadAccess(user, leadId);
  if (title.length < 3) throw new UserError("Опишите задачу");
  await db.task.create({ data: { leadId, title, dueAt, assigneeId: assigneeId || user.id } });
}

export async function toggleTask(user: SessionUser, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError("Задача");
  if (task.leadId) await loadLeadAccess(user, task.leadId);
  if (user.role === "CUSTOMER") throw new ForbiddenError();
  await db.task.update({ where: { id: taskId }, data: { doneAt: task.doneAt ? null : new Date() } });
}

export interface OfferItem {
  title: string;
  qty: number;
  unit: string;
  price: number;
}

export async function createOffer(user: SessionUser, leadId: string, items: OfferItem[], termDays: number, validDays: number, notes: string) {
  if (!can(user.role, "offers.manage")) throw new ForbiddenError();
  const lead = await loadLeadAccess(user, leadId);
  const clean = items.filter((i) => i.title.trim() && i.qty > 0 && i.price >= 0);
  if (!clean.length) throw new UserError("Добавьте хотя бы одну позицию");
  if (termDays < 1) throw new UserError("Укажите срок выполнения");
  const total = Math.round(clean.reduce((s, i) => s + i.qty * i.price, 0));
  const prevCount = await db.commercialOffer.count({ where: { leadId } });
  const offer = await db.commercialOffer.create({
    data: {
      leadId,
      version: prevCount + 1,
      items: clean as unknown as Prisma.InputJsonValue,
      total,
      termDays,
      validUntil: new Date(Date.now() + validDays * 86400_000),
      notes: notes || null,
      createdById: user.id,
    },
  });
  if (["new", "qualification", "tz_preparation"].includes(lead.status)) {
    await db.lead.update({ where: { id: leadId }, data: { status: "commercial_offer" } });
    await db.statusChange.create({ data: { entityType: "Lead", entityId: leadId, fromStatus: lead.status, toStatus: "commercial_offer", actorId: user.id, comment: `КП №${offer.number}` } });
  }
  await audit({ actorId: user.id, action: "offer.create", entityType: "CommercialOffer", entityId: offer.id, meta: { total } });
  return offer;
}

export async function setOfferStatus(user: SessionUser, offerId: string, status: "SENT" | "ACCEPTED" | "REJECTED") {
  const offer = await db.commercialOffer.findUnique({ where: { id: offerId }, include: { lead: true } });
  if (!offer) throw new NotFoundError("Коммерческое предложение");
  await loadLeadAccess(user, offer.leadId);
  const isCustomer = user.role === "CUSTOMER";
  if (isCustomer && (status === "SENT" || offer.status !== "SENT")) throw new ForbiddenError();
  if (!isCustomer && !can(user.role, "offers.manage")) throw new ForbiddenError();
  await db.commercialOffer.update({ where: { id: offerId }, data: { status } });
  if (status === "SENT") {
    await notify([offer.lead.customerId], "approval.pending", `Коммерческое предложение по заявке №${offer.lead.number}`, `Сумма: ${offer.total.toLocaleString("ru-RU")} ₽, срок ${offer.termDays} дн.`, `/cabinet/leads/${offer.leadId}`);
    if (!offer.lead.customerId) {
      await queueEmail(offer.lead.email, `Коммерческое предложение №${offer.number}`, `Здравствуйте, ${offer.lead.contactName}!\n\nПодготовлено коммерческое предложение на сумму ${offer.total.toLocaleString("ru-RU")} ₽, срок выполнения ${offer.termDays} дн.\nЗарегистрируйтесь в личном кабинете с этой почтой, чтобы увидеть детали.`);
    }
  } else if (isCustomer) {
    await notify([offer.lead.managerId], "status.changed", `Заказчик ${status === "ACCEPTED" ? "принял" : "отклонил"} КП №${offer.number}`, undefined, `/cabinet/leads/${offer.leadId}`);
  }
}
