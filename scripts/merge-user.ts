// Объединение самостоятельной регистрации с записью из таблицы учёта — то же, что «Пользователи → Объединить учётные записи».
// Запуск: npx tsx scripts/merge-user.ts <почта основной записи> <почта дубля> ["ФИО полностью"]
import { db } from "../src/lib/db";
import type { SessionUser } from "../src/lib/auth";
import { mergeAccounts } from "../src/services/users";

async function main() {
  const [keepEmail, dupEmail, fullName] = process.argv.slice(2);
  if (!keepEmail || !dupEmail) throw new Error("Укажите почту основной записи и почту дубля");
  const director = await db.user.findFirstOrThrow({ where: { role: "DIRECTOR", status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  const [keep, dup] = await Promise.all([db.user.findUniqueOrThrow({ where: { email: keepEmail } }), db.user.findUniqueOrThrow({ where: { email: dupEmail } })]);
  console.log(`Основная: ${keep.name} · ${keep.role} · ${keep.email}; дубль: ${dup.name} · ${dup.role} · ${dup.email}`);
  await mergeAccounts(director as SessionUser, keep.id, dup.id);
  if (fullName) await db.user.update({ where: { id: keep.id }, data: { name: fullName } });
  const after = await db.user.findUniqueOrThrow({ where: { id: keep.id }, include: { _count: { select: { memberships: true } } } });
  console.log(`Готово: ${after.name} · ${after.role} · ${after.status} · ${after.email} · проектов: ${after._count.memberships}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
