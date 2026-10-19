import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AUDIT_LABELS } from "@/lib/audit";
import { one, pageParam } from "@/lib/page";
import { btnClass, Card, EmptyState, fieldClass, fmtDateTime, PageHeader, Table } from "@/components/ui";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("audit.view");
  const sp = await searchParams;
  const action = one(sp.action);
  const project = one(sp.project);
  const page = pageParam(sp.page);
  const where: Prisma.AuditEventWhereInput = { ...(action ? { action: { startsWith: action } } : {}), ...(project ? { projectId: project } : {}) };
  const [total, events] = await Promise.all([db.auditEvent.count({ where }), db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE })]);
  const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: events.map((e) => e.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const groups = [...new Set(Object.keys(AUDIT_LABELS).map((k) => k.split(".")[0]))];
  return (
    <>
      <PageHeader title="Журнал действий" subtitle="Критичные действия пользователей и системы. Записи не редактируются." />
      <form className="mb-5 flex flex-wrap gap-3" role="search">
        <select name="action" defaultValue={action} className={`${fieldClass} sm:max-w-xs`} aria-label="Тип события">
          <option value="">Все события</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        {project && <input type="hidden" name="project" value={project} />}
        <button className={btnClass("secondary")}>Фильтр</button>
        {(action || project) && (
          <Link href="/cabinet/audit" className={btnClass("ghost")}>
            Сбросить
          </Link>
        )}
      </form>
      <Card>
        {events.length === 0 ? (
          <EmptyState title="Событий нет" />
        ) : (
          <Table head={["Время", "Событие", "Пользователь", "Объект", "IP", "Детали"]}>
            {events.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                <td>{AUDIT_LABELS[e.action] ?? e.action}</td>
                <td>{e.actorId ? names[e.actorId] ?? e.actorId : "система"}</td>
                <td className="text-xs text-muted">
                  {e.entityType}
                  {e.projectId && (
                    <Link href={`/cabinet/projects/${e.projectId}`} className="block text-accent-700">
                      проект
                    </Link>
                  )}
                </td>
                <td className="font-mono text-xs">{e.ip ?? "—"}</td>
                <td className="max-w-xs break-all font-mono text-xs text-muted">{e.meta ? JSON.stringify(e.meta).slice(0, 200) : ""}</td>
              </tr>
            ))}
          </Table>
        )}
        <nav className="mt-4 flex justify-between text-sm" aria-label="Страницы">
          <span className="text-muted">Всего: {total}</span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link className={btnClass("secondary", "sm")} href={`?action=${action}&project=${project}&page=${page - 1}`}>
                ← Назад
              </Link>
            )}
            {page * PAGE < total && (
              <Link className={btnClass("secondary", "sm")} href={`?action=${action}&project=${project}&page=${page + 1}`}>
                Вперёд →
              </Link>
            )}
          </span>
        </nav>
      </Card>
    </>
  );
}
