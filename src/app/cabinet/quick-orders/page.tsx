import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/domain/rbac";
import { QUICK_ORDER_STATUS, STRUCTURE_TYPE } from "@/domain/labels";
import { quickOrderScope } from "@/services/scope";
import { Card, EmptyState, fmtDate, LinkButton, PageHeader, rub, StatusBadge, Table } from "@/components/ui";

export default async function QuickOrdersPage() {
  const user = await requireUser(["quick_orders.create", "quick_orders.view_all"]);
  const orders = await db.quickOrder.findMany({ where: quickOrderScope(user), include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader
        title="Быстрые заказы"
        subtitle="Автоматизированное проектирование малых конструкций"
        actions={
          can(user.role, "quick_orders.create") && (
            <LinkButton href="/cabinet/quick-orders/new" variant="signal">
              + Новый заказ
            </LinkButton>
          )
        }
      />
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="Заказов пока нет" text="Навес, гараж, терраса или беседка — оформите проект онлайн за несколько минут." action={can(user.role, "quick_orders.create") ? <LinkButton href="/cabinet/quick-orders/new">Оформить заказ</LinkButton> : undefined} />
        ) : (
          <Table head={["№", "Конструкция", ...(user.role === "CUSTOMER" ? [] : ["Заказчик"]), "Стоимость", "Статус", "Создан"]}>
            {orders.map((o) => {
              const p = o.params as { length: number; width: number };
              return (
                <tr key={o.id}>
                  <td className="font-mono text-muted">{o.number}</td>
                  <td>
                    <Link href={`/cabinet/quick-orders/${o.id}`} className="font-medium hover:text-accent-700">
                      {STRUCTURE_TYPE[o.structureType]} {p.length}×{p.width} м
                    </Link>
                  </td>
                  {user.role !== "CUSTOMER" && <td>{o.customer.name}</td>}
                  <td>{rub(o.price)}</td>
                  <td>
                    <StatusBadge map={QUICK_ORDER_STATUS} value={o.status} />
                  </td>
                  <td className="text-muted">{fmtDate(o.createdAt)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
