import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PAYMENT_STATUS } from "@/domain/labels";
import { refundAction } from "@/app/actions/cabinet";
import { ActionForm, ConfirmSubmit } from "@/components/client";
import { Card, EmptyState, fmtDateTime, PageHeader, rub, StatusBadge, Table } from "@/components/ui";

export default async function PaymentsPage() {
  const user = await requireUser(["payments.view_all", "payments.pay"]);
  const payments = await db.payment.findMany({
    where: user.role === "CUSTOMER" ? { payerId: user.id } : {},
    include: { quickOrder: { select: { id: true, number: true } }, events: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Платежи" subtitle="Т-Банк Эквайринг. Данные банковских карт не хранятся — только идентификатор и статус платежа." />
      <Card>
        {payments.length === 0 ? (
          <EmptyState title="Платежей пока нет" />
        ) : (
          <Table head={["Дата", "Назначение", "Сумма", "Статус", "ID банка", "Режим", ""]}>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{fmtDateTime(p.createdAt)}</td>
                <td>
                  {p.quickOrder ? (
                    <Link href={`/cabinet/quick-orders/${p.quickOrder.id}`} className="hover:text-accent-700">
                      {p.description}
                    </Link>
                  ) : (
                    p.description
                  )}
                  {p.errorMessage && <span className="block text-xs text-danger-700">{p.errorMessage}</span>}
                </td>
                <td>{rub(p.amount / 100)}</td>
                <td>
                  <StatusBadge map={PAYMENT_STATUS} value={p.status} />
                </td>
                <td className="font-mono text-xs">{p.providerPaymentId ?? "—"}</td>
                <td className="text-xs text-muted">{p.testMode ? "тестовый" : "боевой"}</td>
                <td>
                  {user.role === "DIRECTOR" && p.status === "paid" && (
                    <ActionForm action={refundAction}>
                      <input type="hidden" name="paymentId" value={p.id} />
                      <ConfirmSubmit title="Оформить возврат?" text="Запрос на возврат будет отправлен в банк.">
                        Возврат
                      </ConfirmSubmit>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
