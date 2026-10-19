import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/page";
import { LEAD_SOURCE, LEAD_STATUS, PAYMENT_STATUS, PROJECT_STATUS, QUICK_ORDER_STATUS } from "@/domain/labels";
import { STAGES } from "@/domain/stage";
import { getAnalytics } from "@/services/analytics";
import { Card, PageHeader, Stat, Table } from "@/components/ui";

function Bars({ rows, labels, unit = "" }: { rows: { key: string; value: number }[]; labels: Record<string, string | { label: string }>; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">Нет данных.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const l = labels[r.key];
        return (
          <li key={r.key} className="grid grid-cols-[minmax(110px,1fr)_2fr_auto] items-center gap-3 text-sm">
            <span className="truncate">{typeof l === "string" ? l : (l?.label ?? r.key)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-steel-100">
              <span className="block h-full rounded-full bg-accent-600" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="font-mono text-xs">
              {r.value.toLocaleString("ru-RU")}
              {unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireUser("analytics.view");
  const period = [7, 30, 90, 365].includes(Number(one((await searchParams).period))) ? Number(one((await searchParams).period)) : 30;
  const a = await getAnalytics(period);
  const stageTitle = Object.fromEntries(STAGES.map((s) => [s.code, s.title]));
  return (
    <>
      <PageHeader
        title="Аналитика"
        subtitle={`Период: ${period} дн.`}
        actions={
          <nav className="flex gap-1" aria-label="Период">
            {[7, 30, 90, 365].map((p) => (
              <Link key={p} href={`?period=${p}`} aria-current={p === period ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm ${p === period ? "bg-steel-900 text-white" : "border border-line-strong"}`}>
                {p} дн.
              </Link>
            ))}
          </nav>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Новые заявки" value={a.newLeads} hint={`за ${period} дн.`} />
        <Stat label="Конверсия в договор" value={`${a.conversion}%`} hint="won / (won + lost)" />
        <Stat label="Возвраты на доработку" value={a.returnsCount} hint={`за ${period} дн.`} />
        <Stat label="Оплачено" value={`${a.paidTotal.toLocaleString("ru-RU")} ₽`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Источники заявок">
          <Bars rows={a.leadsBySource.map((s) => ({ key: s.source, value: s.count }))} labels={LEAD_SOURCE} />
        </Card>
        <Card title="Заявки по статусам">
          <Bars rows={a.leadsByStatus.map((s) => ({ key: s.status, value: s.count }))} labels={LEAD_STATUS} />
        </Card>
        <Card title="Проекты по статусам">
          <Bars rows={a.projectsByStatus.map((s) => ({ key: s.status, value: s.count }))} labels={PROJECT_STATUS} />
        </Card>
        <Card title="Загрузка проектировщиков">
          {a.designerLoad.length === 0 ? (
            <p className="text-sm text-muted">Нет данных.</p>
          ) : (
            <Table head={["Проектировщик", "Активные проекты", "Этапы в работе"]}>
              {a.designerLoad.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  <td className="font-mono">{d.projects}</td>
                  <td className="font-mono">{d.openStages}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Средняя длительность этапов">
          <Bars rows={a.avgStageDays.map((s) => ({ key: s.code, value: s.days }))} labels={stageTitle} unit=" дн." />
        </Card>
        <Card title="Проекты с риском просрочки">
          {a.atRisk.length === 0 ? (
            <p className="text-sm text-muted">✓ Рисков нет.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {a.atRisk.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link href={`/cabinet/projects/${p.id}`} className="text-accent-700">
                    №{p.number} · {p.title}
                  </Link>
                  <span className={p.remainingDays < 0 ? "text-danger-700" : "text-warning-700"}>{p.remainingDays.toFixed(1)} дн.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Платежи по статусам">
          <Table head={["Статус", "Количество", "Сумма"]}>
            {a.payments.map((p) => (
              <tr key={p.status}>
                <td>{PAYMENT_STATUS[p.status]?.label}</td>
                <td className="font-mono">{p.count}</td>
                <td className="font-mono">{p.amount.toLocaleString("ru-RU")} ₽</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Быстрые заказы">
          <Bars rows={a.quickOrders.map((q) => ({ key: q.status, value: q.count }))} labels={QUICK_ORDER_STATUS} />
        </Card>
      </div>
    </>
  );
}
