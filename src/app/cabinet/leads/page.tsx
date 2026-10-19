import Link from "next/link";
import type { LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { one, pageParam } from "@/lib/page";
import { can } from "@/domain/rbac";
import { LEAD_FLOW, nextLeadStatus } from "@/domain/lead";
import { LEAD_SOURCE, LEAD_STATUS } from "@/domain/labels";
import { leadScope } from "@/services/scope";
import { ActionForm, SubmitButton } from "@/components/client";
import { leadStatusAction } from "@/app/actions/cabinet";
import { btnClass, Card, EmptyState, fieldClass, fmtDate, LinkButton, PageHeader, StatusBadge, Table } from "@/components/ui";

const PAGE = 20;
const SORTS: Record<string, Prisma.LeadOrderByWithRelationInput> = {
  new: { createdAt: "desc" },
  old: { createdAt: "asc" },
  number: { number: "desc" },
  updated: { updatedAt: "desc" },
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(["leads.view_all", "leads.view_own"]);
  const sp = await searchParams;
  const view = one(sp.view) === "kanban" && user.role !== "CUSTOMER" ? "kanban" : "list";
  const q = one(sp.q).trim();
  const status = one(sp.status);
  const source = one(sp.source);
  const manager = one(sp.manager);
  const sort = SORTS[one(sp.sort)] ? one(sp.sort) : "new";
  const page = pageParam(sp.page);

  const where: Prisma.LeadWhereInput = {
    AND: [
      leadScope(user),
      status && status in LEAD_STATUS ? { status: status as LeadStatus } : {},
      source && source in LEAD_SOURCE ? { source: source as LeadSource } : {},
      manager === "me" ? { managerId: user.id } : manager === "none" ? { managerId: null } : {},
      q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { contactName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { companyName: { contains: q, mode: "insensitive" } },
              ...(Number.isFinite(Number(q)) ? [{ number: Number(q) }] : []),
            ],
          }
        : {},
    ],
  };
  const canManage = can(user.role, "leads.manage");
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, q, status, source, manager, sort, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `?${p.toString()}`;
  };

  const filters = (
    <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
      <input type="hidden" name="view" value={view} />
      <label className="sr-only" htmlFor="q">
        Поиск
      </label>
      <input id="q" name="q" defaultValue={q} placeholder="Поиск: №, тема, контакт, почта, компания" className={fieldClass} />
      <select name="status" defaultValue={status} className={fieldClass} aria-label="Статус">
        <option value="">Все статусы</option>
        {Object.entries(LEAD_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      <select name="source" defaultValue={source} className={fieldClass} aria-label="Источник">
        <option value="">Все источники</option>
        {Object.entries(LEAD_SOURCE).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {canManage ? (
        <select name="manager" defaultValue={manager} className={fieldClass} aria-label="Ответственный">
          <option value="">Все ответственные</option>
          <option value="me">Мои</option>
          <option value="none">Без ответственного</option>
        </select>
      ) : (
        <span />
      )}
      <select name="sort" defaultValue={sort} className={fieldClass} aria-label="Сортировка">
        <option value="new">Сначала новые</option>
        <option value="old">Сначала старые</option>
        <option value="updated">По обновлению</option>
        <option value="number">По номеру</option>
      </select>
      <button className={btnClass("secondary")}>Применить</button>
    </form>
  );

  const header = (
    <PageHeader
      title={user.role === "CUSTOMER" ? "Мои заявки" : "Заявки"}
      subtitle={user.role === "CUSTOMER" ? "Заявки на проектирование и их статусы" : "Приём заявок и воронка до заключения договора"}
      actions={
        <>
          {user.role !== "CUSTOMER" && (
            <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Вид">
              <Link href={qs({ view: "list", page: "" })} aria-current={view === "list" ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm ${view === "list" ? "bg-steel-900 text-white" : ""}`}>
                Список
              </Link>
              <Link href={qs({ view: "kanban", page: "" })} aria-current={view === "kanban" ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm ${view === "kanban" ? "bg-steel-900 text-white" : ""}`}>
                Канбан
              </Link>
            </div>
          )}
          {can(user.role, "data.export") && (
            <>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- скачивание файла из API, не переход по странице */}
              <a href="/api/export/leads" className={btnClass("secondary", "sm")}>
                Выгрузить CSV
              </a>
            </>
          )}
          <LinkButton href="/cabinet/leads/new" size="sm">
            + Новая заявка
          </LinkButton>
        </>
      }
    />
  );

  if (view === "kanban") {
    const leads = await db.lead.findMany({ where, orderBy: SORTS[sort], take: 300, include: { manager: { select: { name: true } } } });
    const columns = [...LEAD_FLOW, "lost"] as LeadStatus[];
    return (
      <>
        {header}
        {filters}
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-3">
            {columns.map((col) => {
              const items = leads.filter((l) => l.status === col);
              return (
                <section key={col} className="w-72 shrink-0 rounded-xl border border-line bg-steel-50" aria-label={LEAD_STATUS[col].label}>
                  <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                    <StatusBadge map={LEAD_STATUS} value={col} />
                    <span className="font-mono text-xs text-muted">{items.length}</span>
                  </header>
                  <ul className="space-y-2 p-2">
                    {items.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted">Пусто</li>}
                    {items.map((l) => {
                      const next = nextLeadStatus(l.status);
                      return (
                        <li key={l.id} className="rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
                          <Link href={`/cabinet/leads/${l.id}`} className="text-sm font-medium hover:text-accent-700">
                            №{l.number} · {l.title}
                          </Link>
                          <p className="mt-1 text-xs text-muted">
                            {l.contactName}
                            {l.companyName ? `, ${l.companyName}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {LEAD_SOURCE[l.source]} · {fmtDate(l.createdAt)} · {l.manager?.name ?? "без ответственного"}
                          </p>
                          {canManage && next && (
                            <ActionForm action={leadStatusAction} className="mt-2">
                              <input type="hidden" name="leadId" value={l.id} />
                              <input type="hidden" name="status" value={next} />
                              <SubmitButton variant="ghost" size="sm" pendingText="…" className="w-full justify-between">
                                {LEAD_STATUS[next].label} →
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  const [total, leads] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({ where, orderBy: SORTS[sort], skip: (page - 1) * PAGE, take: PAGE, include: { manager: { select: { name: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <>
      {header}
      {filters}
      <Card>
        {leads.length === 0 ? (
          <EmptyState
            title={q || status || source ? "Ничего не найдено" : "Заявок пока нет"}
            text={q || status || source ? "Измените условия поиска или сбросьте фильтры." : "Новые заявки с сайта и из кабинета появятся здесь."}
            action={
              q || status || source ? (
                <Link href="?view=list" className={btnClass("secondary", "sm")}>
                  Сбросить фильтры
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table head={["№", "Тема", "Контакт", "Статус", "Источник", "Ответственный", "Создана"]} caption="Список заявок">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-steel-50">
                <td className="font-mono text-muted">{l.number}</td>
                <td>
                  <Link href={`/cabinet/leads/${l.id}`} className="font-medium hover:text-accent-700">
                    {l.title}
                  </Link>
                </td>
                <td>
                  {l.contactName}
                  {l.companyName && <span className="block text-xs text-muted">{l.companyName}</span>}
                </td>
                <td>
                  <StatusBadge map={LEAD_STATUS} value={l.status} />
                </td>
                <td className="text-muted">{LEAD_SOURCE[l.source]}</td>
                <td>{l.manager?.name ?? <span className="text-muted">—</span>}</td>
                <td className="text-muted">{fmtDate(l.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
        {pages > 1 && (
          <nav aria-label="Страницы" className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">
              Всего: {total} · стр. {page} из {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={qs({ page: String(page - 1) })} className={btnClass("secondary", "sm")}>
                  ← Назад
                </Link>
              )}
              {page < pages && (
                <Link href={qs({ page: String(page + 1) })} className={btnClass("secondary", "sm")}>
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
