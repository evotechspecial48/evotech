import type { Payment, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { logger } from "@/lib/logger";
import { randomToken } from "@/lib/crypto";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { invoicePdf } from "@/lib/invoice-pdf";
import { tbankBusiness, type BankPaymentState } from "@/lib/payments/tbank-business";
import { can, ForbiddenError } from "@/domain/rbac";
import { canApplyPaymentStatus } from "@/domain/tbank";
import { companyRequisites } from "./contracts";
import { saveGenerated } from "./files";

// Оплата по договору проекта: счёт (Т-Бизнес или собственный PDF с QR по ГОСТ) и QR-ссылка СБП.
// Предоплата 50% и окончательный расчёт — по условиям договора подряда компании.

export type InvoiceKind = "prepay" | "final" | "custom";
export type InvoiceMethod = "invoice" | "sbp";
export const BANK_PROVIDERS = ["tbank-invoice", "tbank-sbp"] as const;

const KIND_LABEL: Record<InvoiceKind, string> = { prepay: "Предоплата 50%", final: "Окончательный расчёт", custom: "Оплата" };
const QR_TTL_DAYS = 10;
const DUE_DAYS = 5;

export function canIssueInvoices(user: SessionUser) {
  return can(user.role, "contracts.manage") || can(user.role, "projects.manage");
}

const toDateStr = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
const rub = (kop: number) => (kop / 100).toLocaleString("ru-RU");

/** Сумма к выставлению: предоплата — половина договора, окончательный расчёт — остаток после оплаченных счетов. */
export function invoiceAmount(kind: InvoiceKind, contractAmount: number, paidRub: number, custom: number | null): number {
  if (kind === "prepay") return Math.round(contractAmount / 2);
  if (kind === "final") return Math.max(0, contractAmount - paidRub);
  return Math.round((custom ?? 0) * 100) / 100;
}

export async function issueContractPayment(user: SessionUser, input: { contractId: string; kind: InvoiceKind; method: InvoiceMethod; amount?: number | null }) {
  if (!canIssueInvoices(user)) throw new ForbiddenError("Выставлять счета может менеджер, руководитель проекта или директор");
  const contract = await db.contract.findUnique({
    where: { id: input.contractId },
    include: { payments: true, project: { select: { id: true, number: true, title: true } }, lead: { select: { title: true, companyName: true } } },
  });
  if (!contract) throw new NotFoundError("Договор");
  if (contract.status === "CANCELLED") throw new UserError("Договор аннулирован");
  if (contract.quickOrderId) throw new UserError("Быстрый заказ оплачивается заказчиком из карточки заказа");
  const customer = await db.user.findUniqueOrThrow({ where: { id: contract.customerId }, include: { company: true } });

  const paidRub = contract.payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0) / 100;
  const amount = invoiceAmount(input.kind, contract.amount, paidRub, input.amount ?? null);
  if (!(amount > 0)) throw new UserError(input.kind === "final" ? "Договор уже оплачен полностью" : "Укажите сумму", { amount: "Укажите сумму" });
  if (paidRub + amount > contract.amount * 1.0001 && input.kind !== "custom") throw new UserError("Сумма превышает остаток по договору");

  const r = await companyRequisites();
  const subject = contract.project?.title ?? contract.lead?.title ?? "проектные работы";
  const purpose = `${KIND_LABEL[input.kind]} по договору подряда № ${contract.number} (${subject}). НДС не облагается`;
  const bank = tbankBusiness();
  const provider = input.method === "sbp" ? "tbank-sbp" : "tbank-invoice";
  if (input.method === "sbp" && bank.name === "tbank-business-mock") {
    throw new UserError("QR-ссылка СБП выставляется через Т-Бизнес — подключите токен T-API. Сейчас используйте счёт: в нём есть QR-код для оплаты по реквизитам.");
  }
  const orderId = `INV-${contract.number}-${randomToken(4)}`;
  const payment = await db.payment.create({
    data: {
      orderId,
      idempotencyKey: `${contract.id}:${orderId}`,
      provider,
      kind: input.kind,
      amount: Math.round(amount * 100),
      description: purpose,
      testMode: bank.testMode,
      contractId: contract.id,
      projectId: contract.project?.id ?? null,
      payerId: customer.id,
    },
  });

  try {
    if (input.method === "invoice") {
      const due = new Date(Date.now() + DUE_DAYS * 86400_000);
      const payer = { name: customer.company?.name ?? customer.name, inn: customer.company?.inn ?? undefined, kpp: customer.company?.kpp ?? undefined };
      const res = await bank.createInvoice({
        invoiceNumber: String(payment.number),
        dueDate: toDateStr(due),
        accountNumber: r.account || undefined,
        payer,
        items: [{ name: `${KIND_LABEL[input.kind]}: ${subject} (договор № ${contract.number})`, price: amount, amount: 1, unit: "усл." }],
        email: customer.email,
        purpose,
      });
      // PDF банка (ссылка живёт 10 дней) сохраняем в хранилище; без него — собственный счёт по реквизитам
      const pdf =
        (res.pdfUrl ? await bank.downloadPdf(res.pdfUrl) : null) ??
        (await invoicePdf({
          number: payment.number,
          date: new Date(),
          requisites: r,
          payer: { name: payer.name, inn: payer.inn, kpp: payer.kpp, address: customer.company?.legalAddress },
          basis: `Договор подряда № ${contract.number}`,
          items: [{ name: `${KIND_LABEL[input.kind]}: ${subject}`, qty: 1, unit: "усл.", price: amount }],
          purpose,
        }));
      const file = await saveGenerated(pdf, `Счёт_${payment.number}_${contract.number}.pdf`, "application/pdf", { projectId: contract.project?.id ?? null, leadId: contract.project ? null : contract.leadId, category: "DOCUMENT" }, user.id);
      await db.payment.update({
        where: { id: payment.id },
        data: { providerPaymentId: bank.name === "tbank-business" ? res.invoiceId : null, paymentUrl: res.incomingInvoiceUrl, fileId: file.id, expiresAt: due },
      });
    } else {
      const res = await bank.createQr({ sum: amount, purpose, accountNumber: r.account, ttlDays: QR_TTL_DAYS, redirectUrl: `${env.APP_URL}/cabinet/contracts/${contract.id}` });
      await db.payment.update({
        where: { id: payment.id },
        data: { providerPaymentId: res.qrId, paymentUrl: res.paymentUrl, qrImage: res.image, expiresAt: new Date(Date.now() + QR_TTL_DAYS * 86400_000) },
      });
    }
  } catch (err) {
    await db.payment.update({ where: { id: payment.id }, data: { status: "failed", errorMessage: err instanceof Error ? err.message.slice(0, 300) : "error" } });
    logger.error("invoice.issue_failed", { orderId, err });
    throw new UserError(err instanceof Error && err.message.startsWith("Т-Бизнес") ? err.message : "Не удалось выставить счёт. Попробуйте позже.");
  }

  await audit({ actorId: user.id, action: "payment.create", entityType: "Payment", entityId: payment.id, projectId: contract.project?.id, meta: { orderId, kind: input.kind, method: input.method, amount, provider: bank.name } });
  await notify(
    [customer.id],
    "payment.invoice",
    input.method === "sbp" ? `QR-код для оплаты по договору ${contract.number}` : `Счёт № ${payment.number} по договору ${contract.number}`,
    `${KIND_LABEL[input.kind]}: ${amount.toLocaleString("ru-RU")} ₽. ${input.method === "sbp" ? `Оплата по СБП, ссылка действует ${QR_TTL_DAYS} дней.` : `Оплатить в течение ${DUE_DAYS} рабочих дней.`}`,
    `/cabinet/contracts/${contract.id}`,
  );
  return payment;
}

/**
 * Зачисление платежа (из банка или вручную): статус paid, событие, уведомления.
 * Идемпотентно: повторный вызов по уже оплаченному платежу ничего не меняет.
 */
export async function applyPaymentState(payment: Payment, next: PaymentStatus, source: string, actorId: string | null = null): Promise<boolean> {
  const eventKey = `${payment.provider}:${payment.providerPaymentId ?? payment.id}:${next}`;
  const changed = await db.$transaction(async (tx) => {
    if (await tx.paymentEvent.findUnique({ where: { eventKey } })) return false;
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (!canApplyPaymentStatus(current.status, next)) return false;
    await tx.paymentEvent.create({ data: { paymentId: payment.id, eventKey, status: next, payload: { source } } });
    await tx.payment.update({ where: { id: payment.id }, data: { status: next, ...(next === "paid" ? { paidAt: new Date() } : {}) } });
    if (next === "paid" && current.quickOrderId) await tx.quickOrder.update({ where: { id: current.quickOrderId }, data: { status: "PAID" } });
    return true;
  });
  if (!changed) return false;
  await audit({ actorId, action: "payment.status", entityType: "Payment", entityId: payment.id, projectId: payment.projectId, meta: { from: payment.status, to: next, source } });
  if (next === "paid") {
    const link = payment.quickOrderId ? `/cabinet/quick-orders/${payment.quickOrderId}` : payment.contractId ? `/cabinet/contracts/${payment.contractId}` : "/cabinet/payments";
    await notify([payment.payerId], "payment.completed", "Оплата получена", `Платёж на ${rub(payment.amount)} ₽ зачислен. Спасибо!`, link);
    if (payment.projectId) {
      const p = await db.project.findUnique({ where: { id: payment.projectId }, select: { number: true, managerId: true, salesManagerId: true } });
      await notify([p?.managerId, p?.salesManagerId], "payment.completed", `Оплата по проекту №${p?.number}`, `${payment.description}: ${rub(payment.amount)} ₽ зачислено.`, link, { exceptUserId: actorId ?? undefined });
    }
    if (payment.quickOrderId) {
      const { startPackageGeneration } = await import("./quick-orders");
      await startPackageGeneration(payment.quickOrderId);
    }
  }
  return true;
}

const STATE_TO_STATUS: Record<BankPaymentState, PaymentStatus> = { pending: "pending", paid: "paid", cancelled: "cancelled", failed: "failed" };

/** Сверка ожидающих счетов и QR с банком (воркер, раз в 5 минут). Возвращает число изменённых платежей. */
export async function syncBankPayments(): Promise<number> {
  const bank = tbankBusiness();
  const pending = await db.payment.findMany({ where: { status: "pending", provider: { in: [...BANK_PROVIDERS] } }, orderBy: { createdAt: "asc" }, take: 100 });
  let changed = 0;
  for (const p of pending) {
    try {
      let state: BankPaymentState = "pending";
      if (p.providerPaymentId && bank.name === "tbank-business") {
        state = p.provider === "tbank-sbp" ? await bank.qrState(p.providerPaymentId) : await bank.invoiceState(p.providerPaymentId);
      }
      // Истёкшая QR-ссылка без оплаты закрывается
      if (state === "pending" && p.provider === "tbank-sbp" && p.expiresAt && p.expiresAt < new Date()) state = "cancelled";
      if (state !== "pending" && (await applyPaymentState(p, STATE_TO_STATUS[state], "bank-sync"))) changed++;
    } catch (err) {
      logger.warn("invoice.sync_failed", { paymentId: p.id, err });
    }
  }
  return changed;
}

/** Ручная отметка оплаты — платёж пришёл на расчётный счёт, а счёт выставлен без Т-Бизнеса (или оплачен иначе). */
export async function markPaidManually(user: SessionUser, paymentId: string, comment: string) {
  if (!canIssueInvoices(user)) throw new ForbiddenError();
  if (comment.trim().length < 3) throw new UserError("Укажите основание: номер платёжного поручения или дату поступления");
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Платёж");
  if (payment.status !== "pending") throw new UserError("Платёж уже обработан");
  await applyPaymentState(payment, "paid", `manual: ${comment}`, user.id);
  await audit({ actorId: user.id, action: "payment.manual", entityType: "Payment", entityId: payment.id, projectId: payment.projectId, meta: { comment } });
}

/** Отмена неоплаченного счёта или QR в кабинете (в банке ссылка истечёт сама). */
export async function cancelInvoice(user: SessionUser, paymentId: string) {
  if (!canIssueInvoices(user)) throw new ForbiddenError();
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Платёж");
  if (payment.status !== "pending") throw new UserError("Отменить можно только неоплаченный счёт");
  await applyPaymentState(payment, "cancelled", "manual-cancel", user.id);
}
