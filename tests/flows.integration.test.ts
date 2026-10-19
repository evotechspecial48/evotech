// Интеграционные тесты сквозных сценариев на реальной PostgreSQL (БД evotech_test).
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/domain/rbac";
import { UserError } from "@/lib/errors";
import { createLead, changeLeadStatus } from "@/services/leads";
import { acceptContract, createLeadContract, requestContractOtp } from "@/services/contracts";
import { convertLeadToProject, createCustomerRequest, answerCustomerRequest, assignTeam } from "@/services/projects";
import { loadProjectAccess } from "@/services/scope";
import { stageAction, uploadVersion, verifyVersionIntegrity } from "@/services/stages";
import { saveGenerated } from "@/services/files";
import { createQuickOrder, selectVariant, archiveAccess } from "@/services/quick-orders";
import { createQuickOrderPayment, handlePaymentNotification, simulateMockBank } from "@/services/payments";
import { processJob } from "@/services/ai-jobs";
import { paymentProvider } from "@/lib/payments";
import { computeTimer } from "@/domain/timer";
import { hashPassword } from "@/lib/auth";
import { approveSpec, saveSpec, submitSpec } from "@/services/specs";

const enabled = inject("integrationDb");

async function user(email: string, role: SessionUser["role"], name = email): Promise<SessionUser> {
  const u = await db.user.create({ data: { email, name, role, passwordHash: await hashPassword("Test12345"), emailVerifiedAt: new Date() } });
  return u as SessionUser;
}

/** Код подтверждения договора берётся из письма в очереди OutboundEmail. */
async function lastOtp(email: string): Promise<string> {
  const mail = await db.outboundEmail.findFirst({ where: { to: email, subject: { startsWith: "Код подтверждения" } }, orderBy: { createdAt: "desc" } });
  return mail!.text.match(/: (\d{6})/)![1];
}

async function waitJob(jobId: string, until: string[]) {
  for (let i = 0; i < 100; i++) {
    await processJob(jobId);
    const j = await db.aIJob.findUniqueOrThrow({ where: { id: jobId } });
    if (until.includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Задача не завершилась");
}

describe.skipIf(!enabled)("Сквозные сценарии", () => {
  let director: SessionUser, pm: SessionUser, sales: SessionUser, designer: SessionUser, customer: SessionUser, stranger: SessionUser;

  beforeAll(async () => {
    // Очистка только тестовой БД (защита от запуска на рабочей базе)
    const [{ db: dbName }] = await db.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    if (!dbName.endsWith("_test")) throw new Error(`Интеграционные тесты запускаются только на БД *_test, текущая: ${dbName}`);
    const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

    director = await user("dir@t.ru", "DIRECTOR");
    pm = await user("pm@t.ru", "PROJECT_MANAGER");
    sales = await user("sales@t.ru", "SALES_MANAGER");
    designer = await user("des@t.ru", "DESIGNER");
    customer = await user("cust@t.ru", "CUSTOMER", "Заказчик Тестовый");
    stranger = await user("other@t.ru", "CUSTOMER");
    await db.documentTemplate.createMany({
      data: [
        { kind: "CONTRACT", name: "Договор", body: "Договор {{number}} с {{customerName}} на {{amount}} руб., срок {{termDays}} дн. ".repeat(3) },
        { kind: "QUICK_CONTRACT", name: "Оферта", body: "Оферта {{number}}: {{structure}} {{dimensions}}, {{amount}} руб. ".repeat(3) },
      ],
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  let projectId = "";

  it("заявка → договор → подписание кодом → проект с таймером", async () => {
    const lead = await createLead({ title: "Каркас склада", contactName: "Заказчик", email: "cust@t.ru", source: "site_form", utm: { utm_source: "yandex" } }, null, "127.0.0.1");
    expect(lead.managerId).toBe(sales.id); // автоназначение менеджера
    expect(lead.customerId).toBe(customer.id); // привязка по почте
    await changeLeadStatus(sales, lead.id, "qualification", "");

    await expect(convertLeadToProject(sales, lead.id, pm.id)).rejects.toBeInstanceOf(UserError); // без подписанного договора нельзя
    const contract = await createLeadContract(sales, lead.id, 150000, 20);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("awaiting_signature");

    await expect(requestContractOtp(stranger, contract.id)).rejects.toBeInstanceOf(ForbiddenError);
    await requestContractOtp(customer, contract.id);
    await expect(acceptContract(customer, contract.id, "000000", true, "1.1.1.1", "ua")).rejects.toBeInstanceOf(UserError);
    await expect(acceptContract(customer, contract.id, await lastOtp("cust@t.ru"), false, "1.1.1.1", "ua")).rejects.toBeInstanceOf(UserError); // без согласия
    await acceptContract(customer, contract.id, await lastOtp("cust@t.ru"), true, "1.1.1.1", "ua");
    const acc = await db.contractAcceptance.findFirstOrThrow({ where: { contractId: contract.id } });
    expect(acc.ip).toBe("1.1.1.1");

    const project = await convertLeadToProject(sales, lead.id, pm.id);
    projectId = project.id;
    const full = await db.project.findUniqueOrThrow({ where: { id: project.id }, include: { stages: true, timer: true, lead: true } });
    expect(full.stages).toHaveLength(6);
    expect(full.timer?.startedAt).not.toBeNull();
    expect(full.timer?.durationDays).toBe(20);
    expect(full.lead?.status).toBe("won");
  });

  it("изоляция: чужой заказчик и неназначенный проектировщик не видят проект", async () => {
    await expect(loadProjectAccess(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(loadProjectAccess(designer, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await assignTeam(pm, projectId, pm.id, [designer.id]);
    await expect(loadProjectAccess(designer, projectId)).resolves.toBeTruthy();
  });

  it("таймер: пауза при запросе заказчику и возобновление после ответа", async () => {
    const req = await createCustomerRequest(pm, projectId, "Пришлите геологию участка", null, true);
    let timer = await db.timer.findUniqueOrThrow({ where: { projectId }, include: { pauses: true } });
    expect(timer.pauses.filter((p) => !p.endedAt)).toHaveLength(1);
    expect(computeTimer(timer).state).toBe("paused_waiting_customer");
    expect(timer.pauses[0].initiatorId).toBe(pm.id);

    await answerCustomerRequest(customer, req.id, "Во вложении");
    timer = await db.timer.findUniqueOrThrow({ where: { projectId }, include: { pauses: true } });
    expect(timer.pauses.every((p) => p.endedAt)).toBe(true);
    expect(computeTimer(timer).state).toBe("running");
  });

  it("ТЗ: заказчик и сотрудник совместно готовят ТЗ с версиями; утверждение создаёт неизменяемый снимок", async () => {
    const spec = await db.technicalSpecification.findUniqueOrThrow({ where: { projectId } });
    const sketch = await db.projectStage.findFirstOrThrow({ where: { projectId, code: "sketch" } });
    await expect(stageAction(designer, sketch.id, "start", "")).rejects.toBeInstanceOf(UserError); // без утверждённого ТЗ эскиз не начать
    await saveSpec(customer, spec.id, { objectName: "Склад", objectType: "Ангар / склад", purpose: "Хранение", address: "Липецк", dimensions: "24×60" }, "Первичное заполнение");
    await expect(submitSpec(customer, spec.id)).rejects.toBeInstanceOf(UserError); // не все обязательные поля
    await saveSpec(sales, spec.id, { ...(await db.technicalSpecification.findUniqueOrThrow({ where: { id: spec.id } })).data as object, deliverables: "КМ, КМД" }, "Дополнено менеджером");
    await submitSpec(customer, spec.id);
    await expect(approveSpec(sales, spec.id)).rejects.toBeInstanceOf(ForbiddenError); // утверждает РП/директор
    await approveSpec(pm, spec.id);
    const versions = await db.technicalSpecificationVersion.findMany({ where: { specId: spec.id }, orderBy: { version: "asc" } });
    expect(versions.map((v) => v.authorId)).toEqual([customer.id, sales.id, pm.id]);
    expect(versions[1].changedKeys).toEqual(["deliverables"]);
    expect(versions.at(-1)?.isSnapshot).toBe(true);
    await expect(saveSpec(customer, spec.id, { objectName: "Другое" }, "")).rejects.toBeInstanceOf(UserError); // снимок неизменяем
    expect((await db.projectStage.findUniqueOrThrow({ where: { id: sketch.id } })).status).toBe("in_progress");
  });

  it("этап: версия → внутренняя проверка → замечания заказчика → новая версия → согласование с фиксацией", async () => {
    const sketch = await db.projectStage.findFirstOrThrow({ where: { projectId, code: "sketch" } });
    const f1 = await saveGenerated(Buffer.from("%PDF v1"), "eskiz_v1.pdf", "application/pdf", { projectId, stageCode: "sketch", category: "SKETCH" }, designer.id);
    await expect(uploadVersion(designer, sketch.id, "Эскиз", [])).rejects.toBeInstanceOf(UserError);
    await uploadVersion(designer, sketch.id, "Эскиз, вариант 1", [f1.id]);
    await stageAction(designer, sketch.id, "submit_internal", "");
    await expect(stageAction(customer, sketch.id, "customer_approve", "")).rejects.toBeInstanceOf(UserError); // ещё не у заказчика
    await stageAction(designer, sketch.id, "confirm_internal", "");
    expect((await db.timer.findUniqueOrThrow({ where: { projectId }, include: { pauses: { where: { endedAt: null } } } })).pauses).toHaveLength(1); // ждём решения заказчика

    await expect(stageAction(customer, sketch.id, "customer_request_changes", "")).rejects.toBeInstanceOf(UserError); // комментарий обязателен
    await stageAction(customer, sketch.id, "customer_request_changes", "Увеличить уклон");
    const f2 = await saveGenerated(Buffer.from("%PDF v2"), "eskiz_v2.pdf", "application/pdf", { projectId, stageCode: "sketch", category: "SKETCH" }, designer.id);
    const v2 = await uploadVersion(designer, sketch.id, "Уклон увеличен", [f2.id]);
    expect(v2.previousVersionId).not.toBeNull();
    await stageAction(designer, sketch.id, "submit_internal", "");
    await stageAction(designer, sketch.id, "confirm_internal", "");
    await stageAction(customer, sketch.id, "customer_approve", "");

    const locked = await db.stageVersion.findUniqueOrThrow({ where: { id: v2.id } });
    expect(locked.status).toBe("APPROVED");
    expect(locked.lockedAt).not.toBeNull();
    expect(await verifyVersionIntegrity(v2.id)).toBe(true);
    // Незаметная подмена файла после согласования обнаруживается
    await db.fileAsset.update({ where: { id: f2.id }, data: { checksum: "tampered" } });
    expect(await verifyVersionIntegrity(v2.id)).toBe(false);
    const approvals = await db.approval.findMany({ where: { stageVersion: { stageId: sketch.id } } });
    expect(approvals.some((a) => a.decision === "CHANGES_REQUESTED" && a.comment === "Увеличить уклон" && a.userId === customer.id)).toBe(true);
  });

  it("быстрый заказ: варианты → договор → оплата → архив; оплата и архив закрыты до выполнения условий", async () => {
    const params = { length: 6, width: 4, height: 2.7, roofType: "single", covering: "polycarbonate", frame: "profile_pipe", foundation: "piles", region: "Липецк", snowDistrict: "III", color: "", attachedToBuilding: false } as const;
    await expect(createQuickOrder(customer, "CANOPY", { ...params, length: 0 }, [])).rejects.toBeInstanceOf(UserError);
    const qo = await createQuickOrder(customer, "CANOPY", params, []);
    const job = await db.aIJob.findFirstOrThrow({ where: { quickOrderId: qo.id } });
    await waitJob(job.id, ["awaiting_selection"]);
    const variants = await db.designVariant.findMany({ where: { quickOrderId: qo.id } });
    expect(variants).toHaveLength(3);
    expect(variants[0].imageSvg).toContain("<svg");

    await selectVariant(customer, qo.id, variants[1].id);
    await expect(createQuickOrderPayment(customer, qo.id)).rejects.toThrow(/Договор не подтверждён/);
    let gate = await archiveAccess(customer, qo.id);
    expect(gate.gate.ok).toBe(false);

    const contract = await db.contract.findUniqueOrThrow({ where: { quickOrderId: qo.id } });
    await requestContractOtp(customer, contract.id);
    await acceptContract(customer, contract.id, await lastOtp("cust@t.ru"), true, null, null);
    const { paymentUrl } = await createQuickOrderPayment(customer, qo.id);
    expect(paymentUrl).toContain("/pay/mock/");
    // Повторный запрос возвращает тот же платёж (идемпотентность)
    expect((await createQuickOrderPayment(customer, qo.id)).paymentUrl).toBe(paymentUrl);
    expect(await db.payment.count({ where: { quickOrderId: qo.id } })).toBe(1);

    const payment = await db.payment.findFirstOrThrow({ where: { quickOrderId: qo.id } });
    const res = await simulateMockBank(payment.orderId, "success");
    expect(res.ok).toBe(true);
    await waitJob(job.id, ["completed"]);
    gate = await archiveAccess(customer, qo.id);
    expect(gate.gate.ok).toBe(true);
    await expect(archiveAccess(stranger, qo.id).then((g) => g.gate.ok)).resolves.toBe(false);

    // Повторное уведомление банка не меняет данные
    const body: Record<string, unknown> = { TerminalKey: "EvoMockTerminal", OrderId: payment.orderId, Success: true, Status: "CONFIRMED", PaymentId: payment.providerPaymentId, Amount: payment.amount };
    body.Token = paymentProvider().sign(body);
    const again = await handlePaymentNotification(body);
    expect(again.duplicate).toBe(true);
    // Уведомление с поддельной подписью отклоняется
    const forged = await handlePaymentNotification({ ...body, Status: "REFUNDED", Token: "x".repeat(64) });
    expect(forged.ok).toBe(false);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("paid");
    expect((await db.quickOrder.findUniqueOrThrow({ where: { id: qo.id } })).status).toBe("COMPLETED");
  });

  it("журнал фиксирует критичные действия", async () => {
    const actions = new Set((await db.auditEvent.findMany({ select: { action: true } })).map((a) => a.action));
    for (const a of ["lead.create", "contract.accept", "lead.convert", "timer.pause", "timer.resume", "stage.transition", "payment.webhook", "payment.status"]) {
      expect(actions.has(a), a).toBe(true);
    }
    void director;
  });
});
