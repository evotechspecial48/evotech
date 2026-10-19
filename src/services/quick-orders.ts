import type { Prisma, StructureType } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify, staffWithRole } from "@/lib/notify";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { can, ForbiddenError } from "@/domain/rbac";
import { canDownloadResult } from "@/domain/access";
import { STRUCTURE_TYPE } from "@/domain/labels";
import { COVERINGS, FOUNDATIONS, FRAMES, quickOrderPrice, ROOF_TYPES, validateQuickOrder, type QuickOrderParams } from "@/domain/quick-order";
import { renderTemplate } from "@/domain/spec";
import { activeTemplate, contractVars, createContractTx } from "./contracts";
import { kickJob } from "./ai-jobs";

/** Шаг 1–5 мастера → заказ и AI-задача в очереди. Фото участка прикрепляются после создания. */
export async function createQuickOrder(user: SessionUser, structureType: StructureType, params: QuickOrderParams, photoIds: string[]) {
  if (!can(user.role, "quick_orders.create")) throw new ForbiddenError("Быстрый заказ оформляет заказчик");
  const errors = validateQuickOrder(structureType, params);
  if (Object.keys(errors).length) throw new UserError("Проверьте параметры конструкции", errors as Record<string, string>);
  const order = await db.$transaction(async (tx) => {
    const qo = await tx.quickOrder.create({
      data: { customerId: user.id, structureType, status: "GENERATING", params: params as unknown as Prisma.InputJsonValue, price: quickOrderPrice(structureType, params) },
    });
    if (photoIds.length) {
      await tx.fileAsset.updateMany({ where: { id: { in: photoIds }, uploadedById: user.id, quickOrderId: null, projectId: null, leadId: null }, data: { quickOrderId: qo.id, category: "PHOTO" } });
    }
    await tx.aIJob.create({
      data: { quickOrderId: qo.id, status: "queued", provider: "pending", input: { structureType, params } as unknown as Prisma.InputJsonValue },
    });
    return qo;
  });
  await audit({ actorId: user.id, action: "quick_order.create", entityType: "QuickOrder", entityId: order.id, meta: { structureType } });
  const job = await db.aIJob.findFirstOrThrow({ where: { quickOrderId: order.id } });
  kickJob(job.id);
  await notify(await staffWithRole("SALES_MANAGER"), "lead.new", `Новый быстрый заказ №${order.number}`, `${STRUCTURE_TYPE[structureType]} ${params.length}×${params.width} м`, `/cabinet/quick-orders/${order.id}`, { email: false });
  return order;
}

/** Выбор варианта → расчёт цены → типовой договор на подтверждение. */
export async function selectVariant(user: SessionUser, quickOrderId: string, variantId: string) {
  const qo = await db.quickOrder.findUnique({ where: { id: quickOrderId }, include: { aiJobs: true, contract: true } });
  if (!qo) throw new NotFoundError("Заказ");
  if (qo.customerId !== user.id) throw new ForbiddenError("Выбрать вариант может заказчик");
  if (qo.status !== "AWAITING_SELECTION") throw new UserError("Выбор варианта сейчас недоступен");
  const variant = await db.designVariant.findFirst({ where: { id: variantId, quickOrderId } });
  if (!variant) throw new NotFoundError("Вариант");
  const params = qo.params as unknown as QuickOrderParams;
  const price = quickOrderPrice(qo.structureType, params, variant.priceDelta);
  const tpl = await activeTemplate("QUICK_CONTRACT");
  const year = new Date().getFullYear();
  const number = `БЗ-${year}-${String(qo.number).padStart(4, "0")}`;
  const body = renderTemplate(
    tpl.body,
    await contractVars({
      number,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone,
      subject: `${STRUCTURE_TYPE[qo.structureType]} ${params.length}×${params.width}×${params.height} м, вариант «${variant.title}»`,
      amount: price,
      termDays: 3,
      extra: {
        structure: STRUCTURE_TYPE[qo.structureType],
        dimensions: `${params.length} × ${params.width} м, высота ${params.height} м`,
        roof: `${ROOF_TYPES[params.roofType]}, ${COVERINGS[params.covering]}`,
        frame: FRAMES[params.frame],
        foundation: FOUNDATIONS[params.foundation],
        region: params.region,
        variant: variant.title,
      },
    }),
  );
  await db.$transaction(async (tx) => {
    await tx.designVariant.updateMany({ where: { quickOrderId }, data: { status: "REJECTED" } });
    await tx.designVariant.update({ where: { id: variantId }, data: { status: "SELECTED" } });
    await tx.aIJob.updateMany({ where: { quickOrderId, status: "awaiting_selection" }, data: { status: "selected" } });
    if (qo.contract) {
      // Повторный выбор (после возврата) — аннулируем неподписанный договор
      if (qo.contract.status === "SIGNED") throw new UserError("Договор уже подписан");
      await tx.contract.delete({ where: { id: qo.contract.id } });
    }
    await createContractTx(tx, { number, customerId: user.id, amount: price, termDays: 3, body, templateId: tpl.id, quickOrderId, createdById: null });
    await tx.quickOrder.update({ where: { id: quickOrderId }, data: { status: "CONTRACT", price, selectedVariantId: variantId } });
  });
  await audit({ actorId: user.id, action: "quick_order.select", entityType: "QuickOrder", entityId: quickOrderId, meta: { variantId, price } });
}

/** После оплаты: AI-задача переходит к формированию пакета. */
export async function startPackageGeneration(quickOrderId: string) {
  const job = await db.aIJob.findFirst({ where: { quickOrderId, status: "selected" } });
  if (!job) return;
  await db.$transaction([
    db.aIJob.update({ where: { id: job.id }, data: { status: "generating_package", lockedAt: null } }),
    db.quickOrder.update({ where: { id: quickOrderId }, data: { status: "PROCESSING" } }),
  ]);
  kickJob(job.id);
}

/** Проверка условий выдачи итогового архива (договор, оплата, готовность). */
export async function archiveAccess(user: SessionUser, quickOrderId: string) {
  const qo = await db.quickOrder.findUnique({
    where: { id: quickOrderId },
    include: { contract: true, payments: { where: { status: "paid" } }, aiJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!qo) throw new NotFoundError("Заказ");
  const gate = canDownloadResult({
    isOwner: qo.customerId === user.id,
    isStaff: can(user.role, "quick_orders.view_all"),
    contractStatus: qo.contract?.status ?? null,
    paymentRequired: true,
    paymentStatus: qo.payments.length ? "paid" : null,
    resultStatus: qo.aiJobs[0]?.status ?? null,
  });
  return { qo, gate };
}

export async function cancelQuickOrder(user: SessionUser, quickOrderId: string) {
  const qo = await db.quickOrder.findUnique({ where: { id: quickOrderId }, include: { payments: { where: { status: "paid" } } } });
  if (!qo) throw new NotFoundError("Заказ");
  if (qo.customerId !== user.id && user.role !== "DIRECTOR") throw new ForbiddenError();
  if (qo.payments.length) throw new UserError("Оплаченный заказ отменяется через менеджера");
  await db.quickOrder.update({ where: { id: quickOrderId }, data: { status: "CANCELLED" } });
}
