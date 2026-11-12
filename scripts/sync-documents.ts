// Обновление реквизитов исполнителя и шаблонов документов в рабочей базе из prisma/company.ts и prisma/templates.ts.
// Шаблон с изменённым текстом сохраняется новой версией, прежняя остаётся в истории (неактивной).
// Подписанные договоры не меняются — у них свой текст и контрольная сумма.
// Запуск: npx tsx scripts/sync-documents.ts [--dry]

import type { Prisma, TemplateKind } from "@prisma/client";
import { db } from "../src/lib/db";
import { COMPANY_REQUISITES } from "../prisma/company";
import { CONTRACT_TEMPLATE, OFFER_TEMPLATE, QUICK_CONTRACT_TEMPLATE, SPECIFICATION_TEMPLATE, ACT_TEMPLATE } from "../prisma/templates";

const dry = process.argv.includes("--dry");
const TEMPLATES: { kind: TemplateKind; name: string; body: string }[] = [
  { kind: "CONTRACT", name: "Договор подряда (бланк компании)", body: CONTRACT_TEMPLATE },
  { kind: "QUICK_CONTRACT", name: "Договор-оферта быстрого заказа", body: QUICK_CONTRACT_TEMPLATE },
  { kind: "OFFER", name: "Коммерческое предложение (условия по бланку)", body: OFFER_TEMPLATE },
  { kind: "SPECIFICATION", name: "Спецификация к договору подряда", body: SPECIFICATION_TEMPLATE },
  { kind: "ACT", name: "Акт выполненных работ", body: ACT_TEMPLATE },
];

async function main() {
  const current = (await db.setting.findUnique({ where: { key: "company.requisites" } }))?.value as Record<string, string> | undefined;
  const requisites = { ...(current ?? {}), ...COMPANY_REQUISITES };
  console.log(`Реквизиты: ${requisites.shortName}, ИНН ${requisites.inn}, р/с ${requisites.account}`);
  if (!dry) await db.setting.upsert({ where: { key: "company.requisites" }, create: { key: "company.requisites", value: requisites as Prisma.InputJsonValue }, update: { value: requisites as Prisma.InputJsonValue } });

  for (const t of TEMPLATES) {
    const active = await db.documentTemplate.findFirst({ where: { kind: t.kind, active: true }, orderBy: { version: "desc" } });
    if (active?.body === t.body) {
      console.log(`${t.kind}: без изменений (версия ${active.version})`);
      continue;
    }
    const last = await db.documentTemplate.findFirst({ where: { kind: t.kind }, orderBy: { version: "desc" } });
    const version = (last?.version ?? 0) + 1;
    console.log(`${t.kind}: новая версия ${version}`);
    if (!dry) {
      await db.$transaction([db.documentTemplate.updateMany({ where: { kind: t.kind }, data: { active: false } }), db.documentTemplate.create({ data: { ...t, version, active: true } })]);
    }
  }
  if (dry) console.log("Проверка без изменений (--dry)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
