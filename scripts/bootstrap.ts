// Стартовая настройка боевой базы — без демо-данных: системные настройки, реквизиты, шаблоны документов.
// Безопасно запускать повторно: существующие значения и шаблоны не перезаписываются.
// Запуск: npm run bootstrap (в контейнере: npx tsx scripts/bootstrap.ts)

import type { Prisma, TemplateKind } from "@prisma/client";
import { db } from "../src/lib/db";
import { CONTRACT_TEMPLATE, OFFER_TEMPLATE, QUICK_CONTRACT_TEMPLATE } from "../prisma/templates";

const SETTINGS: Record<string, Prisma.InputJsonValue> = {
  "timer.defaultMode": "WORKING",
  "files.maxSizeMb": 500,
  "calendar.holidays": ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-02-23", "2026-03-09", "2026-05-01", "2026-05-11", "2026-06-12", "2026-11-04", "2026-12-31"],
  "company.requisites": { name: "ООО «ЭвоТехнолоджи»", inn: "уточняется", city: "Липецк", address: "г. Липецк", bank: "", phone: "+7 919 185-69-63", email: "info@evotechnology.su" },
};

const TEMPLATES: { kind: TemplateKind; name: string; body: string }[] = [
  { kind: "CONTRACT", name: "Договор на проектные работы", body: CONTRACT_TEMPLATE },
  { kind: "QUICK_CONTRACT", name: "Договор-оферта быстрого заказа", body: QUICK_CONTRACT_TEMPLATE },
  { kind: "OFFER", name: "Коммерческое предложение", body: OFFER_TEMPLATE },
];

async function main() {
  const created: string[] = [];
  for (const [key, value] of Object.entries(SETTINGS)) {
    const exists = await db.setting.findUnique({ where: { key } });
    if (!exists) {
      await db.setting.create({ data: { key, value } });
      created.push(`настройка ${key}`);
    }
  }
  for (const t of TEMPLATES) {
    if (!(await db.documentTemplate.count({ where: { kind: t.kind } }))) {
      await db.documentTemplate.create({ data: t });
      created.push(`шаблон ${t.name}`);
    }
  }
  console.log(created.length ? `Создано: ${created.join(", ")}` : "Всё уже настроено");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
