import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { logger } from "@/lib/logger";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { textToPdf } from "@/lib/pdf";
import { storage } from "@/lib/storage";
import { SBIS_FAILED, SBIS_SIGNED, sbis, type SbisParty } from "@/lib/edo/sbis";
import { can, ForbiddenError } from "@/domain/rbac";
import { companyRequisites, markContractSigned } from "./contracts";
import { saveGenerated } from "./files";

// Подписание договора через ЭДО СБИС — второй способ наряду с кодом из письма (для заказчиков без ЭДО).

/** «ИП Иванов Иван Иванович» / «индивидуальный предприниматель Иванов И.» → ФИО по словам. */
export function fioFrom(name: string): SbisParty["fio"] {
  const words = name.replace(/^(ИП|индивидуальный предприниматель)\s+/i, "").replace(/[«»"]/g, "").trim().split(/\s+/);
  if (words.length < 2) return null;
  return { last: words[0], first: words[1], middle: words[2] };
}

export async function sendContractToSbis(user: SessionUser, contractId: string, input: { inn: string; kpp: string }) {
  if (!can(user.role, "contracts.manage")) throw new ForbiddenError("Отправлять договоры в СБИС может менеджер или директор");
  const client = sbis();
  if (!client) throw new UserError("СБИС не подключён — укажите доступ в настройках сервера");
  const contract = await db.contract.findUnique({ where: { id: contractId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!contract) throw new NotFoundError("Договор");
  if (contract.status !== "AWAITING_SIGNATURE") throw new UserError("В СБИС отправляется договор, ожидающий подписания");
  if (contract.sbisDocumentId && !SBIS_FAILED.has(contract.sbisStateCode ?? "")) throw new UserError("Договор уже отправлен в СБИС — дождитесь подписания или отзовите документ в Saby");
  const inn = input.inn.replace(/\s/g, "");
  const kpp = input.kpp.replace(/\s/g, "");
  if (!/^(\d{10}|\d{12})$/.test(inn)) throw new UserError("ИНН заказчика — 10 цифр для организации, 12 — для ИП", { inn: "10 или 12 цифр" });
  if (inn.length === 10 && !/^\d{9}$/.test(kpp)) throw new UserError("Для организации укажите КПП", { kpp: "9 цифр" });

  const customer = await db.user.findUniqueOrThrow({ where: { id: contract.customerId }, include: { company: true } });
  const companyName = customer.company?.name ?? customer.name;
  // Реквизиты из формы сохраняются в карточку организации заказчика
  if (customer.companyId) await db.company.update({ where: { id: customer.companyId }, data: { inn, kpp: kpp || null } });
  else await db.user.update({ where: { id: customer.id }, data: { company: { create: { name: companyName, inn, kpp: kpp || null } } } });

  const r = await companyRequisites();
  const version = contract.versions[0];
  // Загруженный готовый договор отправляется как есть, иначе — PDF актуальной редакции
  const uploaded = contract.fileId ? await db.fileAsset.findUnique({ where: { id: contract.fileId } }) : null;
  const file = uploaded
    ? { name: uploaded.originalName, data: await storage().get(uploaded.storageKey) }
    : { name: `Договор_${contract.number}.pdf`, data: await textToPdf(`Договор ${contract.number}`, version.body) };
  const res = await client.createContract({
    number: contract.number,
    date: contract.createdAt,
    amount: contract.amount,
    note: `Договор подряда № ${contract.number}, редакция ${version.version}. Сформирован на evotechnology.su`,
    file,
    our: { inn: r.inn, name: r.shortName ?? r.name, fio: fioFrom(r.name ?? r.shortName ?? "") },
    counterparty: { inn, kpp: kpp || null, name: companyName, fio: inn.length === 12 ? fioFrom(companyName) ?? fioFrom(customer.name) : null },
  });
  await db.contract.update({ where: { id: contractId }, data: { sbisDocumentId: res.id, sbisLink: res.link, sbisStateCode: "0", sbisStateName: "Документ редактируется", sbisSentAt: new Date() } });
  await audit({ actorId: user.id, action: "contract.sbis", entityType: "Contract", entityId: contractId, meta: { sbisDocumentId: res.id, version: version.version } });
  return res;
}

/** Сверка договоров, отправленных в СБИС (воркер, раз в 5 минут). Возвращает число изменений. */
export async function syncSbisContracts(): Promise<number> {
  const client = sbis();
  if (!client) return 0;
  const pending = await db.contract.findMany({ where: { sbisDocumentId: { not: null }, status: "AWAITING_SIGNATURE" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, take: 50 });
  let changed = 0;
  for (const c of pending) {
    try {
      const state = await client.read(c.sbisDocumentId!);
      if (state.code === c.sbisStateCode) continue;
      changed++;
      await db.contract.update({ where: { id: c.id }, data: { sbisStateCode: state.code, sbisStateName: state.name, sbisLink: state.link ?? c.sbisLink } });
      const managerLink = `/cabinet/contracts/${c.id}`;
      const staff = c.projectId
        ? await db.project.findUnique({ where: { id: c.projectId }, select: { managerId: true, salesManagerId: true } }).then((p) => [p?.managerId, p?.salesManagerId])
        : c.leadId
          ? await db.lead.findUnique({ where: { id: c.leadId }, select: { managerId: true } }).then((l) => [l?.managerId])
          : [];
      if (state.code === SBIS_SIGNED) {
        // Подписанные файлы и подписи (.sgn) — в документы проекта или заявки
        for (const f of state.files) {
          try {
            const data = await client.download(f.url);
            await saveGenerated(data, `СБИС_${c.number}_${f.name}`, f.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream", { projectId: c.projectId, leadId: c.projectId ? null : c.leadId, category: "DOCUMENT" }, null);
          } catch (err) {
            logger.warn("sbis.download_failed", { contractId: c.id, file: f.name, err });
          }
        }
        await markContractSigned(c, c.versions[0], { userId: c.customerId, method: "EXTERNAL_EDO", via: "в ЭДО СБИС" });
      } else if (SBIS_FAILED.has(state.code)) {
        await notify(staff, "status.changed", `Договор ${c.number}: СБИС — ${state.name}`, "Документ не подписан в ЭДО. Проверьте карточку в Saby или подпишите договор кодом из письма.", managerLink);
      }
    } catch (err) {
      logger.warn("sbis.sync_failed", { contractId: c.id, err });
    }
  }
  return changed;
}
