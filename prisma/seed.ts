// Демонстрационные данные: учётные записи всех ролей и сценарии из ТЗ.
// Запуск: npm run db:seed (данные в БД полностью пересоздаются; в production запрещено).

import JSZip from "jszip";
import type { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { textToPdf } from "../src/lib/pdf";
import { MockAIProvider } from "../src/lib/ai/mock-provider";
import { saveGenerated } from "../src/services/files";
import { createProjectTx } from "../src/services/projects";
import { checksum, renderTemplate } from "../src/domain/spec";
import { quickOrderPrice, type QuickOrderParams } from "../src/domain/quick-order";
import { CONTRACT_TEMPLATE, OFFER_TEMPLATE, QUICK_CONTRACT_TEMPLATE } from "./templates";

export const DEMO_PASSWORD = "Demo2026!";
const DAY = 86400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

async function pdf(title: string, body: string, target: Parameters<typeof saveGenerated>[3], name: string, by: string) {
  const buf = await textToPdf(title, body);
  return saveGenerated(buf, name, "application/pdf", target, by);
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.SEED_FORCE) throw new Error("Сид запрещён в production");
  await wipe();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const verified = new Date();

  // ---------- Настройки и шаблоны ----------
  await db.setting.createMany({
    data: [
      { key: "timer.defaultMode", value: "WORKING" },
      { key: "files.maxSizeMb", value: 50 },
      { key: "calendar.holidays", value: ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-02-23", "2026-03-09", "2026-05-01", "2026-05-11", "2026-06-12", "2026-11-04", "2026-12-31"] },
      {
        key: "company.requisites",
        value: { name: "ООО «ЭвоТехнолоджи»", inn: "4800000000", city: "Липецк", address: "398000, г. Липецк (адрес уточняется)", bank: "АО «ТБанк», БИК 044525974", phone: "+7 919 185-69-63", email: "info@evotechnology.su" },
      },
    ],
  });
  const [contractTpl, quickTpl] = await Promise.all([
    db.documentTemplate.create({ data: { kind: "CONTRACT", name: "Договор на проектные работы", body: CONTRACT_TEMPLATE } }),
    db.documentTemplate.create({ data: { kind: "QUICK_CONTRACT", name: "Договор-оферта быстрого заказа", body: QUICK_CONTRACT_TEMPLATE } }),
    db.documentTemplate.create({ data: { kind: "OFFER", name: "Коммерческое предложение", body: OFFER_TEMPLATE } }),
  ]);

  // ---------- Пользователи ----------
  const mk = (email: string, name: string, role: Prisma.UserCreateInput["role"], extra: Partial<Prisma.UserCreateInput> = {}) =>
    db.user.create({ data: { email, name, role, passwordHash, emailVerifiedAt: verified, ...extra } });
  const director = await mk("director@evotech.demo", "Алексей Воронов", "DIRECTOR", { position: "Генеральный директор" });
  const pm = await mk("pm@evotech.demo", "Марина Соколова", "PROJECT_MANAGER", { position: "Руководитель проектов" });
  const sales = await mk("sales@evotech.demo", "Дмитрий Орлов", "SALES_MANAGER", { position: "Менеджер проектов", phone: "+7 919 185-69-63" });
  const designer = await mk("designer@evotech.demo", "Сергей Кузнецов", "DESIGNER", { position: "Инженер-конструктор КМ/КМД" });
  const designer2 = await mk("designer2@evotech.demo", "Ольга Миронова", "DESIGNER", { position: "Инженер-конструктор" });
  const customer = await mk("customer@evotech.demo", "Иван Петров", "CUSTOMER", {
    phone: "+7 900 111-22-33",
    company: { create: { name: "ООО «СтройМеталл»", inn: "4826000000", legalAddress: "г. Липецк, ул. Промышленная, 1" } },
  });
  const customer2 = await mk("customer2@evotech.demo", "Анна Смирнова", "CUSTOMER", { phone: "+7 900 444-55-66" });

  // ---------- 1. Новая заявка (с сайта, с UTM) ----------
  const lead1 = await db.lead.create({
    data: {
      title: "КМД на каркас склада 24×60 м",
      contactName: "Николай Фёдоров",
      email: "fedorov@example.ru",
      phone: "+7 910 000-00-01",
      companyName: "АгроСклад",
      objectType: "Ангар / склад",
      description: "Нужны чертежи КМД по готовым КМ, ориентировочно 85 т металла.",
      budget: "до 400 000 ₽",
      source: "site_form",
      utm: { utm_source: "yandex", utm_medium: "cpc", utm_campaign: "kmd_lipetsk" },
      referrer: "https://yandex.ru/",
      managerId: sales.id,
      spec: { create: { data: { objectName: "КМД на каркас склада 24×60 м", objectType: "Ангар / склад" } } },
    },
  });
  await db.statusChange.create({ data: { entityType: "Lead", entityId: lead1.id, toStatus: "new", comment: "Заявка создана" } });

  await db.lead.create({
    data: {
      title: "Расчёт навеса для парковки",
      contactName: "Елена Ким",
      email: "kim@example.ru",
      objectType: "Навес",
      source: "site_calculator",
      utm: { utm_source: "vk", utm_medium: "social" },
      status: "qualification",
      managerId: sales.id,
      createdAt: ago(3),
    },
  });

  // ---------- 2. Заявка на этапе подготовки ТЗ (совместная работа, версии) ----------
  const lead2 = await db.lead.create({
    data: {
      title: "Площадка обслуживания оборудования",
      contactName: customer.name,
      email: customer.email,
      phone: customer.phone,
      companyName: "ООО «СтройМеталл»",
      objectType: "Площадка обслуживания",
      description: "Площадка на отм. +4.200 с лестницей и ограждением для обслуживания резервуаров.",
      status: "tz_preparation",
      source: "cabinet",
      managerId: sales.id,
      customerId: customer.id,
      createdAt: ago(6),
    },
  });
  const spec2v1 = { objectName: "Площадка обслуживания оборудования", objectType: "Площадка обслуживания", purpose: "Обслуживание двух резервуаров", address: "Липецкая обл., г. Грязи" };
  const spec2v2 = { ...spec2v1, dimensions: "6 × 12 м", spans: "Отметка площадки +4.200", loads: "Полезная нагрузка 400 кг/м²", deliverables: "КМ, КМД, спецификация металлопроката" };
  const spec2 = await db.technicalSpecification.create({
    data: { leadId: lead2.id, status: "CLARIFICATION", data: spec2v2, currentVersion: 2, clarification: "Уточните, пожалуйста, тип настила (решётчатый или рифлёный лист) и требования к покрытию." },
  });
  await db.technicalSpecificationVersion.createMany({
    data: [
      { specId: spec2.id, version: 1, data: spec2v1, changedKeys: Object.keys(spec2v1), authorId: customer.id, checksum: checksum(spec2v1), changeNote: "Первичное заполнение", createdAt: ago(5) },
      { specId: spec2.id, version: 2, data: spec2v2, changedKeys: ["dimensions", "spans", "loads", "deliverables"], authorId: sales.id, checksum: checksum(spec2v2), changeNote: "Дополнено по телефонному разговору", createdAt: ago(4) },
    ],
  });
  await db.approval.create({ data: { specId: spec2.id, specVersion: 2, kind: "SPEC", decision: "CHANGES_REQUESTED", comment: "Уточните тип настила и покрытие", userId: sales.id, createdAt: ago(3) } });
  await db.comment.create({ data: { leadId: lead2.id, authorId: sales.id, body: "Иван, добрый день! Дополнил ТЗ по нашему разговору, проверьте, пожалуйста.", createdAt: ago(4) } });
  await db.task.create({ data: { leadId: lead2.id, title: "Подготовить КП после утверждения ТЗ", assigneeId: sales.id, dueAt: new Date(Date.now() + 2 * DAY) } });

  // Заявка с договором, ожидающим подписания заказчиком (для проверки подписания кодом)
  const lead3 = await db.lead.create({
    data: {
      title: "Лестница и ограждения цеха",
      contactName: customer.name,
      email: customer.email,
      companyName: "ООО «СтройМеталл»",
      objectType: "Лестница / ограждение",
      status: "awaiting_signature",
      source: "phone",
      managerId: sales.id,
      customerId: customer.id,
      createdAt: ago(10),
    },
  });
  await db.commercialOffer.create({
    data: { leadId: lead3.id, items: [{ title: "Разработка КМ", qty: 1, unit: "компл.", price: 45000 }, { title: "Разработка КМД", qty: 1, unit: "компл.", price: 35000 }], total: 80000, termDays: 15, validUntil: new Date(Date.now() + 20 * DAY), status: "ACCEPTED", createdById: sales.id },
  });
  const c3body = renderTemplate(CONTRACT_TEMPLATE, { number: "Д-2026-0003", date: new Date().toLocaleDateString("ru-RU"), city: "Липецк", executorName: "ООО «ЭвоТехнолоджи»", executorInn: "4800000000", customerName: "ООО «СтройМеталл»", customerContact: customer.name, customerEmail: customer.email, subject: lead3.title, amount: "80 000", termDays: "15" });
  await db.contract.create({
    data: { number: "Д-2026-0003", status: "AWAITING_SIGNATURE", customerId: customer.id, amount: 80000, termDays: 15, leadId: lead3.id, versions: { create: { version: 1, body: c3body, checksum: checksum(c3body), templateId: contractTpl.id, createdById: sales.id } } },
  });

  // ---------- Проекты ----------
  async function project(title: string, opts: { daysAgo: number; duration: number; leadTitle: string; objectType: string; designers: string[] }) {
    const lead = await db.lead.create({
      data: { title: opts.leadTitle, contactName: customer.name, email: customer.email, companyName: "ООО «СтройМеталл»", objectType: opts.objectType, status: "won", source: "site_form", managerId: sales.id, customerId: customer.id, createdAt: ago(opts.daysAgo + 7) },
    });
    const p = await db.$transaction((tx) =>
      createProjectTx(tx, { title, customerId: customer.id, leadId: lead.id, managerId: pm.id, salesManagerId: sales.id, objectType: opts.objectType, durationDays: opts.duration, startedAt: ago(opts.daysAgo), briefApproved: true }, sales.id),
    );
    await db.project.update({ where: { id: p.id }, data: { createdAt: ago(opts.daysAgo) } });
    for (const d of opts.designers) await db.projectMember.create({ data: { projectId: p.id, userId: d } });
    const data = { objectName: title, objectType: opts.objectType, purpose: "Производственное назначение", address: "г. Липецк", dimensions: "18 × 36 м", deliverables: "КМ, КМД, 3D-модель IFC" };
    const spec = await db.technicalSpecification.create({ data: { projectId: p.id, leadId: lead.id, status: "APPROVED", data, currentVersion: 1 } });
    const snap = await db.technicalSpecificationVersion.create({ data: { specId: spec.id, version: 1, data, changedKeys: [], authorId: pm.id, isSnapshot: true, checksum: checksum(data), changeNote: "Утверждённая версия (снимок)", createdAt: ago(opts.daysAgo) } });
    await db.technicalSpecification.update({ where: { id: spec.id }, data: { approvedVersionId: snap.id } });
    const contractBody = renderTemplate(CONTRACT_TEMPLATE, { number: `Д-2026-P${p.number}`, subject: title, amount: "250 000", termDays: String(opts.duration), customerName: "ООО «СтройМеталл»", customerEmail: customer.email });
    const c = await db.contract.create({
      data: { number: `Д-2026-P${p.number}`, status: "SIGNED", signedAt: ago(opts.daysAgo), customerId: customer.id, amount: 250000, termDays: opts.duration, leadId: lead.id, projectId: p.id, versions: { create: { version: 1, body: contractBody, checksum: checksum(contractBody), templateId: contractTpl.id } } },
      include: { versions: true },
    });
    await db.contractAcceptance.create({ data: { contractId: c.id, versionId: c.versions[0].id, userId: customer.id, method: "CHECKBOX_OTP", ip: "127.0.0.1", userAgent: "seed", checksum: c.versions[0].checksum, acceptedAt: ago(opts.daysAgo) } });
    await db.projectStage.updateMany({ where: { projectId: p.id, code: "brief" }, data: { startedAt: ago(opts.daysAgo + 3), completedAt: ago(opts.daysAgo) } });
    await db.projectStage.updateMany({ where: { projectId: p.id, code: "sketch" }, data: { startedAt: ago(opts.daysAgo), assigneeId: opts.designers[0] } });
    return p;
  }

  async function version(projectId: string, code: "sketch" | "model", v: number, status: "DRAFT" | "INTERNAL_REVIEW" | "CUSTOMER_REVIEW" | "CHANGES_REQUESTED" | "APPROVED", by: string, daysAgo: number, desc: string, prevId: string | null = null) {
    const stage = await db.projectStage.findUniqueOrThrow({ where: { projectId_code: { projectId, code } } });
    const file = await pdf(`${stage.title} — версия ${v}`, `# ${stage.title}\n\nВерсия ${v}. ${desc}\n\nДемонстрационный файл результата этапа.`, { projectId, stageCode: code, category: code === "sketch" ? "SKETCH" : "MODEL" }, `${code === "sketch" ? "Эскиз" : "3D-модель"}_v${v}.pdf`, by);
    const sv = await db.stageVersion.create({ data: { stageId: stage.id, version: v, description: desc, status, createdById: by, previousVersionId: prevId, createdAt: ago(daysAgo) } });
    await db.fileAsset.update({ where: { id: file.id }, data: { stageVersionId: sv.id } });
    return { stage, sv };
  }

  // ---------- 3. Проект с приостановленным таймером ----------
  const pA = await project("Каркас производственного цеха 18×36 м", { daysAgo: 12, duration: 30, leadTitle: "Проектирование каркаса цеха", objectType: "Каркас здания", designers: [designer.id] });
  await version(pA.id, "sketch", 1, "DRAFT", designer.id, 5, "Компоновка каркаса, шаг рам 6 м");
  const reqA = await db.customerRequest.create({
    data: { projectId: pA.id, stageCode: "sketch", authorId: pm.id, question: "Пришлите, пожалуйста, геологию участка и подтвердите грузоподъёмность кран-балки (3,2 т или 5 т).", pausesTimer: true, createdAt: ago(2) },
  });
  const timerA = await db.timer.findUniqueOrThrow({ where: { projectId: pA.id } });
  await db.timerPause.createMany({
    data: [
      { timerId: timerA.id, kind: "AUTO", reason: "Ожидались исходные данные: топосъёмка участка", initiatorId: pm.id, startedAt: ago(9), endedAt: ago(7), resumedById: customer.id, resumeNote: "Получены данные от заказчика" },
      { timerId: timerA.id, kind: "AUTO", reason: `Ожидается ответ заказчика: «${reqA.question.slice(0, 80)}»`, initiatorId: pm.id, startedAt: ago(2) },
    ],
  });
  await db.timer.update({ where: { id: timerA.id }, data: { state: "paused_waiting_customer" } });
  await db.customerRequest.create({ data: { projectId: pA.id, authorId: pm.id, question: "Пришлите топографическую съёмку участка.", status: "ANSWERED", answer: "Съёмка во вложении к проекту.", answeredById: customer.id, answeredAt: ago(7), createdAt: ago(9) } });
  await db.comment.create({ data: { projectId: pA.id, authorId: designer.id, body: "@Марина Соколова, без данных по кран-балке не могу подобрать сечение подкрановых балок.", mentions: [pm.id], internal: true, createdAt: ago(2) } });

  // ---------- 4. Эскиз на согласовании у заказчика ----------
  const pB = await project("Навес над погрузочной рампой", { daysAgo: 8, duration: 20, leadTitle: "Навес над рампой", objectType: "Навес", designers: [designer.id, designer2.id] });
  const { stage: sB, sv: svB } = await version(pB.id, "sketch", 1, "CUSTOMER_REVIEW", designer2.id, 2, "Эскиз навеса 12×30 м, консольные фермы, кровля — профнастил Н60");
  await db.projectStage.update({ where: { id: sB.id }, data: { status: "customer_review" } });
  await db.approval.createMany({
    data: [
      { stageVersionId: svB.id, kind: "INTERNAL", decision: "SUBMITTED", userId: designer2.id, createdAt: ago(2) },
      { stageVersionId: svB.id, kind: "INTERNAL", decision: "APPROVED", comment: "Проверено, можно отправлять заказчику", userId: designer.id, createdAt: ago(1) },
    ],
  });
  const timerB = await db.timer.findUniqueOrThrow({ where: { projectId: pB.id } });
  await db.timerPause.create({ data: { timerId: timerB.id, kind: "AUTO", reason: "На согласовании у заказчика: разработка и согласование эскиза", initiatorId: designer.id, startedAt: ago(1) } });
  await db.timer.update({ where: { id: timerB.id }, data: { state: "paused_waiting_customer" } });

  // ---------- 5. Проект, возвращённый на доработку ----------
  const pC = await project("Пешеходная галерея между корпусами", { daysAgo: 20, duration: 35, leadTitle: "Галерея между корпусами", objectType: "Эстакада", designers: [designer.id] });
  const { stage: sC1, sv: svC1 } = await version(pC.id, "sketch", 1, "APPROVED", designer.id, 15, "Эскиз галереи пролётом 24 м");
  await db.stageVersion.update({ where: { id: svC1.id }, data: { lockedAt: ago(13), checksum: "seed" } });
  await db.projectStage.update({ where: { id: sC1.id }, data: { status: "completed", completedAt: ago(13) } });
  const { stage: sC2, sv: svC2 } = await version(pC.id, "model", 1, "CHANGES_REQUESTED", designer.id, 4, "3D-модель галереи, связи по нижнему поясу");
  await db.projectStage.update({ where: { id: sC2.id }, data: { status: "changes_requested", startedAt: ago(13), assigneeId: designer.id } });
  await db.approval.createMany({
    data: [
      { stageVersionId: svC2.id, kind: "INTERNAL", decision: "APPROVED", userId: designer.id, createdAt: ago(3) },
      { stageVersionId: svC2.id, kind: "CUSTOMER", decision: "CHANGES_REQUESTED", comment: "Прошу увеличить высоту в свету до 2,4 м и добавить остекление с северной стороны.", userId: customer.id, createdAt: ago(1) },
    ],
  });
  await db.statusChange.create({ data: { entityType: "ProjectStage", entityId: sC2.id, projectId: pC.id, fromStatus: "customer_review", toStatus: "changes_requested", actorId: customer.id, comment: "Увеличить высоту в свету до 2,4 м", createdAt: ago(1) } });
  // Проект другого заказчика — для проверки изоляции данных
  await db.$transaction((tx) => createProjectTx(tx, { title: "Беседка для базы отдыха", customerId: customer2.id, managerId: pm.id, durationDays: 10, startedAt: ago(1), briefApproved: true }, pm.id));

  // ---------- 6. Завершённый и оплаченный быстрый заказ ----------
  const params: QuickOrderParams = { length: 6, width: 4, height: 2.6, roofType: "single", covering: "polycarbonate", frame: "profile_pipe", foundation: "piles", region: "Липецкая область", snowDistrict: "III", color: "RAL 8017", attachedToBuilding: true, notes: "Навес для автомобиля у дома" };
  const mock = new MockAIProvider(0);
  const qo = await db.quickOrder.create({ data: { customerId: customer.id, structureType: "CANOPY", status: "COMPLETED", params: params as unknown as Prisma.InputJsonValue, createdAt: ago(4) } });
  const job = await db.aIJob.create({ data: { quickOrderId: qo.id, status: "completed", provider: "mock", demo: true, input: { structureType: "CANOPY", params } as unknown as Prisma.InputJsonValue, attempts: 2, startedAt: ago(4), finishedAt: ago(3) } });
  const variants = await mock.generateVariants({ structureType: "CANOPY", params, count: 3 });
  const created = [];
  for (const [i, v] of variants.entries()) {
    created.push(await db.designVariant.create({ data: { aiJobId: job.id, quickOrderId: qo.id, title: v.title, description: v.description, params: v.geometry as unknown as Prisma.InputJsonValue, imageSvg: v.svg, priceDelta: v.priceDelta, status: i === 1 ? "SELECTED" : "REJECTED" } }));
  }
  const chosen = created[1];
  const price = quickOrderPrice("CANOPY", params, chosen.priceDelta);
  const qbody = renderTemplate(QUICK_CONTRACT_TEMPLATE, { number: `БЗ-2026-${String(qo.number).padStart(4, "0")}`, customerName: customer.name, customerEmail: customer.email, structure: "Навес", dimensions: "6 × 4 м, высота 2.6 м", amount: price.toLocaleString("ru-RU"), termDays: "3", variant: chosen.title, city: "Липецк", date: ago(4).toLocaleDateString("ru-RU") });
  const qc = await db.contract.create({
    data: { number: `БЗ-2026-${String(qo.number).padStart(4, "0")}`, status: "SIGNED", signedAt: ago(4), customerId: customer.id, amount: price, termDays: 3, quickOrderId: qo.id, versions: { create: { version: 1, body: qbody, checksum: checksum(qbody), templateId: quickTpl.id } } },
    include: { versions: true },
  });
  await db.contractAcceptance.create({ data: { contractId: qc.id, versionId: qc.versions[0].id, userId: customer.id, method: "CHECKBOX_OTP", ip: "127.0.0.1", userAgent: "seed", checksum: qc.versions[0].checksum, acceptedAt: ago(4) } });
  const pay = await db.payment.create({
    data: { orderId: `QO${qo.number}-seed`, idempotencyKey: `${qo.id}:seed`, provider: "mock", amount: price * 100, description: `Проектирование: быстрый заказ №${qo.number}`, status: "paid", providerPaymentId: "900000001", testMode: true, contractId: qc.id, quickOrderId: qo.id, payerId: customer.id, paidAt: ago(3), createdAt: ago(4) },
  });
  await db.paymentEvent.create({ data: { paymentId: pay.id, eventKey: "900000001:CONFIRMED", status: "CONFIRMED", payload: { Status: "CONFIRMED", OrderId: pay.orderId } } });
  const files = await mock.generatePackage({ orderNumber: `БЗ-${qo.number}`, structureType: "CANOPY", params, variant: { title: chosen.title, description: chosen.description, geometry: chosen.params as never, svg: chosen.imageSvg } });
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const archive = await saveGenerated(await zip.generateAsync({ type: "nodebuffer" }), `EvoTechnology_БЗ-${qo.number}.zip`, "application/zip", { quickOrderId: qo.id, category: "ARCHIVE" }, null);
  await db.quickOrder.update({ where: { id: qo.id }, data: { price, selectedVariantId: chosen.id, archiveFileId: archive.id } });
  await db.aIJob.update({ where: { id: job.id }, data: { output: { files: files.map((f) => f.path), archiveFileId: archive.id } } });

  // ---------- Уведомления и журнал ----------
  await db.notification.createMany({
    data: [
      { userId: customer.id, type: "approval.pending", title: "Требуется согласование: разработка и согласование эскиза", body: "Проект «Навес над погрузочной рампой»", link: `/cabinet/projects/${pB.id}?tab=stages` },
      { userId: customer.id, type: "request.new", title: `Запрос по проекту №${pA.number}`, body: reqA.question, link: `/cabinet/projects/${pA.id}?tab=requests` },
      { userId: customer.id, type: "archive.ready", title: `Документация по заказу №${qo.number} готова`, link: `/cabinet/quick-orders/${qo.id}`, readAt: ago(3) },
      { userId: designer.id, type: "approval.changes", title: "Замечания заказчика по этапу «Разработка и согласование 3D-модели»", body: "Увеличить высоту в свету до 2,4 м", link: `/cabinet/projects/${pC.id}?tab=stages` },
      { userId: sales.id, type: "lead.new", title: `Новая заявка №${lead1.number}`, body: lead1.title, link: `/cabinet/leads/${lead1.id}` },
    ],
  });
  await db.auditEvent.createMany({
    data: [
      { actorId: director.id, action: "auth.login", ip: "127.0.0.1", createdAt: ago(1) },
      { actorId: customer.id, action: "contract.accept", entityType: "Contract", entityId: qc.id, ip: "127.0.0.1", createdAt: ago(4) },
      { action: "payment.status", entityType: "Payment", entityId: pay.id, meta: { from: "pending", to: "paid" }, createdAt: ago(3) },
    ],
  });

  console.log("Демо-данные созданы. Пароль всех учётных записей:", DEMO_PASSWORD);
  console.table([director, pm, sales, designer, designer2, customer, customer2].map((u) => ({ email: u.email, role: u.role, name: u.name })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
