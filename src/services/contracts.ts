import type { Contract, Prisma, TemplateKind } from "@prisma/client";
import { db } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { queueEmail } from "@/lib/mailer";
import { otpCode, sha256 } from "@/lib/crypto";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { can, ForbiddenError } from "@/domain/rbac";
import { checksum, renderTemplate } from "@/domain/spec";
import { rublesInWords } from "@/domain/money-words";
import { loadLeadAccess } from "./scope";
import { inviteUser } from "./users";

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

export async function activeTemplate(kind: TemplateKind) {
  const t = await db.documentTemplate.findFirst({ where: { kind, active: true }, orderBy: { version: "desc" } });
  if (!t) throw new UserError("Не найден активный шаблон документа — настройте его в разделе «Настройки»");
  return t;
}

export async function companyRequisites(): Promise<Record<string, string>> {
  const s = await db.setting.findUnique({ where: { key: "company.requisites" } });
  return (s?.value as Record<string, string>) ?? {};
}

const fmtDate = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
const money = (n: number) => n.toLocaleString("ru-RU");
/** «10» ноября 2026 г. — как в бланке договора. */
export const longDate = (d: Date) => {
  const [day, month, year] = d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "long", year: "numeric" }).replace(" г.", "").split(" ");
  return `«${day}» ${month} ${year} г.`;
};

/** Вступление договора за Заказчика: организация «в лице …», ИП или физическое лицо. */
function customerIntro(companyName: string | null | undefined, contact: string): string {
  if (!companyName) return `${contact}, именуемый(-ая) в дальнейшем «Заказчик»`;
  if (/^(ИП|индивидуальный предприниматель)\b/i.test(companyName)) return `${companyName}, именуемый в дальнейшем «Заказчик»`;
  return `${companyName} в лице ${contact}, действующего на основании Устава, именуемое в дальнейшем «Заказчик»`;
}

export async function contractVars(input: {
  number: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  companyName?: string | null;
  /** Строки реквизитов Заказчика (ИНН, адрес, банк…) — для блока «Реквизиты сторон». */
  customerRequisites?: string[];
  subject: string;
  amount: number;
  termDays: number;
  extra?: Record<string, string>;
}) {
  const req = await companyRequisites();
  const customerBlock = [input.companyName || input.customerName, ...(input.customerRequisites ?? []), `Эл. почта: ${input.customerEmail}`, input.customerPhone ? `Тел.: ${input.customerPhone}` : ""].filter(Boolean);
  return {
    number: input.number,
    date: fmtDate(new Date()),
    dateLong: longDate(new Date()),
    city: req.city ?? "Липецк",
    executorName: req.name,
    executorShortName: req.shortName ?? req.name,
    executorSigner: req.signer,
    executorInn: req.inn,
    executorOgrnip: req.ogrnip,
    executorSro: req.sro,
    executorAddress: req.address,
    executorBank: req.bank,
    executorAccount: req.account,
    executorBankName: req.bankName,
    executorCorrAccount: req.corrAccount,
    executorBik: req.bik,
    executorEmail: req.email,
    executorPhone: req.phone,
    customerName: input.companyName || input.customerName,
    customerContact: input.customerName,
    customerIntro: customerIntro(input.companyName, input.customerName),
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone ?? "",
    // Многострочная ячейка таблицы реквизитов (перенос строки — <br>)
    customerRequisites: customerBlock.join("<br>"),
    subject: input.subject,
    amount: money(input.amount),
    amountWords: rublesInWords(input.amount),
    prepayAmount: money(Math.round(input.amount / 2)),
    termDays: String(input.termDays),
    ...input.extra,
  };
}

export async function nextNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.contract.count({ where: { number: { startsWith: `${prefix}-${year}` } } });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createContractTx(
  tx: Prisma.TransactionClient,
  data: { number: string; customerId: string; amount: number; termDays: number; body: string; templateId: string; leadId?: string; quickOrderId?: string; createdById: string | null },
): Promise<Contract> {
  return tx.contract.create({
    data: {
      number: data.number,
      status: "AWAITING_SIGNATURE",
      customerId: data.customerId,
      amount: data.amount,
      termDays: data.termDays,
      leadId: data.leadId ?? null,
      quickOrderId: data.quickOrderId ?? null,
      versions: { create: { version: 1, body: data.body, checksum: checksum(data.body), templateId: data.templateId, createdById: data.createdById } },
    },
  });
}

export async function previewLeadContract(user: SessionUser, leadId: string, amount: number, termDays: number) {
  if (!can(user.role, "contracts.manage")) throw new ForbiddenError();
  const lead = await loadLeadAccess(user, leadId);
  const tpl = await activeTemplate("CONTRACT");
  const vars = await contractVars({
    number: "(будет присвоен)",
    customerName: lead.contactName,
    customerEmail: lead.email ?? "",
    customerPhone: lead.phone,
    companyName: lead.companyName,
    subject: lead.title,
    amount,
    termDays,
  });
  return renderTemplate(tpl.body, vars);
}

/** Договор по заявке: заказчик приглашается в кабинет (если ещё не зарегистрирован), заявка → «Ожидает подписания». */
export async function createLeadContract(user: SessionUser, leadId: string, amount: number, termDays: number) {
  if (!can(user.role, "contracts.manage")) throw new ForbiddenError();
  if (amount <= 0 || termDays <= 0) throw new UserError("Укажите сумму и срок");
  const lead = await loadLeadAccess(user, leadId);
  if (["won", "lost"].includes(lead.status)) throw new UserError("Заявка закрыта");
  const open = await db.contract.findFirst({ where: { leadId, status: { in: ["AWAITING_SIGNATURE", "SIGNED"] } } });
  if (open) throw new UserError(`По заявке уже есть договор ${open.number}. Измените его или аннулируйте.`);
  // Почта нужна для приглашения в кабинет и кода подписания
  const email = lead.email;
  if (!email) throw new UserError("Укажите почту заказчика в контактах заявки — на неё придут приглашение в кабинет и код подписания договора");
  let customerId = lead.customerId;
  if (!customerId) {
    const { user: customer } = await inviteUser(user, { email, name: lead.contactName, role: "CUSTOMER", phone: lead.phone ?? undefined });
    customerId = customer.id;
    await db.lead.update({ where: { id: leadId }, data: { customerId } });
  }
  const tpl = await activeTemplate("CONTRACT");
  const number = await nextNumber("Д");
  const body = renderTemplate(
    tpl.body,
    await contractVars({ number, customerName: lead.contactName, customerEmail: email, customerPhone: lead.phone, companyName: lead.companyName, subject: lead.title, amount, termDays }),
  );
  const contract = await db.$transaction(async (tx) => {
    const c = await createContractTx(tx, { number, customerId: customerId!, amount, termDays, body, templateId: tpl.id, leadId, createdById: user.id });
    if (lead.status !== "awaiting_signature") {
      await tx.lead.update({ where: { id: leadId }, data: { status: "awaiting_signature" } });
      await tx.statusChange.create({ data: { entityType: "Lead", entityId: leadId, fromStatus: lead.status, toStatus: "awaiting_signature", actorId: user.id, comment: `Договор ${number}` } });
    }
    return c;
  });
  await audit({ actorId: user.id, action: "contract.create", entityType: "Contract", entityId: contract.id, meta: { number, amount } });
  await notify([customerId], "approval.pending", `Договор ${number} ожидает подписания`, `Сумма ${money(amount)} ₽, срок ${termDays} дн.`, `/cabinet/contracts/${contract.id}`);
  return contract;
}

/** Корректировка договора — новая версия; ранее выданные коды подтверждения становятся недействительными. */
export async function reviseContract(user: SessionUser, contractId: string, body: string, amount: number, termDays: number) {
  if (!can(user.role, "contracts.manage")) throw new ForbiddenError();
  const contract = await db.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new NotFoundError("Договор");
  // Правка подписанного договора — новая редакция, заказчик подписывает её заново; прежняя подпись остаётся в истории
  if (contract.status === "CANCELLED") throw new UserError("Договор аннулирован");
  if (body.trim().length < 50) throw new UserError("Текст договора слишком короткий");
  const version = contract.currentVersion + 1;
  await db.$transaction([
    db.contractVersion.create({ data: { contractId, version, body, checksum: checksum(body), createdById: user.id } }),
    // Документ в СБИС относится к прежней редакции — новую нужно отправить заново
    db.contract.update({ where: { id: contractId }, data: { currentVersion: version, amount, termDays, status: "AWAITING_SIGNATURE", sbisDocumentId: null, sbisStateCode: null, sbisStateName: null, sbisLink: null, sbisSentAt: null } }),
    db.authToken.deleteMany({ where: { type: "CONTRACT_OTP", subjectId: { not: null }, usedAt: null, user: { id: contract.customerId } } }),
  ]);
  await audit({ actorId: user.id, action: "contract.create", entityType: "Contract", entityId: contractId, meta: { version } });
  await notify([contract.customerId], "approval.pending", `Договор ${contract.number} обновлён (версия ${version})`, "Ознакомьтесь с актуальной редакцией и подтвердите её.", `/cabinet/contracts/${contractId}`);
}

export async function cancelContract(user: SessionUser, contractId: string) {
  if (!can(user.role, "contracts.manage")) throw new ForbiddenError();
  const c = await db.contract.findUnique({ where: { id: contractId } });
  if (!c) throw new NotFoundError("Договор");
  if (c.status === "SIGNED") throw new UserError("Подписанный договор аннулируется по соглашению сторон вне системы");
  await db.contract.update({ where: { id: contractId }, data: { status: "CANCELLED" } });
  await audit({ actorId: user.id, action: "contract.create", entityType: "Contract", entityId: contractId, meta: { cancelled: true } });
}

async function loadOwnContract(user: SessionUser, contractId: string) {
  const contract = await db.contract.findUnique({ where: { id: contractId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!contract) throw new NotFoundError("Договор");
  if (contract.customerId !== user.id) throw new ForbiddenError("Подтвердить договор может только заказчик");
  if (contract.status !== "AWAITING_SIGNATURE") throw new UserError("Договор не ожидает подписания");
  return { contract, version: contract.versions[0] };
}

/** Одноразовый код (простая электронная подпись) — отправляется на почту заказчика. */
export async function requestContractOtp(user: SessionUser, contractId: string): Promise<{ devHint?: string }> {
  const { contract, version } = await loadOwnContract(user, contractId);
  const recent = await db.authToken.count({ where: { userId: user.id, type: "CONTRACT_OTP", subjectId: version.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent) throw new UserError("Код уже отправлен. Повторный запрос возможен через минуту.");
  const code = otpCode();
  await db.authToken.create({
    data: { userId: user.id, type: "CONTRACT_OTP", tokenHash: sha256(`${version.id}:${code}:${user.id}`), subjectId: version.id, expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000) },
  });
  await queueEmail(user.email, `Код подтверждения договора ${contract.number}`, `Код для подтверждения договора ${contract.number} (редакция ${version.version}): ${code}\n\nКод действует ${OTP_TTL_MIN} минут. Никому не сообщайте его.`);
  await audit({ actorId: user.id, action: "contract.otp", entityType: "Contract", entityId: contractId });
  return isProd ? {} : { devHint: env.MAIL_TRANSPORT === "smtp" ? "Код отправлен в Mailpit: http://localhost:8025" : "Код выведен в лог сервера" };
}

/**
 * Подтверждение договора: чекбокс согласия + одноразовый код. Фиксируются дата, IP, user-agent,
 * пользователь, версия и контрольная сумма текста. Внешняя ЭП/ЭДО подключается как SignMethod.EXTERNAL_EDO.
 */
export async function acceptContract(user: SessionUser, contractId: string, code: string, agreed: boolean, ip: string | null, userAgent: string | null) {
  if (!agreed) throw new UserError("Подтвердите, что ознакомились с условиями договора");
  const { contract, version } = await loadOwnContract(user, contractId);
  const token = await db.authToken.findFirst({
    where: { userId: user.id, type: "CONTRACT_OTP", subjectId: version.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!token) throw new UserError("Запросите код подтверждения");
  if (token.attempts >= OTP_MAX_ATTEMPTS) throw new UserError("Превышено число попыток. Запросите новый код.");
  if (token.tokenHash !== sha256(`${version.id}:${code.trim()}:${user.id}`)) {
    await db.authToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw new UserError("Неверный код", { code: "Неверный код" });
  }
  await db.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  await markContractSigned(contract, version, { userId: user.id, method: "CHECKBOX_OTP", ip, userAgent, via: "в кабинете" });
}

/**
 * Фиксация подписания (код из письма или ЭДО СБИС): подтверждение редакции, статус «Подписан»,
 * запуск таймера проекта, статус заявки «Договор подписан», уведомления.
 */
export async function markContractSigned(
  contract: { id: string; number: string; quickOrderId: string | null; projectId: string | null; leadId: string | null },
  version: { id: string; version: number; checksum: string },
  opts: { userId: string; method: "CHECKBOX_OTP" | "EXTERNAL_EDO"; ip?: string | null; userAgent?: string | null; via: string },
) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.contractAcceptance.create({
      data: { contractId: contract.id, versionId: version.id, userId: opts.userId, method: opts.method, ip: opts.ip ?? null, userAgent: opts.userAgent ?? null, checksum: version.checksum },
    });
    await tx.contract.update({ where: { id: contract.id }, data: { status: "SIGNED", signedAt: now } });
    if (contract.quickOrderId) {
      await tx.quickOrder.update({ where: { id: contract.quickOrderId }, data: { status: "AWAITING_PAYMENT" } });
    }
    // Проект уже создан (заказчик заведён вручную) — срок отсчитывается с момента подписания
    if (contract.projectId) {
      await tx.timer.updateMany({ where: { projectId: contract.projectId, startedAt: null }, data: { startedAt: now, state: "running" } });
    }
  });
  await audit({ actorId: opts.userId, action: "contract.accept", entityType: "Contract", entityId: contract.id, ip: opts.ip ?? null, meta: { version: version.version, checksum: version.checksum, method: opts.method } });
  if (contract.projectId) {
    const project = await db.project.findUnique({ where: { id: contract.projectId }, select: { number: true, managerId: true, salesManagerId: true } });
    await notify([project?.managerId, project?.salesManagerId], "status.changed", `Заказчик подписал договор ${contract.number}`, `Проект №${project?.number}: таймер срока запущен.`, `/cabinet/projects/${contract.projectId}`);
  } else if (contract.leadId) {
    const lead = await db.lead.findUnique({ where: { id: contract.leadId }, select: { managerId: true, number: true, status: true } });
    if (lead && !["won", "lost", "contract_signed"].includes(lead.status)) {
      await db.$transaction([
        db.lead.update({ where: { id: contract.leadId }, data: { status: "contract_signed" } }),
        db.statusChange.create({ data: { entityType: "Lead", entityId: contract.leadId, fromStatus: lead.status, toStatus: "contract_signed", actorId: opts.userId, comment: `Договор ${contract.number} подписан ${opts.via}` } }),
      ]);
    }
    await notify([lead?.managerId], "status.changed", `Заказчик подписал договор ${contract.number}`, `Заявка №${lead?.number}. Можно создавать проект.`, `/cabinet/leads/${contract.leadId}`);
  }
}
