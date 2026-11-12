// Привязка импортированных из таблицы спецификаций («Д-525 спец2», «Д-466 спец №5», «Д-спец 3 · Заказчик»)
// к основным договорам: проставляет parentId и specNumber. Номера и суммы не меняются, финансы не затрагиваются.
// «Д-спец N · Заказчик» без номера договора — к самому раннему подписанному договору этого заказчика.
// Запуск: npx tsx scripts/link-specs.ts [--apply]   (без --apply — только показать, что будет сделано)

import { db } from "../src/lib/db";

const apply = process.argv.includes("--apply");

/** «Д-525 спец №2» → { base: "Д-525", n: 2 }; «Д-спец 3 · X» → { base: null, n: 3 }. */
export function parseSpec(number: string): { base: string | null; n: number } | null {
  const m = number.match(/^(.*?)\s*спец\s*№?\s*(\d+)/i);
  if (!m) return null;
  const base = m[1].trim();
  return { base: /\d/.test(base) ? base : null, n: Number(m[2]) };
}

async function main() {
  const specs = await db.contract.findMany({ where: { parentId: null, number: { contains: "спец", mode: "insensitive" } }, orderBy: { number: "asc" } });
  const rows: Record<string, string>[] = [];
  for (const s of specs) {
    const p = parseSpec(s.number);
    if (!p) continue;
    const parent = p.base
      ? await db.contract.findFirst({ where: { number: p.base, parentId: null } })
      : await db.contract.findFirst({ where: { customerId: s.customerId, status: "SIGNED", parentId: null, quickOrderId: null, NOT: { number: { contains: "спец", mode: "insensitive" } } }, orderBy: { signedAt: "asc" } });
    rows.push({ спецификация: s.number, договор: parent?.number ?? "— не найден, пропуск", N: String(p.n), заказчик: parent && parent.customerId !== s.customerId ? "другой в таблице" : "" });
    if (parent && apply) await db.contract.update({ where: { id: s.id }, data: { parentId: parent.id, specNumber: p.n } });
  }
  console.table(rows);
  console.log(apply ? `Привязано: ${rows.filter((r) => !r.договор.startsWith("—")).length}` : "Пробный прогон — для записи добавьте --apply");
}

if (process.argv[1]?.includes("link-specs")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
