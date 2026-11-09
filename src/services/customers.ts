import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { can, ForbiddenError } from "@/domain/rbac";
import { renderTemplate } from "@/domain/spec";
import { activeTemplate, contractVars, createContractTx, nextNumber } from "./contracts";
import { createProjectTx } from "./projects";
import { inviteUser, isEmail, normalizeEmail } from "./users";

export interface ManualProjectInput {
  customer: { name: string; email: string; phone: string; position: string };
  company: { name: string; inn: string; kpp: string; ogrn: string; legalAddress: string; bankDetails: string; phone: string };
  project: { title: string; objectType: string; address: string; description: string; amount: number; termDays: number; startedAt: Date | null; contractNumber: string; contractSigned: boolean; briefApproved: boolean };
  team: { managerId: string | null; designerId: string | null; fee: number | null; advance: number | null };
  invite: boolean;
}

/** Реквизиты организации заказчика одной строкой — для договора и карточки проекта. */
export function requisitesLine(c: { name?: string | null; inn?: string | null; kpp?: string | null; ogrn?: string | null; legalAddress?: string | null; bankDetails?: string | null; phone?: string | null } | null | undefined): string {
  if (!c) return "";
  return [
    c.name,
    c.inn && `ИНН ${c.inn}`,
    c.kpp && `КПП ${c.kpp}`,
    c.ogrn && `ОГРН ${c.ogrn}`,
    c.legalAddress && `адрес: ${c.legalAddress}`,
    c.bankDetails && `банк: ${c.bankDetails}`,
    c.phone && `тел.: ${c.phone}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Ручное заведение заказчика и проекта (РП, менеджер проектов, директор) — для заказов,
 * пришедших вне сайта. Создаются: организация с реквизитами, учётная запись заказчика,
 * заявка в статусе «Договор заключён», договор на указанную сумму и проект с командой.
 * Если договор подписан вне кабинета — таймер запускается с даты начала; иначе заказчик
 * подписывает договор в кабинете, и таймер стартует в момент подписания.
 */
export async function createManualProject(user: SessionUser, input: ManualProjectInput) {
  if (!can(user.role, "projects.create")) throw new ForbiddenError();
  const { customer: c, company, project: p, team } = input;
  const email = normalizeEmail(c.email);
  const errors: Record<string, string> = {};
  if (c.name.trim().length < 2) errors.customerName = "Укажите контактное лицо";
  if (!isEmail(email)) errors.email = "Некорректный адрес";
  if (p.title.trim().length < 3) errors.title = "Укажите название проекта";
  if (!(p.amount > 0)) errors.amount = "Укажите стоимость";
  if (!(p.termDays > 0) || p.termDays > 1000) errors.termDays = "Срок от 1 до 1000 дней";
  if (company.inn && !/^\d{10}(\d{2})?$/.test(company.inn)) errors.inn = "ИНН — 10 или 12 цифр";
  if (company.kpp && !/^\d{9}$/.test(company.kpp)) errors.kpp = "КПП — 9 цифр";
  if (company.ogrn && !/^\d{13}(\d{2})?$/.test(company.ogrn)) errors.ogrn = "ОГРН — 13 или 15 цифр";
  if (Object.keys(errors).length) throw new UserError("Проверьте заполнение формы", errors);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.role !== "CUSTOMER") throw new UserError("Эта почта принадлежит сотруднику", { email: "Почта сотрудника" });
  const contractNumber = p.contractNumber.trim() || (await nextNumber("Д"));
  if (await db.contract.findUnique({ where: { number: contractNumber } })) throw new UserError(`Договор ${contractNumber} уже есть в системе`, { contractNumber: "Номер занят" });

  const managerId = team.managerId ?? (user.role === "PROJECT_MANAGER" ? user.id : null);
  if (managerId && !(await db.user.findFirst({ where: { id: managerId, role: { in: ["PROJECT_MANAGER", "DIRECTOR"] }, status: { not: "BLOCKED" } } }))) {
    throw new UserError("Руководитель проекта не найден");
  }
  if (team.designerId && !(await db.user.findFirst({ where: { id: team.designerId, role: "DESIGNER", status: { not: "BLOCKED" } } }))) {
    throw new UserError("Проектировщик не найден");
  }

  const companyName = company.name.trim() || null;
  const tpl = await activeTemplate("CONTRACT");
  const requisites = requisitesLine(company);
  const rendered = renderTemplate(
    tpl.body,
    await contractVars({
      number: contractNumber,
      customerName: c.name,
      customerEmail: email,
      customerPhone: c.phone,
      companyName,
      subject: p.title,
      amount: p.amount,
      termDays: p.termDays,
      extra: { customerRequisites: requisites },
    }),
  );
  // Шаблоны, созданные до появления переменной {{customerRequisites}}, — реквизиты дописываются в конец
  const body = requisites && !tpl.body.includes("customerRequisites") ? `${rendered}\n\nРеквизиты Заказчика: ${requisites}` : rendered;
  const startedAt = p.contractSigned ? (p.startedAt ?? new Date()) : null;

  const result = await db.$transaction(async (tx) => {
    // Заказчик: существующая учётная запись переиспользуется, реквизиты обновляются
    const companyData = { name: companyName ?? c.name, inn: company.inn || null, kpp: company.kpp || null, ogrn: company.ogrn || null, legalAddress: company.legalAddress || null, bankDetails: company.bankDetails || null, phone: company.phone || null };
    let customer = existing;
    if (!customer) {
      customer = await tx.user.create({ data: { email, name: c.name, phone: c.phone || null, position: c.position || null, role: "CUSTOMER", status: "INVITED", company: { create: companyData } } });
    } else if (customer.companyId) {
      await tx.company.update({ where: { id: customer.companyId }, data: companyData });
    } else {
      await tx.user.update({ where: { id: customer.id }, data: { company: { create: companyData } } });
    }

    const lead = await tx.lead.create({
      data: {
        title: p.title,
        contactName: c.name,
        email,
        phone: c.phone || null,
        companyName,
        objectType: p.objectType || null,
        description: p.description || null,
        budget: `${p.amount.toLocaleString("ru-RU")} ₽`,
        status: "won",
        source: "manual",
        managerId: user.role === "SALES_MANAGER" ? user.id : null,
        customerId: customer.id,
      },
    });
    await tx.statusChange.create({ data: { entityType: "Lead", entityId: lead.id, toStatus: "won", actorId: user.id, comment: "Заказчик заведён вручную" } });

    const project = await createProjectTx(
      tx,
      {
        title: p.title,
        customerId: customer.id,
        leadId: lead.id,
        managerId,
        salesManagerId: user.role === "SALES_MANAGER" ? user.id : null,
        objectType: p.objectType || null,
        address: p.address || null,
        description: p.description || null,
        durationDays: p.termDays,
        startedAt,
        briefApproved: p.briefApproved,
      },
      user.id,
    );

    const contract = await createContractTx(tx, { number: contractNumber, customerId: customer.id, amount: p.amount, termDays: p.termDays, body, templateId: tpl.id, leadId: lead.id, createdById: user.id });
    await tx.contract.update({ where: { id: contract.id }, data: { projectId: project.id, ...(p.contractSigned ? { status: "SIGNED", signedAt: startedAt } : {}) } });

    if (team.designerId) {
      await tx.projectMember.create({ data: { projectId: project.id, userId: team.designerId, fee: team.fee, advance: team.advance } });
      await tx.projectStage.updateMany({ where: { projectId: project.id, code: { in: p.briefApproved ? ["sketch"] : ["brief", "sketch"] } }, data: { assigneeId: team.designerId } });
    }
    return { project, customerId: customer.id, contractId: contract.id, isNewCustomer: !existing };
  });

  await audit({ actorId: user.id, action: "customer.create", entityType: "User", entityId: result.customerId, projectId: result.project.id, meta: { newCustomer: result.isNewCustomer } });
  await audit({ actorId: user.id, action: "project.create", entityType: "Project", entityId: result.project.id, projectId: result.project.id, meta: { manual: true, amount: p.amount, contract: contractNumber, signed: p.contractSigned } });

  let invited = false;
  if (input.invite) invited = (await inviteUser(user, { email, name: c.name, role: "CUSTOMER", phone: c.phone || undefined })).invited;
  const link = `/cabinet/projects/${result.project.id}`;
  await notify([managerId], "project.assigned", `Вам передан проект №${result.project.number}`, `«${p.title}», заказчик заведён вручную.`, link, { exceptUserId: user.id });
  await notify([team.designerId], "project.assigned", `Вы назначены на проект №${result.project.number}`, `«${p.title}»`, link);
  if (!p.contractSigned) {
    await notify([result.customerId], "approval.pending", `Договор ${contractNumber} ожидает подписания`, `Сумма ${p.amount.toLocaleString("ru-RU")} ₽, срок ${p.termDays} дн.`, `/cabinet/contracts/${result.contractId}`);
  }
  return { project: result.project, invited };
}
