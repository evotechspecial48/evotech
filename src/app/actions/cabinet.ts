"use server";

// Серверные действия кабинета. Каждое действие: проверка сессии и прав → сервис → результат для формы.
// Права проверяются повторно внутри сервисов (защита от обхода интерфейса).

import { redirect } from "next/navigation";
import type { LeadStatus, Role, StageCode, StructureType } from "@prisma/client";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientInfo } from "@/lib/request";
import { num, runAction, str, UserError, type ActionState } from "@/lib/errors";
import { ROLES } from "@/domain/rbac";
import type { StageAction } from "@/domain/stage";
import type { QuickOrderParams } from "@/domain/quick-order";
import { SPEC_FIELDS } from "@/domain/spec";
import * as leads from "@/services/leads";
import * as projects from "@/services/projects";
import * as specs from "@/services/specs";
import * as stages from "@/services/stages";
import * as timer from "@/services/timer";
import * as contracts from "@/services/contracts";
import * as payments from "@/services/payments";
import * as quick from "@/services/quick-orders";
import * as aiJobs from "@/services/ai-jobs";
import * as variants from "@/services/project-variants";
import * as users from "@/services/users";
import { softDeleteFile } from "@/services/files";
import { loadProjectAccess } from "@/services/scope";

// ---------- Заявки ----------

export async function createLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor(["leads.create", "leads.manage"]);
    const { ip } = await clientInfo();
    const lead = await leads.createLead(
      {
        title: str(fd, "title", 200),
        contactName: user.role === "CUSTOMER" ? user.name : str(fd, "contactName", 120),
        email: user.role === "CUSTOMER" ? user.email : str(fd, "email", 200),
        phone: user.role === "CUSTOMER" ? (user.phone ?? "") : str(fd, "phone", 30),
        companyName: str(fd, "companyName", 200),
        objectType: str(fd, "objectType", 100),
        description: str(fd, "description", 4000),
        budget: str(fd, "budget", 100),
        source: user.role === "CUSTOMER" ? "cabinet" : (str(fd, "source") as "manual" | "phone") === "phone" ? "phone" : "manual",
      },
      user,
      ip,
    );
    return { ok: true, data: { redirect: `/cabinet/leads/${lead.id}` } };
  });
}

export async function leadStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("leads.manage");
    await leads.changeLeadStatus(user, str(fd, "leadId"), str(fd, "status") as LeadStatus, str(fd, "reason", 500));
    return { ok: true, message: "Статус изменён" };
  });
}

export async function leadAssignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("leads.manage");
    await leads.assignLeadManager(user, str(fd, "leadId"), str(fd, "managerId"));
    return { ok: true, message: "Ответственный назначен" };
  });
}

export async function leadCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await leads.addLeadComment(user, str(fd, "leadId"), str(fd, "body", 4000), fd.get("internal") === "on");
  });
}

export async function leadTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("leads.manage");
    const due = str(fd, "dueAt");
    await leads.addLeadTask(user, str(fd, "leadId"), str(fd, "title", 300), due ? new Date(due) : null, str(fd, "assigneeId") || null);
  });
}

export async function toggleTaskAction(fd: FormData) {
  const user = await actor();
  await leads.toggleTask(user, str(fd, "taskId"));
}

export async function createOfferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("offers.manage");
    const titles = fd.getAll("itemTitle").map(String);
    const items = titles.map((title, i) => ({
      title: title.trim(),
      qty: Number(fd.getAll("itemQty")[i] ?? 1),
      unit: String(fd.getAll("itemUnit")[i] ?? "компл."),
      price: Number(String(fd.getAll("itemPrice")[i] ?? 0).replace(",", ".")),
    }));
    await leads.createOffer(user, str(fd, "leadId"), items, num(fd, "termDays") ?? 0, num(fd, "validDays") ?? 14, str(fd, "notes", 2000));
    return { ok: true, message: "Коммерческое предложение сформировано" };
  });
}

export async function offerStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await leads.setOfferStatus(user, str(fd, "offerId"), str(fd, "status") as "SENT" | "ACCEPTED" | "REJECTED");
    return { ok: true, message: "Готово" };
  });
}

export async function previewContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("contracts.manage");
    const body = await contracts.previewLeadContract(user, str(fd, "leadId"), num(fd, "amount") ?? 0, num(fd, "termDays") ?? 0);
    return { ok: true, data: { preview: body } };
  });
}

export async function createContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("contracts.manage");
    const c = await contracts.createLeadContract(user, str(fd, "leadId"), num(fd, "amount") ?? 0, num(fd, "termDays") ?? 0);
    return { ok: true, data: { redirect: `/cabinet/contracts/${c.id}` } };
  });
}

export async function convertLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("projects.create");
    const p = await projects.convertLeadToProject(user, str(fd, "leadId"), str(fd, "managerId") || null);
    return { ok: true, data: { redirect: `/cabinet/projects/${p.id}` } };
  });
}

export async function ensureSpecAction(fd: FormData) {
  const user = await actor();
  const spec = await specs.ensureLeadSpec(user, str(fd, "leadId"));
  redirect(`/cabinet/specs/${spec.id}`);
}

// ---------- ТЗ ----------

export async function saveSpecAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("spec.edit");
    const raw: Record<string, unknown> = {};
    for (const f of SPEC_FIELDS) raw[f.key] = str(fd, f.key, 5000);
    const res = await specs.saveSpec(user, str(fd, "specId"), raw, str(fd, "changeNote", 300));
    if (fd.get("intent") === "submit") {
      await specs.submitSpec(user, str(fd, "specId"));
      return { ok: true, message: "ТЗ отправлено на проверку" };
    }
    return { ok: true, message: res.changed ? `Сохранено: изменено полей — ${res.changed}` : "Изменений нет" };
  });
}

export async function specClarifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("spec.edit");
    await specs.requestClarification(user, str(fd, "specId"), str(fd, "comment", 2000));
    return { ok: true, message: "Запрос уточнений отправлен заказчику" };
  });
}

export async function specApproveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("spec.approve");
    await specs.approveSpec(user, str(fd, "specId"));
    return { ok: true, message: "ТЗ утверждено, создан неизменяемый снимок" };
  });
}

// ---------- Проекты, этапы, таймер ----------

export async function stageActionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await stages.stageAction(user, str(fd, "stageId"), str(fd, "action") as StageAction, str(fd, "comment", 3000));
    return { ok: true, message: "Готово" };
  });
}

export async function uploadVersionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("stages.work");
    const fileIds = str(fd, "fileIds").split(",").filter(Boolean);
    const v = await stages.uploadVersion(user, str(fd, "stageId"), str(fd, "description", 3000), fileIds);
    return { ok: true, message: `Версия ${v.version} создана` };
  });
}

export async function assignTeamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("projects.assign");
    await projects.assignTeam(user, str(fd, "projectId"), str(fd, "managerId") || null, fd.getAll("designerIds").map(String));
    return { ok: true, message: "Команда проекта обновлена" };
  });
}

export async function projectStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("projects.manage");
    await projects.setProjectStatus(user, str(fd, "projectId"), str(fd, "status") as "ACTIVE" | "ON_HOLD" | "CANCELLED", str(fd, "comment", 500));
    return { ok: true, message: "Статус проекта изменён" };
  });
}

export async function projectCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await projects.addProjectComment(user, str(fd, "projectId"), str(fd, "body", 4000), fd.get("internal") === "on", str(fd, "stageId") || null);
  });
}

export async function createRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("requests.create");
    await projects.createCustomerRequest(user, str(fd, "projectId"), str(fd, "question", 3000), (str(fd, "stageCode") || null) as StageCode | null, fd.get("pausesTimer") === "on");
    return { ok: true, message: "Запрос отправлен заказчику" };
  });
}

export async function answerRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await projects.answerCustomerRequest(user, str(fd, "requestId"), str(fd, "answer", 4000));
    return { ok: true, message: "Ответ отправлен" };
  });
}

export async function cancelRequestAction(fd: FormData) {
  const user = await actor("requests.create");
  await projects.cancelCustomerRequest(user, str(fd, "requestId"));
}

async function assertManage(projectId: string) {
  const user = await actor("timer.manage");
  const a = await loadProjectAccess(user, projectId);
  if (!a.canManage) throw new UserError("Управлять сроками может руководитель проекта или директор");
  return user;
}

export async function timerPauseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertManage(str(fd, "projectId"));
    await timer.manualPause(str(fd, "projectId"), user.id, str(fd, "reason", 500));
    return { ok: true, message: "Таймер остановлен" };
  });
}

export async function timerResumeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertManage(str(fd, "projectId"));
    await timer.manualResume(str(fd, "projectId"), user.id, str(fd, "note", 500));
    return { ok: true, message: "Отсчёт возобновлён" };
  });
}

export async function timerStartAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertManage(str(fd, "projectId"));
    await timer.startTimer(str(fd, "projectId"), user.id);
    return { ok: true, message: "Таймер запущен" };
  });
}

export async function timerUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertManage(str(fd, "projectId"));
    const start = str(fd, "startedAt");
    await timer.updateDeadline(str(fd, "projectId"), user.id, num(fd, "durationDays") ?? 0, str(fd, "mode") === "CALENDAR" ? "CALENDAR" : "WORKING", start ? new Date(start) : null, str(fd, "reason", 500));
    return { ok: true, message: "Сроки обновлены" };
  });
}

export async function deletePauseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("timer.delete_pause");
    await timer.deletePause(str(fd, "pauseId"), user.id, str(fd, "reason", 500));
    return { ok: true, message: "Запись о паузе удалена (действие записано в журнал)" };
  });
}

export async function deleteFileAction(fd: FormData) {
  const user = await actor();
  await softDeleteFile(user, str(fd, "fileId"));
}

export async function startProjectVariantsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("projects.manage");
    await variants.startProjectVariants(user, str(fd, "projectId"));
    return { ok: true, message: "Генерация вариантов запущена" };
  });
}

export async function selectProjectVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await variants.selectProjectVariant(user, str(fd, "variantId"));
    return { ok: true, message: "Вариант выбран" };
  });
}

// ---------- Договоры и оплата ----------

export async function contractOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("contracts.accept");
    const res = await contracts.requestContractOtp(user, str(fd, "contractId"));
    return { ok: true, message: `Код отправлен на ${user.email}.${res.devHint ? ` ${res.devHint}` : ""}` };
  });
}

export async function contractAcceptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("contracts.accept");
    const { ip, userAgent } = await clientInfo();
    await contracts.acceptContract(user, str(fd, "contractId"), str(fd, "code", 10), fd.get("agree") === "on", ip, userAgent);
    const back = str(fd, "back");
    return { ok: true, message: "Договор подтверждён", data: back ? { redirect: back } : undefined };
  });
}

export async function contractReviseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("contracts.manage");
    await contracts.reviseContract(user, str(fd, "contractId"), str(fd, "body", 100000), num(fd, "amount") ?? 0, num(fd, "termDays") ?? 0);
    return { ok: true, message: "Создана новая версия договора" };
  });
}

export async function contractCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("contracts.manage");
    await contracts.cancelContract(user, str(fd, "contractId"));
    return { ok: true, message: "Договор аннулирован" };
  });
}

export async function payQuickOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("payments.pay");
    const { paymentUrl } = await payments.createQuickOrderPayment(user, str(fd, "quickOrderId"));
    return { ok: true, data: { redirect: paymentUrl } };
  });
}

export async function mockBankAction(fd: FormData) {
  const user = await actor();
  const orderId = str(fd, "orderId");
  const payment = await db.payment.findUnique({ where: { orderId } });
  if (!payment || payment.payerId !== user.id) throw new UserError("Платёж не найден");
  const outcome = str(fd, "outcome") === "success" ? "success" : "fail";
  await payments.simulateMockBank(orderId, outcome);
  redirect(payment.quickOrderId ? `/cabinet/quick-orders/${payment.quickOrderId}?payment=${outcome}` : "/cabinet/payments");
}

export async function refundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("payments.view_all");
    await payments.requestRefund(user, str(fd, "paymentId"));
    return { ok: true, message: "Запрос на возврат отправлен" };
  });
}

// ---------- Быстрый заказ ----------

export async function createQuickOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("quick_orders.create");
    const params: QuickOrderParams = {
      length: num(fd, "length") ?? 0,
      width: num(fd, "width") ?? 0,
      height: num(fd, "height") ?? 0,
      roofType: str(fd, "roofType") as QuickOrderParams["roofType"],
      covering: str(fd, "covering") as QuickOrderParams["covering"],
      frame: str(fd, "frame") as QuickOrderParams["frame"],
      foundation: str(fd, "foundation") as QuickOrderParams["foundation"],
      region: str(fd, "region", 200),
      snowDistrict: str(fd, "snowDistrict") as QuickOrderParams["snowDistrict"],
      color: str(fd, "color", 60),
      attachedToBuilding: fd.get("attachedToBuilding") === "on",
      gates: fd.get("gates") === "on",
      notes: str(fd, "notes", 2000),
    };
    const order = await quick.createQuickOrder(user, str(fd, "structureType") as StructureType, params, str(fd, "photoIds").split(",").filter(Boolean));
    return { ok: true, data: { redirect: `/cabinet/quick-orders/${order.id}` } };
  });
}

export async function selectVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("quick_orders.create");
    await quick.selectVariant(user, str(fd, "quickOrderId"), str(fd, "variantId"));
    return { ok: true, message: "Вариант выбран. Подтвердите договор." };
  });
}

export async function retryJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await aiJobs.retryJob(user, str(fd, "jobId"));
    return { ok: true, message: "Задача перезапущена" };
  });
}

export async function cancelQuickOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await quick.cancelQuickOrder(user, str(fd, "quickOrderId"));
    return { ok: true, message: "Заказ отменён" };
  });
}

// ---------- Уведомления ----------

export async function markNotificationsReadAction() {
  const user = await actor();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}

export async function openNotificationAction(fd: FormData) {
  const user = await actor();
  const n = await db.notification.findFirst({ where: { id: str(fd, "id"), userId: user.id } });
  if (n) await db.notification.update({ where: { id: n.id }, data: { readAt: n.readAt ?? new Date() } });
  redirect(n?.link?.startsWith("/") ? n.link : "/cabinet/notifications");
}

// ---------- Пользователи и настройки ----------

export async function inviteUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("users.manage");
    const role = str(fd, "role") as Role;
    if (!ROLES.includes(role)) throw new UserError("Выберите роль");
    const res = await users.inviteUser(user, { email: str(fd, "email"), name: str(fd, "name", 120), role, phone: str(fd, "phone"), position: str(fd, "position") });
    return { ok: true, message: res.invited ? "Приглашение отправлено" : "Пользователь уже зарегистрирован" };
  });
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("users.manage");
    await users.updateUser(user, str(fd, "userId"), { name: str(fd, "name", 120), role: str(fd, "role") as Role, phone: str(fd, "phone"), position: str(fd, "position") });
    return { ok: true, message: "Сохранено" };
  });
}

export async function userStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("users.manage");
    await users.setUserStatus(user, str(fd, "userId"), str(fd, "status") === "BLOCKED" ? "BLOCKED" : "ACTIVE");
    return { ok: true, message: "Статус изменён" };
  });
}

export async function anonymizeUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("users.manage");
    await users.anonymizeUser(user, str(fd, "userId"));
    return { ok: true, message: "Персональные данные обезличены" };
  });
}

export async function updateSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("settings.manage");
    const maxSize = num(fd, "maxSizeMb");
    if (!maxSize || maxSize < 1 || maxSize > 2000) throw new UserError("Размер файла: от 1 до 2000 МБ");
    const holidays = str(fd, "holidays", 5000).split(/[\s,;]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const requisites = {
      name: str(fd, "reqName", 200),
      inn: str(fd, "reqInn", 20),
      city: str(fd, "reqCity", 100),
      address: str(fd, "reqAddress", 300),
      bank: str(fd, "reqBank", 300),
      phone: str(fd, "reqPhone", 50),
      email: str(fd, "reqEmail", 100),
    };
    const entries: [string, unknown][] = [
      ["timer.defaultMode", str(fd, "timerMode") === "CALENDAR" ? "CALENDAR" : "WORKING"],
      ["files.maxSizeMb", maxSize],
      ["calendar.holidays", holidays],
      ["company.requisites", requisites],
    ];
    for (const [key, value] of entries) {
      await db.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
    }
    await audit({ actorId: user.id, action: "settings.update" });
    return { ok: true, message: "Настройки сохранены" };
  });
}

export async function updateTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor("settings.manage");
    const tpl = await db.documentTemplate.findUnique({ where: { id: str(fd, "templateId") } });
    if (!tpl) throw new UserError("Шаблон не найден");
    const body = str(fd, "body", 100000);
    if (body.length < 50) throw new UserError("Слишком короткий шаблон");
    // Новая версия шаблона; старая сохраняется для истории
    await db.$transaction([
      db.documentTemplate.update({ where: { id: tpl.id }, data: { active: false } }),
      db.documentTemplate.create({ data: { kind: tpl.kind, name: str(fd, "name", 200) || tpl.name, body, version: tpl.version + 1 } }),
    ]);
    await audit({ actorId: user.id, action: "template.update", entityType: "DocumentTemplate", entityId: tpl.id, meta: { version: tpl.version + 1 } });
    return { ok: true, message: `Сохранена версия ${tpl.version + 1}` };
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    const { cookies } = await import("next/headers");
    const { sha256 } = await import("@/lib/crypto");
    const token = (await cookies()).get("evo_session")?.value;
    await users.changePassword(user, String(fd.get("current") ?? ""), String(fd.get("password") ?? ""), token ? sha256(token) : null);
    return { ok: true, message: "Пароль изменён. Другие сеансы завершены." };
  });
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    const name = str(fd, "name", 120);
    if (name.length < 2) throw new UserError("Укажите имя", { name: "Укажите имя" });
    await db.user.update({ where: { id: user.id }, data: { name, phone: str(fd, "phone", 30) || null } });
    return { ok: true, message: "Профиль сохранён" };
  });
}

export async function resendVerificationAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await actor();
    await users.sendVerification(user.id, user.email);
    return { ok: true, message: "Письмо отправлено" };
  });
}
