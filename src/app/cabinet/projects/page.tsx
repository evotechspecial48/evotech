import Link from "next/link";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { one, pageParam } from "@/lib/page";
import { can } from "@/domain/rbac";
import { PROJECT_STATUS } from "@/domain/labels";
import { projectProgress, type StageCodeT, type StageStatusT } from "@/domain/stage";
import { projectScope } from "@/services/scope";
import { TimerSummary } from "@/components/cabinet/timer-card";
import { btnClass, Card, EmptyState, fieldClass, PageHeader, Progress, StatusBadge, Table } from "@/components/ui";

const PAGE = 15;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(["projects.view_all", "projects.view_assigned", "projects.view_own"]);
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = one(sp.status);
  const page = pageParam(sp.page);
  const where: Prisma.ProjectWhereInput = {
    AND: [
      projectScope(user),
      status && status in PROJECT_STATUS ? { status: status as ProjectStatus } : {},
      q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, ...(Number.isFinite(Number(q)) ? [{ number: Number(q) }] : []), { customer: { name: { contains: q, mode: "insensitive" } } }] } : {},
    ],
  };
  const [total, projects] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      include: { customer: { select: { name: true } }, manager: { select: { name: true } }, stages: { select: { code: true, status: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <>
      <PageHeader
        title="Проекты"
        subtitle={user.role === "DESIGNER" ? "Проекты, на которые вы назначены" : user.role === "CUSTOMER" ? "Ваши проекты" : "Все проекты компании"}
        actions={
          can(user.role, "data.export") && (
            <>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- скачивание файла из API, не переход по странице */}
              <a href="/api/export/projects" className={btnClass("secondary", "sm")}>
                Выгрузить CSV
              </a>
            </>
          )
        }
      />
      <form className="mb-5 grid gap-3 sm:grid-cols-[2fr_1fr_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Поиск: №, название, заказчик" className={fieldClass} aria-label="Поиск" />
        <select name="status" defaultValue={status} className={fieldClass} aria-label="Статус">
          <option value="">Все статусы</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className={btnClass("secondary")}>Найти</button>
      </form>
      <Card>
        {projects.length === 0 ? (
          <EmptyState title="Проектов нет" text={user.role === "CUSTOMER" ? "Проект появится после подписания договора по заявке." : "Измените фильтры поиска."} />
        ) : (
          <Table head={["№", "Проект", "Заказчик", "Руководитель", "Готовность", "Срок", "Статус"]}>
            {projects.map((p) => (
              <tr key={p.id}>
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
                <Link className={btnClass("secondary", "sm")} href={`?q=${encodeURIComponent(q)}&status=${status}&page=${page - 1}`}>
                  ← Назад
                </Link>
              )}
              {page < pages && (
                <Link className={btnClass("secondary", "sm")} href={`?q=${encodeURIComponent(q)}&status=${status}&page=${page + 1}`}>
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
