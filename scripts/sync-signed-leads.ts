// Заявки в статусе «Договор подписан» без проекта (статус ставили вручную до 11.11.2026):
// договор отмечается подписанным вне кабинета и создаётся проект — как при смене статуса сейчас.
// Запуск: npx tsx scripts/sync-signed-leads.ts [--dry]

import type { SessionUser } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { signedOutsideCabinet } from "../src/services/leads";

const dry = process.argv.includes("--dry");

async function main() {
  const director = await db.user.findFirst({ where: { role: "DIRECTOR", status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!director) throw new Error("Нет активного директора");
  const leads = await db.lead.findMany({ where: { status: "contract_signed", project: null }, select: { id: true, number: true, title: true } });
  for (const l of leads) {
    console.log(`${dry ? "[проверка] " : ""}заявка №${l.number} «${l.title}»`);
    if (!dry) await signedOutsideCabinet(director as unknown as SessionUser, l.id);
  }
  const created = dry ? 0 : await db.project.count({ where: { leadId: { in: leads.map((l) => l.id) } } });
  console.log(`Заявок: ${leads.length}${dry ? "" : `, проектов создано: ${created}`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
