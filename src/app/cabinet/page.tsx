import Link from "next/link";
import { requireUser, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LEAD_STATUS, QUICK_ORDER_STATUS, STAGE_STATUS } from "@/domain/labels";
import { projectProgress, type StageCodeT, type StageStatusT } from "@/domain/stage";
import { ROLE_LABELS } from "@/domain/rbac";
import { projectScope } from "@/services/scope";
import { getAnalytics } from "@/services/analytics";
import { TimerSummary } from "@/components/cabinet/timer-card";
import { Alert, Card, EmptyState, fmtDate, LinkButton, PageHeader, Progress, Stat, StatusBadge } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; forbidden?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title={`Здравствуйте, ${user.name.split(" ")[0]}!`} subtitle={ROLE_LABELS[user.role]} />
      {sp.forbidden && (
        <div className="mb-5">
          <Alert tone="warning">Раздел недоступен для вашей роли.</Alert>
        </div>
      )}
      {sp.welcome && (
        <div className="mb-5">
          <Alert tone="success" title="Кабинет создан">
            Мы отправили письмо для подтверждения почты. Оставьте заявку на проектирование или оформите быстрый заказ.
          </Alert>
        </div>
      )}
      {user.role === "CUSTOMER" ? <CustomerDash user={user} /> : user.role === "SALES_MANAGER" ? <SalesDash user={user} /> : user.role === "DESIGNER" ? <DesignerDash user={user} /> : <ManagerDash user={user} />}
    </>
  );
}

async function ProjectsCard({ user, title }: { user: SessionUser; title: string }) {
  const projects = await db.project.findMany({
    where: { ...projectScope(user), status: { in: ["ACTIVE", "ON_HOLD"] } },
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return (
    <Card title={title} actions={<LinkButton href="/cabinet/projects" variant="ghost" size="sm">Все проекты →</LinkButton>}>
      {projects.length === 0 ? (
        <EmptyState title="Активных проектов нет" />
      ) : (
        <ul className="divide-y divide-line">
          {projects.map((p) => {
            const current = p.stages.find((s) => s.status !== "completed" && s.status !== "not_started") ?? p.stages.find((s) => s.status === "not_started");
            return (
              <li key={p.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[1.4fr_1fr_1fr] md:items-center">
                <div className="min-w-0">
                  <Link href={`/cabinet/projects/${p.id}`} className="font-medium hover:text-accent-700">
                    №{p.number} · {p.title}
                  </Link>
                  {current && (
                    <p className="mt-0.5 text-xs text-muted">
                      {current.title} — <StatusBadge map={STAGE_STATUS} value={current.status} />
                    </p>
                  )}
                </div>
                <Progress value={projectProgress(p.stages.map((s) => ({ code: s.code as StageCodeT, status: s.status as StageStatusT })))} />
                <TimerSummary projectId={p.id} compact />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

async function CustomerDash({ user }: { user: SessionUser }) {
  const [requests, approvals, contracts, quickOrders, leads] = await Promise.all([
    db.customerRequest.findMany({ where: { status: "OPEN", project: { customerId: user.id } }, include: { project: { select: { id: true, number: true } } } }),
    db.projectStage.findMany({ where: { status: "customer_review", project: { customerId: user.id } }, include: { project: { select: { id: true, number: true, title: true } } } }),
    db.contract.findMany({ where: { customerId: user.id, status: "AWAITING_SIGNATURE" } }),
    db.quickOrder.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.lead.findMany({ where: { customerId: user.id, status: { notIn: ["won", "lost"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const todo = requests.length + approvals.length + contracts.length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/cabinet/leads/new">Новая заявка на проектирование</LinkButton>
        <LinkButton href="/cabinet/quick-orders/new" variant="signal">
          Быстрый заказ
        </LinkButton>
      </div>
      <Card title={`Требуют вашего внимания${todo ? ` · ${todo}` : ""}`}>
        {todo === 0 ? (
          <p className="text-sm text-muted">✓ Сейчас от вас ничего не требуется.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {approvals.map((s) => (
              <li key={s.id}>
                <Link href={`/cabinet/projects/${s.project.id}?tab=stages`} className="text-accent-700 hover:underline">
                  Согласуйте: {s.title.toLowerCase()} (проект №{s.project.number})
                </Link>
              </li>
            ))}
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/cabinet/projects/${r.project.id}?tab=requests`} className="text-accent-700 hover:underline">
                  Ответьте на запрос по проекту №{r.project.number}: «{r.question.slice(0, 80)}…»
                </Link>{" "}
                <span className="text-xs text-warning-700">(таймер на паузе)</span>
              </li>
            ))}
            {contracts.map((c) => (
              <li key={c.id}>
                <Link href={`/cabinet/contracts/${c.id}`} className="text-accent-700 hover:underline">
                  Подпишите договор {c.number}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ProjectsCard user={user} title="Мои проекты" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Мои заявки" actions={<LinkButton href="/cabinet/leads" variant="ghost" size="sm">Все →</LinkButton>}>
          {leads.length === 0 ? (
            <p className="text-sm text-muted">Открытых заявок нет.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/cabinet/leads/${l.id}`} className="hover:text-accent-700">
                    №{l.number} · {l.title}
                  </Link>
                  <StatusBadge map={LEAD_STATUS} value={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Быстрые заказы" actions={<LinkButton href="/cabinet/quick-orders" variant="ghost" size="sm">Все →</LinkButton>}>
          {quickOrders.length === 0 ? (
            <p className="text-sm text-muted">Заказов пока нет.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {quickOrders.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/cabinet/quick-orders/${q.id}`} className="hover:text-accent-700">
                    Заказ №{q.number} от {fmtDate(q.createdAt)}
                  </Link>
                  <StatusBadge map={QUICK_ORDER_STATUS} value={q.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

async function SalesDash({ user }: { user: SessionUser }) {
  const [byStatus, fresh, tasks, awaiting] = await Promise.all([
    db.lead.groupBy({ by: ["status"], _count: true, where: { status: { notIn: ["won", "lost"] } } }),
    db.lead.findMany({ where: { status: "new" }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.task.findMany({ where: { assigneeId: user.id, doneAt: null }, include: { lead: { select: { id: true, number: true } } }, orderBy: { dueAt: "asc" }, take: 8 }),
    db.contract.count({ where: { status: "AWAITING_SIGNATURE" } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Новые заявки" value={count("new")} tone={count("new") ? "warning" : undefined} />
        <Stat label="В работе" value={byStatus.reduce((s, b) => s + b._count, 0) - count("new")} />
        <Stat label="Подготовка ТЗ" value={count("tz_preparation")} />
        <Stat label="Договоры на подписании" value={awaiting} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Новые заявки" actions={<LinkButton href="/cabinet/leads?view=kanban" variant="ghost" size="sm">Воронка →</LinkButton>}>
          {fresh.length === 0 ? (
            <p className="text-sm text-muted">Новых заявок нет.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {fresh.map((l) => (
                <li key={l.id} className="py-2">
                  <Link href={`/cabinet/leads/${l.id}`} className="font-medium hover:text-accent-700">
                    №{l.number} · {l.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {l.contactName} · {fmtDate(l.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Мои задачи">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">Задач нет.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <Link href={t.lead ? `/cabinet/leads/${t.lead.id}` : "#"} className="hover:text-accent-700">
                    {t.title} {t.lead && <span className="text-muted">(заявка №{t.lead.number})</span>}
                  </Link>
                  <span className={t.dueAt && t.dueAt < new Date() ? "text-danger-700" : "text-muted"}>{fmtDate(t.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

async function DesignerDash({ user }: { user: SessionUser }) {
  const stages = await db.projectStage.findMany({
    where: { project: { members: { some: { userId: user.id } }, status: "ACTIVE" }, status: { in: ["in_progress", "internal_review", "changes_requested"] } },
    include: { project: { select: { id: true, number: true, title: true } } },
    orderBy: { status: "asc" },
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Этапы в работе" value={stages.filter((s) => s.status === "in_progress").length} />
        <Stat label="На внутренней проверке" value={stages.filter((s) => s.status === "internal_review").length} />
        <Stat label="Возвращены на доработку" value={stages.filter((s) => s.status === "changes_requested").length} tone={stages.some((s) => s.status === "changes_requested") ? "danger" : undefined} />
      </div>
      <Card title="Мои этапы">
        {stages.length === 0 ? (
          <EmptyState title="Нет этапов в работе" text="Руководитель проекта назначит вас на проект." />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {stages.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/cabinet/projects/${s.project.id}?tab=stages`} className="hover:text-accent-700">
                  №{s.project.number} · {s.project.title} — <span className="text-muted">{s.title}</span>
                </Link>
                <StatusBadge map={STAGE_STATUS} value={s.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ProjectsCard user={user} title="Назначенные проекты" />
    </div>
  );
}

async function ManagerDash({ user }: { user: SessionUser }) {
  const a = await getAnalytics(30);
  const internal = await db.projectStage.count({ where: { status: "internal_review" } });
  const openRequests = await db.customerRequest.count({ where: { status: "OPEN" } });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Новые заявки (30 дн.)" value={a.newLeads} />
        <Stat label="Конверсия в договор" value={`${a.conversion}%`} />
        <Stat label="Проекты с риском срока" value={a.atRisk.length} tone={a.atRisk.length ? "danger" : undefined} />
        <Stat label="Оплачено" value={`${a.paidTotal.toLocaleString("ru-RU")} ₽`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Риск просрочки">
          {a.atRisk.length === 0 ? (
            <p className="text-sm text-muted">✓ Все проекты в графике.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {a.atRisk.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <Link href={`/cabinet/projects/${p.id}`} className="hover:text-accent-700">
                    №{p.number} · {p.title}
                  </Link>
                  <span className={p.remainingDays < 0 ? "text-danger-700" : "text-warning-700"}>{p.remainingDays.toFixed(1)} дн.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Очереди">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <Link href="/cabinet/approvals" className="text-accent-700">
                Версии на внутренней проверке
              </Link>
              <span className="font-mono">{internal}</span>
            </li>
            <li className="flex justify-between">
              <Link href="/cabinet/requests" className="text-accent-700">
                Открытые запросы заказчикам
              </Link>
              <span className="font-mono">{openRequests}</span>
            </li>
            <li className="flex justify-between">
              <span>Возвраты на доработку (30 дн.)</span>
              <span className="font-mono">{a.returnsCount}</span>
            </li>
          </ul>
        </Card>
      </div>
      <ProjectsCard user={user} title="Активные проекты" />
    </div>
  );
}
