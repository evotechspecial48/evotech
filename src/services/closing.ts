import type { ClosingDocument } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { logger } from "@/lib/logger";
import { UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { textToPdf } from "@/lib/pdf";
import { storage } from "@/lib/storage";
import { SBIS_FAILED, SBIS_SIGNED, sbis } from "@/lib/edo/sbis";
import { buildUpdXml, toCp1251 } from "@/lib/edo/upd";
import { tbankBusiness } from "@/lib/payments/tbank-business";
import { ForbiddenError } from "@/domain/rbac";
import { renderTemplate } from "@/domain/spec";
import { activeTemplate, companyRequisites, contractVars } from "./contracts";
import { fioFrom, saveCustomerInn } from "./edo";
import { saveGenerated } from "./files";
import { loadProjectAccess } from "./scope";

// Закрывающие документы проекта: акт выполненных работ и УПД (статус 2). Формируются при завершении проекта
// по подписанным договорам и спецификациям проекта и уходят заказчику через ЭДО СБИС пакетом «Документ отгрузки»
// (черновик в Saby — директор подписывает КЭП и отправляет, как договоры). Без ИНН заказчика или без СБИС —
// документы доступны в проекте для скачивания.

const money = (n: number) => n.toLocaleString("ru-RU");
const ddmm = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
/** Документ уже в ЭДО и не отклонён — перегенерировать нельзя. */
const inEdo = (c: ClosingDocument) => !!c.sbisDocumentId && !SBIS_FAILED.has(c.sbisStateCode ?? "");

async function projectData(projectId: string) {
  return db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { contracts: { where: { status: "SIGNED" }, orderBy: { signedAt: "asc" } }, customer: { include: { company: true } }, closing: true },
  });
}

/** Сформировать (или пересоздать, пока не отправлены) акт и УПД. Без подписанных договоров — null. */
export async function prepareClosingDocs(projectId: string, actorId: string | null): Promise<ClosingDocument | null> {
  const p = await projectData(projectId);
  if (p.closing && inEdo(p.closing)) return p.closing;
  const amount = p.contracts.reduce((s, c) => s + c.amount, 0);
  if (!p.contracts.length || amount <= 0) return null;
  const doc = p.closing ?? (await db.closingDocument.create({ data: { projectId, amount } }));
  const date = new Date();
  const number = String(doc.number);
  const company = p.customer.company;
  const lines = p.contracts.map((c) => ({ title: `Проектные работы «${p.title}» по ${c.parentId ? "спецификации" : "договору"} № ${c.number}`, amount: c.amount }));
  const basis = p.contracts.map((c) => ({ name: c.parentId ? "Спецификация" : "Договор", number: c.number, date: c.signedAt ?? c.createdAt }));

  const vars = await contractVars({ number, customerName: p.customer.name, customerEmail: p.customer.email, companyName: company?.name, subject: p.title, amount, termDays: 0 });
  const body = renderTemplate((await activeTemplate("ACT")).body, {
    ...vars,
    actNumber: number,
    date: ddmm(date),
    customerInnLine: company?.inn ? `, ИНН ${company.inn}${company.kpp ? `, КПП ${company.kpp}` : ""}` : "",
    basis: basis.map((b) => `${b.name} № ${b.number} от ${ddmm(b.date)}`).join("; "),
    rows: lines.map((l, i) => `| ${i + 1} | ${l.title} | 1 | ${money(l.amount)} |`).join("\n"),
  });
  // Акт выставляется в Т-Бизнесе (учёт закрывающих документов в банке); банк недоступен — PDF по нашему шаблону
  let actPdf: Buffer | null = null;
  const bank = tbankBusiness();
  if (bank.name === "tbank-business") {
    try {
      const res = await bank.createAct({
        number,
        date: date.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }),
        buyer: { name: company?.name ?? p.customer.name, inn: company?.inn, kpp: company?.kpp, address: company?.legalAddress },
        items: lines.map((l) => ({ name: l.title, price: l.amount })),
        footer: `Основание: ${basis.map((b) => `${b.name} № ${b.number} от ${ddmm(b.date)}`).join("; ")}. НДС не облагается.`,
      });
      actPdf = res.pdfUrl ? await bank.downloadPdf(res.pdfUrl) : null;
    } catch (err) {
      logger.warn("closing.tbank_act_failed", { projectId, err });
    }
  }
  const actSource = actPdf ? "tbank" : "template";
  const act = await saveGenerated(actPdf ?? (await textToPdf(`Акт № ${number}`, body)), `Акт_${number}_проект_${p.number}.pdf`, "application/pdf", { projectId, category: "DOCUMENT" }, actorId);

  const r = await companyRequisites();
  const sellerFio = fioFrom(r.name ?? r.shortName ?? "") ?? { last: r.signer ?? "", first: "-" };
  const buyerName = company?.name ?? p.customer.name;
  const upd = buildUpdXml({
    number,
    date,
    seller: { inn: r.inn ?? "", name: r.shortName ?? r.name ?? "", fio: sellerFio, address: r.address },
    buyer: { inn: company?.inn ?? "", kpp: company?.kpp, name: buyerName, fio: fioFrom(buyerName) ?? fioFrom(p.customer.name), address: company?.legalAddress },
    rows: lines,
    basis,
    signer: sellerFio,
  });
  const updFile = await saveGenerated(toCp1251(upd.xml), `${upd.fileName}.xml`, "application/xml", { projectId, category: "DOCUMENT" }, actorId);

  return db.closingDocument.update({
    where: { id: doc.id },
    data: { date, amount, actFileId: act.id, actSource, updFileId: updFile.id, sbisDocumentId: null, sbisStateCode: null, sbisStateName: null, sbisLink: null, sbisSentAt: null, error: null },
  });
}

/** Черновик «Документ отгрузки» в Saby с актом и УПД. Ошибка сохраняется в карточке и пробрасывается. */
export async function sendClosingToSbis(closingId: string, actorId: string | null) {
  const client = sbis();
  if (!client) throw new UserError("СБИС не подключён — укажите доступ в настройках сервера");
  let doc = await db.closingDocument.findUniqueOrThrow({ where: { id: closingId }, include: { project: { include: { customer: { include: { company: true } } } } } });
  // Формирование ранее прервалось — файлов нет, собираем заново
  if (!doc.actFileId || !doc.updFileId) {
    await prepareClosingDocs(doc.projectId, actorId);
    doc = await db.closingDocument.findUniqueOrThrow({ where: { id: closingId }, include: { project: { include: { customer: { include: { company: true } } } } } });
  }
  if (inEdo(doc)) throw new UserError("Акт и УПД уже отправлены в СБИС");
  const company = doc.project.customer.company;
  try {
    if (!company?.inn) throw new UserError("У заказчика не указан ИНН — укажите его, чтобы отправить документы через СБИС");
    const [act, upd] = await Promise.all([doc.actFileId, doc.updFileId].map((id) => db.fileAsset.findUniqueOrThrow({ where: { id: id! } })));
    const r = await companyRequisites();
    const name = company.name ?? doc.project.customer.name;
    const res = await client.createShipment({
      number: String(doc.number),
      date: doc.date,
      amount: doc.amount,
      note: `Акт и УПД по проекту №${doc.project.number} «${doc.project.title}». Сформированы на evotechnology.su`,
      files: [
        { name: act.originalName, data: await storage().get(act.storageKey) },
        { name: upd.originalName, data: await storage().get(upd.storageKey) },
      ],
      our: { inn: r.inn, name: r.shortName ?? r.name, fio: fioFrom(r.name ?? r.shortName ?? "") },
      counterparty: { inn: company.inn, kpp: company.kpp, name, fio: company.inn.length === 12 ? (fioFrom(name) ?? fioFrom(doc.project.customer.name)) : null },
    });
    await db.closingDocument.update({ where: { id: closingId }, data: { sbisDocumentId: res.id, sbisLink: res.link, sbisStateCode: "0", sbisStateName: "Документ редактируется", sbisSentAt: new Date(), error: null } });
    await audit({ actorId, action: "closing.sbis", entityType: "Project", entityId: doc.projectId, projectId: doc.projectId, meta: { sbisDocumentId: res.id, number: doc.number } });
    const directors = await db.user.findMany({ where: { role: "DIRECTOR", status: "ACTIVE" }, select: { id: true } });
    await notify(
      [...directors.map((d) => d.id), doc.project.managerId],
      "status.changed",
      `Акт и УПД по проекту №${doc.project.number} загружены в СБИС`,
      "Подпишите документы КЭП и отправьте заказчику в Saby.",
      `/cabinet/projects/${doc.projectId}`,
    );
    return res;
  } catch (err) {
    await db.closingDocument.update({ where: { id: closingId }, data: { error: err instanceof Error ? err.message.slice(0, 500) : String(err) } });
    throw err;
  }
}

/** После завершения проекта: сформировать документы и отправить в СБИС. Ошибки не мешают завершению. */
export async function onProjectCompleted(projectId: string, actorId: string | null) {
  try {
    const doc = await prepareClosingDocs(projectId, actorId);
    if (doc && sbis() && !doc.sbisDocumentId) await sendClosingToSbis(doc.id, actorId);
  } catch (err) {
    logger.warn("closing.auto_failed", { projectId, err });
  }
}

async function manageAccess(user: SessionUser, projectId: string) {
  const access = await loadProjectAccess(user, projectId);
  if (!access.canManage) throw new ForbiddenError("Закрывающие документы оформляет руководитель проекта или директор");
  return access;
}

export async function regenerateClosingDocs(user: SessionUser, projectId: string) {
  await manageAccess(user, projectId);
  const p = await projectData(projectId);
  if (p.status !== "COMPLETED") throw new UserError("Акт и УПД формируются по завершённому проекту");
  if (p.closing && inEdo(p.closing)) throw new UserError("Документы уже в СБИС — пересоздать нельзя, отзовите их в Saby");
  const doc = await prepareClosingDocs(projectId, user.id);
  if (!doc) throw new UserError("По проекту нет подписанных договоров");
  return doc;
}

export async function sendClosingByUser(user: SessionUser, projectId: string, input: { inn: string; kpp: string }) {
  const access = await manageAccess(user, projectId);
  if (input.inn.trim()) await saveCustomerInn(access.info.customerId, input);
  const doc = (await db.closingDocument.findUnique({ where: { projectId } })) ?? (await prepareClosingDocs(projectId, user.id));
  if (!doc) throw new UserError("По проекту нет подписанных договоров");
  return sendClosingToSbis(doc.id, user.id);
}

/** Сверка статусов акта/УПД в СБИС (воркер). Подписанные заказчиком файлы — в документы проекта. */
export async function syncSbisClosing(): Promise<number> {
  const client = sbis();
  if (!client) return 0;
  const pending = await db.closingDocument.findMany({ where: { sbisDocumentId: { not: null }, NOT: { sbisStateCode: { in: [SBIS_SIGNED, ...SBIS_FAILED] } } }, include: { project: true }, take: 50 });
  let changed = 0;
  for (const c of pending) {
    try {
      const state = await client.read(c.sbisDocumentId!);
      if (state.code === c.sbisStateCode) continue;
      changed++;
      await db.closingDocument.update({ where: { id: c.id }, data: { sbisStateCode: state.code, sbisStateName: state.name, sbisLink: state.link ?? c.sbisLink } });
      const link = `/cabinet/projects/${c.projectId}`;
      if (state.code === SBIS_SIGNED) {
        for (const f of state.files) {
          try {
            const data = await client.download(f.url);
            await saveGenerated(data, `СБИС_акт_${c.number}_${f.name}`, f.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream", { projectId: c.projectId, category: "DOCUMENT" }, null);
          } catch (err) {
            logger.warn("sbis.closing_download_failed", { closingId: c.id, file: f.name, err });
          }
        }
        await notify([c.project.managerId, c.project.salesManagerId], "status.changed", `Проект №${c.project.number}: заказчик подписал акт и УПД`, "Подписанные документы сохранены в проекте.", link);
      } else if (SBIS_FAILED.has(state.code)) {
        await notify([c.project.managerId], "status.changed", `Проект №${c.project.number}: акт и УПД — ${state.name}`, "Документы не подписаны в ЭДО. Проверьте карточку в Saby.", link);
      }
    } catch (err) {
      logger.warn("sbis.closing_sync_failed", { closingId: c.id, err });
    }
  }
  return changed;
}
