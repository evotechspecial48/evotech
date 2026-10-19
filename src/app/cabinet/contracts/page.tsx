import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CONTRACT_STATUS } from "@/domain/labels";
import { Card, EmptyState, fmtDate, PageHeader, rub, StatusBadge, Table } from "@/components/ui";

export default async function ContractsPage() {
  const user = await requireUser(["contracts.manage", "contracts.accept"]);
  const contracts = await db.contract.findMany({
    where: user.role === "CUSTOMER" ? { customerId: user.id } : {},
    include: { lead: { select: { number: true } }, project: { select: { number: true } }, quickOrder: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const customers = Object.fromEntries((await db.user.findMany({ where: { id: { in: contracts.map((c) => c.customerId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Договоры" subtitle="Версии, подписание и история подтверждений" />
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
