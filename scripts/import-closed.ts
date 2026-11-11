// Импорт закрытых проектов из таблицы учёта (вкладки «Март 2026», «Август 2026», «Сентябрь 2026» → CSV):
//   data/import/closed/ГГГГ-ММ.csv — имя файла задаёт месяц договора.
// Проекты создаются сразу завершёнными: договор подписан (на бумаге) 1-го числа месяца, все этапы выполнены,
// проектировщику — оплата и аванс из таблицы. Берутся только строки с заказчиком и стоимостью, остальное пропускается.
// Повторный запуск безопасен: строка таблицы (вкладка + номер строки) импортируется один раз. Письма клиентам не отправляются.
// Доп. работы по тому же договору (номер повторяется) — отдельный проект, к номеру добавляется «/ ГГГГ-ММ-строка».
// Запуск: npx tsx scripts/import-closed.ts [--dry]

import { readdirSync, readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { checksum } from "../src/domain/spec";
import { createProjectTx } from "../src/services/projects";
import { contractNumber, customer, designer, money, parseCsv, phone, SCOPE_TYPE } from "./import-lib";

const DIR = "data/import/closed";
const dry = process.argv.includes("--dry");

interface Row {
  month: string;
  row: number;
  client: string;
  number: string;
  scope: string;
  amount: number;
  phone: string;
  email: string;
  days: number;
  fee: number | null;
  advance: number | null;
  executor: string;
}

function readMonth(file: string): Row[] {
  const month = file.replace(/\.csv$/, "");
  // Заголовок — третья строка: ФИО | № Договора | ТЗ | Оценка | Телефон | Почта | Срок | Дата сдачи | Стоимость | Зарплата | Аванс | Исполнитель
  return parseCsv(readFileSync(`${DIR}/${file}`, "utf8"))
    .slice(3)
    .map((r, i) => ({
      month,
      row: i + 4,
      client: r[0] ?? "",
      number: r[1] ?? "",
      scope: r[2] ?? "",
      amount: money(r[8] ?? "") ?? 0,
      phone: r[4] ?? "",
      email: r[5] ?? "",
      days: Number(r[6]) || 10,
      fee: money(r[9] ?? ""),
      advance: money(r[10] ?? ""),
      executor: r[11] ?? "",
    }))
    .filter((r) => r.client && r.amount > 0);
}

async function main() {
  const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}\.csv$/.test(f)).sort();
  const rows = files.flatMap(readMonth);
  if (dry) {
    console.table(rows.map((r) => ({ месяц: r.month, строка: r.row, заказчик: r.client.slice(0, 30), договор: contractNumber(r.number || `б/н ${r.month}-${r.row}`, r.client).slice(0, 24), сумма: r.amount, оплата: r.fee, исполнитель: r.executor })));
    console.log(`Строк к импорту: ${rows.length}`);
    return;
  }
  const [pm, sales] = await Promise.all([
    db.user.findFirst({ where: { role: "PROJECT_MANAGER", status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
    db.user.findFirst({ where: { role: "SALES_MANAGER", status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
  ]);
  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const imported = await db.lead.findFirst({ where: { AND: [{ utm: { path: ["import"], equals: "sheet-closed" } }, { utm: { path: ["sheet"], equals: r.month } }, { utm: { path: ["row"], equals: r.row } }] } });
    if (imported) {
      skipped++;
      continue;
    }
    const base = contractNumber(r.number || `б/н ${r.month}-${r.row}`, r.client);
    const number = (await db.contract.findUnique({ where: { number: base } })) ? `${base} / ${r.month}-${r.row}` : base;
    const [y, m] = r.month.split("-").map(Number);
    const signedAt = new Date(Date.UTC(y, m - 1, 1, 6)); // 1-е число месяца, 09:00 МСК
    const completedAt = new Date(Date.UTC(y, m, 0, 15)); // последний день месяца
    const cust = await customer(r.client, r.email, r.phone);
    // «Иванович/Болт» — два исполнителя, оплата пополам; латинские буквы-двойники → кириллица («Cаламатов»)
    const names = r.executor.split("/").map((n) => n.replace(/[CcAaEeOoPpXx]/g, (ch) => "СсАаЕеОоРрХх"["CcAaEeOoPpXx".indexOf(ch)]).trim()).filter(Boolean);
    const designerIds = (await Promise.all(names.map((n) => designer(n)))).filter((x): x is string => !!x);
    const share = (v: number | null) => (v === null || !designerIds.length ? v : Math.round(v / designerIds.length));
    const objectType = SCOPE_TYPE.find(([re]) => re.test(r.scope))?.[1] ?? "Проектирование";
    const title = `${r.scope || "Проектирование"} — ${r.client}`;
    const body = `^ ДОГОВОР № ${number}\n\nАрхивный договор из таблицы учёта (${r.month}). Работы выполнены, проект закрыт.\n\nСумма: ${r.amount.toLocaleString("ru-RU")} руб. Срок: ${r.days} рабочих дней.`;
    await db.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          title,
          contactName: r.client,
          email: cust.email,
          phone: phone(r.phone),
          companyName: r.client,
          objectType,
          budget: `${r.amount.toLocaleString("ru-RU")} ₽`,
          status: "won",
          source: "manual",
          utm: { import: "sheet-closed", sheet: r.month, row: r.row } as Prisma.InputJsonValue,
          managerId: sales?.id ?? null,
          customerId: cust.id,
          createdAt: signedAt,
        },
      });
      const p = await createProjectTx(
        tx,
        { title, customerId: cust.id, leadId: lead.id, managerId: pm?.id ?? null, salesManagerId: sales?.id ?? null, objectType, description: `Импорт из таблицы учёта (вкладка ${r.month}, строка ${r.row}). Проект закрыт.`, durationDays: r.days, startedAt: signedAt, briefApproved: true },
        pm?.id ?? sales?.id ?? cust.id,
      );
      // Закрытый проект: все этапы выполнены, таймер остановлен, статус «Завершён»
      await tx.project.update({ where: { id: p.id }, data: { status: "COMPLETED", createdAt: signedAt } });
      await tx.projectStage.updateMany({ where: { projectId: p.id }, data: { status: "completed", startedAt: signedAt, completedAt } });
      await tx.timer.updateMany({ where: { projectId: p.id }, data: { completedAt, state: "completed" } });
      await tx.statusChange.create({ data: { entityType: "Project", entityId: p.id, projectId: p.id, fromStatus: "ACTIVE", toStatus: "COMPLETED", comment: "Архивный проект из таблицы учёта", createdAt: completedAt } });
      const c = await tx.contract.create({
        data: { number, status: "SIGNED", signedAt, customerId: cust.id, amount: r.amount, termDays: r.days, leadId: lead.id, projectId: p.id, isRevision: /редакц/i.test(r.scope), versions: { create: { version: 1, body, checksum: checksum(body) } } },
        include: { versions: true },
      });
      await tx.contractAcceptance.create({ data: { contractId: c.id, versionId: c.versions[0].id, userId: cust.id, method: "OFFLINE", checksum: c.versions[0].checksum, acceptedAt: signedAt } });
      for (const userId of designerIds) await tx.projectMember.create({ data: { projectId: p.id, userId, fee: share(r.fee), advance: share(r.advance) } });
      await tx.auditEvent.create({ data: { action: "project.create", entityType: "Project", entityId: p.id, projectId: p.id, meta: { import: "sheet-closed", month: r.month, row: r.row } } });
    });
    created++;
  }
  console.log(`Закрытых проектов создано: ${created}, уже были: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
