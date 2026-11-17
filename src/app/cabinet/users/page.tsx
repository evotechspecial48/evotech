import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, ROLES } from "@/domain/rbac";
import { inviteUserAction } from "@/app/actions/cabinet";
import { isPlaceholderEmail } from "@/services/users";
import { ActionForm, FieldError, SubmitButton } from "@/components/client";
import { Badge, btnClass, Card, fieldClass, fmtDateTime, PageHeader, Table } from "@/components/ui";

// Список — только строки со ссылкой на карточку пользователя: формы правки на каждую из сотен строк
// делали страницу тяжёлой (мегабайты), браузер подвисал, а нажатия до загрузки скриптов уходили мимо.
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }) {
  await requireUser("users.manage");
  const { role = "", q = "" } = await searchParams;
  const roleFilter = (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
  const query = q.trim();
  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
  };
  const [users, counts] = await Promise.all([
    db.user.findMany({ where, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, anonymizedAt: true, company: { select: { name: true } } } }),
    db.user.groupBy({ by: ["role"], _count: true }),
  ]);
  const countOf = (r: string) => counts.find((c) => c.role === r)?._count ?? 0;
  const link = (r: string) => `/cabinet/users?${new URLSearchParams({ ...(r ? { role: r } : {}), ...(query ? { q: query } : {}) })}`;

  return (
    <>
      <PageHeader title="Пользователи и роли" subtitle="Приглашение сотрудников, назначение ролей, блокировка, обезличивание данных" />
      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <Card title={`Пользователи (${users.length})`}>
          <nav className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Роль">
            {["", ...ROLES].map((r) => (
              <Link key={r || "all"} href={link(r)} className={`rounded-full border px-3 py-1 ${(roleFilter ?? "") === r ? "border-accent-600 bg-accent-50 text-accent-800" : "border-line text-muted hover:text-ink"}`}>
                {r ? `${ROLE_LABELS[r as Role]} · ${countOf(r)}` : "Все"}
              </Link>
            ))}
          </nav>
          <form className="mb-4 flex gap-2" role="search">
            {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
            <input name="q" defaultValue={query} placeholder="Поиск: имя или почта" className={fieldClass} aria-label="Поиск пользователя" />
            <button className={btnClass("secondary", "sm")}>Найти</button>
          </form>
          <Table head={["Пользователь", "Роль", "Статус", "Последний вход"]}>
            {users.map((u) => (
              <tr key={u.id} className="align-top hover:bg-steel-50">
                <td>
                  <Link href={`/cabinet/users/${u.id}`} className="font-medium text-accent-700 hover:underline">
                    {u.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {u.email}
                    {u.company ? ` · ${u.company.name}` : ""}
                    {u.status === "INVITED" && isPlaceholderEmail(u.email) && <span className="block text-warning-700">почта из таблицы — укажите настоящую</span>}
                  </span>
                </td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td>
                  {u.status === "ACTIVE" ? <Badge tone="success">Активен</Badge> : u.status === "INVITED" ? <Badge tone="info">Приглашён</Badge> : <Badge tone="danger">Заблокирован</Badge>}
                  {u.anonymizedAt && <span className="block text-xs text-muted">обезличен</span>}
                </td>
                <td className="text-muted">{fmtDateTime(u.lastLoginAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-6">
          <Card title="Пригласить пользователя">
            <p className="mb-3 text-xs text-muted">
              Проектировщик уже есть в списке (из таблицы, почта «…@evotech.local»)? Не создавайте нового: откройте его запись → настоящая почта и ФИО → «Сохранить» → «Отправить приглашение». Проекты и
              оплаты останутся при нём. Зарегистрировался сам и появился дубль — в его основной записи блок «Объединить с дублем».
            </p>
            <ActionForm action={inviteUserAction} resetOnSuccess className="space-y-3">
              <div>
                <label htmlFor="iname" className="mb-1 block text-sm font-medium text-ink-soft">
                  Имя и фамилия
                </label>
                <input id="iname" name="name" className={fieldClass} />
              </div>
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
                  Почта
                </label>
                <input id="email" name="email" type="email" className={fieldClass} />
                <FieldError name="email" />
              </div>
              <div>
                <label htmlFor="role" className="mb-1 block text-sm font-medium text-ink-soft">
                  Роль
                </label>
                <select id="role" name="role" className={fieldClass} defaultValue="DESIGNER">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <input name="position" placeholder="Должность" className={fieldClass} aria-label="Должность" />
              <input name="phone" placeholder="Телефон" className={fieldClass} aria-label="Телефон" />
              <SubmitButton>Отправить приглашение</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">Ссылка для установки пароля действует 7 дней.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
