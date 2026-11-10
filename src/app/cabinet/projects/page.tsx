import { Fragment } from "react";
import Link from "next/link";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { one, pageParam } from "@/lib/page";
import { can } from "@/domain/rbac";
import { PROJECT_STATUS } from "@/domain/labels";
import { isMonthKey, monthKey, monthLabel, projectMonthDate } from "@/domain/months";
import { projectProgress, type StageCodeT, type StageStatusT } from "@/domain/stage";
import { projectScope } from "@/services/scope";
import { TimerSummary } from "@/components/cabinet/timer-card";
import { btnClass, Card, EmptyState, fieldClass, PageHeader, Progress, rub, StatusBadge, Table } from "@/components/ui";

const PAGE = 15;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(["projects.view_all", "projects.view_assigned", "projects.view_own"]);
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = one(sp.status);
  const month = isMonthKey(one(sp.month)) ? one(sp.month) : "";
  const sort = one(sp.sort) === "updated" ? "updated" : "month";
  const page = pageParam(sp.page);
  const where: Prisma.ProjectWhereInput = {
    AND: [
      projectScope(user),
      status && status in PROJECT_STATUS ? { status: status as ProjectStatus } : {},
      q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, ...(Number.isFinite(Number(q)) ? [{ number: Number(q) }] : []), { customer: { name: { contains: q, mode: "insensitive" } } }] } : {},
    ],
  };
  // Месяц проекта — по дате подписания договора (иначе по созданию проекта), поэтому сортировка и фильтр — в памяти
  const all = (
    await db.project.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        manager: { select: { name: true } },
        stages: { select: { code: true, status: true } },
        contracts: { where: { status: { not: "CANCELLED" } }, select: { signedAt: true, amount: true } },
      },
      orderBy: { updatedAt: "desc" },
    })
  ).map((p) => ({ ...p, month: monthKey(projectMonthDate(p)), monthAt: projectMonthDate(p), amount: p.contracts.reduce((s, c) => s + c.amount, 0) }));
  const months = [...new Set(all.map((p) => p.month))].sort().reverse();
  const filtered = month ? all.filter((p) => p.month === month) : all;
  if (sort === "month") filtered.sort((a, b) => b.monthAt.getTime() - a.monthAt.getTime() || b.number - a.number);
  const total = filtered.length;
  const projects = filtered.slice((page - 1) * PAGE, page * PAGE);
  const monthTotals = new Map<string, { count: number; amount: number }>();
  for (const p of filtered) {
    const t = monthTotals.get(p.month) ?? { count: 0, amount: 0 };
    monthTotals.set(p.month, { count: t.count + 1, amount: t.amount + p.amount });
  }
  const showAmounts = user.role !== "DESIGNER";
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `?q=${encodeURIComponent(q)}&status=${status}&month=${month}&sort=${sort}&page=${p}`;
  return (
    <>
      <PageHeader
        title="Проекты"
        subtitle={user.role === "DESIGNER" ? "Проекты, на которые вы назначены" : user.role === "CUSTOMER" ? "Ваши проекты" : "Все проекты компании"}
        actions={
          <>
            {can(user.role, "projects.create") && (
              <Link href="/cabinet/projects/new" className={btnClass("primary", "sm")}>
                Новый заказчик и проект
              </Link>
            )}
            {can(user.role, "data.export") && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- скачивание файла из API, не переход по странице
              <a href="/api/export/projects" className={btnClass("secondary", "sm")}>
                Выгрузить CSV
              </a>
            )}
          </>
        }
      />
      <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Поиск: №, название, заказчик" className={fieldClass} aria-label="Поиск" />
        <select name="status" defaultValue={status} className={fieldClass} aria-label="Статус">
          <option value="">Все статусы</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select name="month" defaultValue={month} className={fieldClass} aria-label="Месяц">
          <option value="">Все месяцы</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className={fieldClass} aria-label="Сортировка">
          <option value="month">По месяцам (новые сверху)</option>
          <option value="updated">По последним изменениям</option>
        </select>
        <button className={btnClass("secondary")}>Найти</button>
      </form>
      <Card>
        {projects.length === 0 ? (
          <EmptyState title="Проектов нет" text={user.role === "CUSTOMER" ? "Проект появится после подписания договора по заявке." : "Измените фильтры поиска."} />
        ) : (
          <Table head={["№", "Проект", "Заказчик", "Руководитель", "Готовность", "Срок", "Статус"]}>
            {projects.map((p, i) => (
              <Fragment key={p.id}>
                {sort === "month" && p.month !== projects[i - 1]?.month && (
                  <tr className="bg-steel-50">
                    <td colSpan={7} className="py-2 text-sm font-semibold text-ink">
                      {monthLabel(p.month)}
                      <span className="ml-2 font-normal text-muted">
                        · проектов: {monthTotals.get(p.month)?.count}
                        {showAmounts && ` · по договорам ${rub(monthTotals.get(p.month)?.amount ?? 0)}`}
                      </span>
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="font-mono text-muted">{p.number}</td>
                  <td>
                    <Link href={`/cabinet/projects/${p.id}`} className="font-medium hover:text-accent-700">
                      {p.title}
                    </Link>
                  </td>
                  <td>{p.customer.name}</td>
                  <td>{p.manager?.name ?? "—"}</td>
                  <td className="w-40">
                    <Progress value={projectProgress(p.stages.map((s) => ({ code: s.code as StageCodeT, status: s.status as StageStatusT })))} />
                  </td>
                  <td>
                    <TimerSummary projectId={p.id} compact />
                  </td>
                  <td>
                    <StatusBadge map={PROJECT_STATUS} value={p.status} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </Table>
        )}
        {pages > 1 && (
          <nav aria-label="Страницы" className="mt-4 flex justify-between text-sm">
            <span className="text-muted">
              Стр. {page} из {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link className={btnClass("secondary", "sm")} href={qs(page - 1)}>
                  ← Назад
                </Link>
              )}
              {page < pages && (
                <Link className={btnClass("secondary", "sm")} href={qs(page + 1)}>
                  Вперёд →
                </Link>
              )}
            </div>
          </nav>
        )}
      </Card>
    </>
  );
}
