import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { logger } from "@/lib/logger";
import { randomToken } from "@/lib/crypto";
import { paymentProvider } from "@/lib/payments";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { canPay } from "@/domain/access";
import { canApplyPaymentStatus, mapTbankStatus } from "@/domain/tbank";
import { ForbiddenError } from "@/domain/rbac";

/**
 * Создание платежа за быстрый заказ. Оплата недоступна до подтверждения актуальной версии договора.
 * Повторный запрос возвращает тот же неоплаченный платёж (идемпотентность).
 */
export async function createQuickOrderPayment(user: SessionUser, quickOrderId: string): Promise<{ paymentUrl: string }> {
  const qo = await db.quickOrder.findUnique({
    where: { id: quickOrderId },
    include: { contract: { include: { acceptances: { include: { version: true } } } }, payments: true },
  });
  if (!qo) throw new NotFoundError("Заказ");
  if (qo.customerId !== user.id) throw new ForbiddenError("Оплатить заказ может только заказчик");
  const contract = qo.contract;
  const accepted = contract?.acceptances.map((a) => a.version.version).sort((a, b) => b - a)[0] ?? null;
  const gate = canPay({
    contractStatus: contract?.status ?? null,
    acceptedVersion: accepted,
    currentVersion: contract?.currentVersion ?? null,
    alreadyPaid: qo.payments.some((p) => p.status === "paid"),
  });
  if (!gate.ok) throw new UserError(gate.reasons.join(". "));
  if (!qo.price) throw new UserError("Стоимость заказа не определена");

  const amountKop = qo.price * 100;
  const reusable = qo.payments.find((p) => p.status === "pending" && p.amount === amountKop && p.paymentUrl && Date.now() - p.createdAt.getTime() < 20 * 60_000);
  if (reusable) return { paymentUrl: reusable.paymentUrl! };

  const provider = paymentProvider();
  const orderId = `QO${qo.number}-${randomToken(4)}`;
  const payment = await db.payment.create({
    data: {
      orderId,
      idempotencyKey: `${qo.id}:${orderId}`,
      provider: provider.name,
      amount: amountKop,
      description: `Проектирование: быстрый заказ №${qo.number}`,
      testMode: provider.testMode,
      contractId: contract!.id,
      quickOrderId: qo.id,
      payerId: user.id,
    },
  });
  try {
    const res = await provider.init({
      orderId,
      amountKop,
      description: payment.description,
      email: user.email,
      successUrl: `${env.APP_URL}/cabinet/quick-orders/${qo.id}?payment=success`,
      failUrl: `${env.APP_URL}/cabinet/quick-orders/${qo.id}?payment=fail`,
      notificationUrl: `${env.APP_URL}/api/payments/tbank/webhook`,
    });
    await db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: res.providerPaymentId, paymentUrl: res.paymentUrl } });
    await audit({ actorId: user.id, action: "payment.create", entityType: "Payment", entityId: payment.id, meta: { orderId, amount: amountKop, provider: provider.name } });
    return { paymentUrl: res.paymentUrl };
  } catch (err) {
    // Сбой банка не теряет заказ: платёж помечается ошибкой, заказчик может повторить
    await db.payment.update({ where: { id: payment.id }, data: { status: "failed", errorMessage: err instanceof Error ? err.message.slice(0, 300) : "error" } });
    logger.error("payment.init_failed", { orderId, err });
    throw new UserError("Платёжный сервис временно недоступен. Попробуйте позже — заказ сохранён.");
  }
}

export type NotificationResult = { ok: boolean; duplicate?: boolean; reason?: string };

/**
 * Обработка уведомления банка: проверка подписи, идемпотентность по PaymentId+Status,
 * защита от отката финального статуса, побочные действия — после фиксации транзакции.
 */
export async function handlePaymentNotification(body: Record<string, unknown>): Promise<NotificationResult> {
  const provider = paymentProvider();
  if (!provider.verifyNotification(body)) {
    logger.warn("payment.webhook_bad_signature", { orderId: body.OrderId });
    await audit({ action: "payment.webhook", meta: { rejected: "signature", orderId: String(body.OrderId ?? "") } });
    return { ok: false, reason: "signature" };
  }
  const orderId = String(body.OrderId ?? "");
  const bankStatus = String(body.Status ?? "");
  const payment = await db.payment.findUnique({ where: { orderId } });
  if (!payment) return { ok: false, reason: "unknown_order" };
  if (Number(body.Amount) !== payment.amount) {
    logger.warn("payment.webhook_amount_mismatch", { orderId });
    return { ok: false, reason: "amount" };
  }
  const eventKey = `${String(body.PaymentId ?? payment.providerPaymentId)}:${bankStatus}`;
  const next = mapTbankStatus(bankStatus);

  const result = await db.$transaction(async (tx) => {
    const exists = await tx.paymentEvent.findUnique({ where: { eventKey } });
    if (exists) return { duplicate: true, changed: false };
    await tx.paymentEvent.create({ data: { paymentId: payment.id, eventKey, status: bankStatus, payload: body as Prisma.InputJsonValue } });
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (!canApplyPaymentStatus(current.status, next)) return { duplicate: false, changed: false };
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: next,
        providerPaymentId: current.providerPaymentId ?? String(body.PaymentId ?? ""),
        ...(next === "paid" ? { paidAt: new Date() } : {}),
        ...(next === "failed" ? { errorMessage: `Код ошибки банка: ${String(body.ErrorCode ?? "")}` } : {}),
      },
    });
    if (next === "paid" && current.quickOrderId) {
      await tx.quickOrder.update({ where: { id: current.quickOrderId }, data: { status: "PAID" } });
    }
    return { duplicate: false, changed: true };
  });

  await audit({ action: "payment.webhook", entityType: "Payment", entityId: payment.id, meta: { status: bankStatus, duplicate: result.duplicate } });
  if (result.changed) {
    await audit({ action: "payment.status", entityType: "Payment", entityId: payment.id, meta: { from: payment.status, to: next } });
    if (next === "paid") {
      await notify([payment.payerId], "payment.completed", "Оплата получена", `Платёж на ${(payment.amount / 100).toLocaleString("ru-RU")} ₽ зачислен. Начато формирование документации.`, payment.quickOrderId ? `/cabinet/quick-orders/${payment.quickOrderId}` : "/cabinet/payments");
      if (payment.quickOrderId) {
        const { startPackageGeneration } = await import("./quick-orders");
        await startPackageGeneration(payment.quickOrderId);
      }
    } else if (next === "failed" || next === "cancelled") {
      await notify([payment.payerId], "payment.failed", "Оплата не прошла", "Попробуйте оплатить ещё раз или используйте другую карту.", payment.quickOrderId ? `/cabinet/quick-orders/${payment.quickOrderId}` : "/cabinet/payments");
    }
  }
  return { ok: true, duplicate: result.duplicate };
}

/** Демо-банк: формирует уведомление в формате Т-Банка и подписывает его. */
export async function simulateMockBank(orderId: string, outcome: "success" | "fail") {
  const provider = paymentProvider();
  if (provider.name !== "mock") throw new UserError("Демо-оплата отключена");
  const payment = await db.payment.findUnique({ where: { orderId } });
  if (!payment) throw new NotFoundError("Платёж");
  const body: Record<string, unknown> = {
    TerminalKey: "EvoMockTerminal",
    OrderId: orderId,
    Success: outcome === "success",
    Status: outcome === "success" ? "CONFIRMED" : "REJECTED",
    PaymentId: payment.providerPaymentId,
    ErrorCode: outcome === "success" ? "0" : "1051",
    Amount: payment.amount,
    CardId: 0,
    Pan: "430000******0777",
  };
  body.Token = provider.sign(body);
  return handlePaymentNotification(body);
}

/** Подготовка к возвратам: вызов отмены у провайдера; статус refunded приходит уведомлением банка. */
export async function requestRefund(user: SessionUser, paymentId: string) {
  if (user.role !== "DIRECTOR") throw new ForbiddenError("Возврат оформляет директор");
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.providerPaymentId) throw new NotFoundError("Платёж");
  if (payment.status !== "paid") throw new UserError("Возврат возможен только по оплаченному платежу");
  const res = await paymentProvider().cancel(payment.providerPaymentId, payment.amount);
  await audit({ actorId: user.id, action: "payment.status", entityType: "Payment", entityId: paymentId, meta: { refundRequested: true, result: res.status ?? null } });
  if (payment.provider === "mock") {
    await db.payment.update({ where: { id: paymentId }, data: { status: "refunded" } });
  }
}
