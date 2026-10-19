import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mockBankAction } from "@/app/actions/cabinet";
import { btnClass } from "@/components/ui";

export const metadata = { title: "Демо-оплата", robots: { index: false } };

/**
 * Демонстрационная платёжная форма (PAYMENT_PROVIDER=mock). Имитирует страницу банка:
 * реквизиты карты не вводятся и не хранятся; уведомление формируется и подписывается как у Т-Банка.
 */
export default async function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const payment = await db.payment.findUnique({ where: { orderId: decodeURIComponent(orderId) } });
  if (!payment || payment.payerId !== user.id) notFound();
  return (
    <div className="grid min-h-screen place-items-center bg-[#f2f2f2] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="rounded bg-[#ffdd2d] px-2 py-1 text-sm font-bold text-black">Т-Банк</span>
          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-700">тестовый режим</span>
        </div>
        <p className="mt-5 text-sm text-muted">{payment.description}</p>
        <p className="mt-1 text-3xl font-semibold">{(payment.amount / 100).toLocaleString("ru-RU")} ₽</p>
        <p className="mt-1 font-mono text-xs text-muted">Заказ {payment.orderId}</p>
        {payment.status !== "pending" ? (
          <p className="mt-6 text-sm">Платёж уже обработан: {payment.status}.</p>
        ) : (
          <form action={mockBankAction} className="mt-6 space-y-2">
            <input type="hidden" name="orderId" value={payment.orderId} />
            <p className="rounded-lg bg-steel-50 p-3 text-xs text-muted">Демо-страница банка: данные карты не запрашиваются. Выберите результат оплаты.</p>
            <button name="outcome" value="success" className={`${btnClass("primary", "lg")} w-full`}>
              Оплатить успешно
            </button>
            <button name="outcome" value="fail" className={`${btnClass("secondary", "lg")} w-full`}>
              Отклонить платёж
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
