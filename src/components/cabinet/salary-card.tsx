import type { SessionUser } from "@/lib/auth";
import { monthLabel } from "@/domain/months";
import { getSalary } from "@/services/finance";
import { Card, rub } from "@/components/ui";

const RULE: Record<string, string> = {
  PROJECT_MANAGER: "10% от выручки подписанных договоров месяца, но не менее 50 000 ₽.",
  SALES_MANAGER: "Оклад 30 000 ₽ + 3% от подписанных вами договоров месяца (без договоров-редакций).",
  DESIGNER: "Сумма оплаты по вашим проектам месяца — вносит руководитель проекта или директор в карточке проекта.",
};

/** «Моя зарплата» по месяцам — в аналитике руководителя проектов, менеджера и проектировщика. */
export async function SalaryCard({ user }: { user: SessionUser }) {
  const rows = await getSalary(user, 6);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const current = rows[rows.length - 1];
  return (
    <Card title="Моя зарплата по месяцам" className="mb-6">
      <p className="mb-4 text-sm">
        {monthLabel(current.month)}: <span className="text-lg font-semibold">{rub(current.amount)}</span>
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.month} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="whitespace-nowrap">{monthLabel(r.month)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-steel-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-accent-600" style={{ width: `${(r.amount / max) * 100}%` }} />
            </span>
            <span className="whitespace-nowrap text-right font-mono text-xs">
              {rub(r.amount)} <span className="hidden text-muted sm:inline">· {r.basis}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{RULE[user.role]} Расчёт ориентировочный.</p>
    </Card>
  );
}
