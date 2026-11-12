import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CONTRACT_STATUS } from "@/domain/labels";
import { Card, EmptyState, fmtDate, PageHeader, rub, StatusBadge, Table } from "@/components/ui";

const KINDS = [
  ["", "Все"],
  ["main", "Договоры"],
  ["spec", "Спецификации"],
] as const;

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireUser(["contracts.manage", "contracts.accept"]);
  const { kind = "" } = await searchParams;
  const contracts = await db.contract.findMany({
    where: { ...(user.role === "CUSTOMER" ? { customerId: user.id } : {}), ...(kind === "main" ? { parentId: null } : kind === "spec" ? { parentId: { not: null } } : {}) },
    include: { lead: { select: { number: true } }, project: { select: { number: true } }, quickOrder: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const customers = Object.fromEntries((await db.user.findMany({ where: { id: { in: contracts.map((c) => c.customerId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Договоры" subtitle="Версии, подписание и история подтверждений" />
      <nav className="mb-4 flex gap-2 text-sm" aria-label="Тип документа">
        {KINDS.map(([k, l]) => (
          <Link key={k} href={k ? `/cabinet/contracts?kind=${k}` : "/cabinet/contracts"} className={`rounded-full border px-3 py-1 ${kind === k ? "border-accent-600 bg-accent-50 text-accent-800" : "border-line text-muted hover:text-ink"}`}>
            {l}
          </Link>
        ))}
      </nav>
      <Card>
        {contracts.length === 0 ? (
          <EmptyState title="Договоров нет" />
        ) : (
          <Table head={["Номер", "Основание", "Заказчик", "Сумма", "Статус", "Редакция", "Подписан"]}>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/cabinet/contracts/${c.id}`} className="font-medium hover:text-accent-700">
                    {c.number}
                  </Link>
                </td>
                <td className="text-muted">{c.project ? `Проект №${c.project.number}` : c.quickOrder ? `Быстрый заказ №${c.quickOrder.number}` : c.lead ? `Заявка №${c.lead.number}` : "—"}</td>
                <td>{customers[c.customerId]}</td>
                <td>{rub(c.amount)}</td>
                <td>
                  <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                </td>
                <td className="font-mono">{c.currentVersion}</td>
                <td className="text-muted">{fmtDate(c.signedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
