import type { Payment } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { paymentQrDataUrl } from "@/lib/invoice-pdf";
import { tbankBusiness } from "@/lib/payments/tbank-business";
import { PAYMENT_STATUS } from "@/domain/labels";
import { canIssueInvoices } from "@/services/invoices";
import { companyRequisites } from "@/services/contracts";
import { cancelInvoiceAction, issueInvoiceAction, markPaidAction } from "@/app/actions/cabinet";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, btnClass, Card, fieldClass, fmtDate, rub, StatusBadge } from "@/components/ui";

const KIND: Record<string, string> = { prepay: "Предоплата 50%", final: "Окончательный расчёт", custom: "Оплата", quick_order: "Быстрый заказ" };

/** Счета и QR СБП по договору: выставление (сотрудники), оплата (заказчик), статусы. */
export async function ContractPayments({ user, contract, payments }: { user: SessionUser; contract: { id: string; amount: number; status: string; quickOrderId: string | null }; payments: Payment[] }) {
  const staff = canIssueInvoices(user);
  const bankConnected = tbankBusiness().name === "tbank-business";
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0) / 100;
  const r = await companyRequisites();
  const shown = payments.filter((p) => staff || p.status !== "failed").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const qr = Object.fromEntries(
    await Promise.all(
      shown
        .filter((p) => p.status === "pending" && p.provider === "tbank-invoice")
        .map(async (p) => [p.id, await paymentQrDataUrl(r, p.amount / 100, p.description)] as const),
    ),
  );

  return (
    <Card title="Счета и оплата">
      <p className="mb-3 text-sm">
        Оплачено {rub(paid)} из {rub(contract.amount)}
        {paid >= contract.amount && contract.amount > 0 && <span className="ml-2 font-medium text-success-700">✓ договор оплачен полностью</span>}
      </p>
      {shown.length === 0 && <p className="text-sm text-muted">{staff ? "Счетов пока нет." : "Счёт ещё не выставлен — менеджер выставит его по вашей просьбе."}</p>}
      <ul className="space-y-4">
        {shown.map((p) => (
          <li key={p.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {p.provider === "tbank-sbp" ? "QR СБП" : `Счёт № ${p.number}`} · {KIND[p.kind ?? ""] ?? "Оплата"} · {rub(p.amount / 100)}
              </span>
              <StatusBadge map={PAYMENT_STATUS} value={p.status} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {fmtDate(p.createdAt)}
              {p.status === "pending" && p.expiresAt && ` · ${p.provider === "tbank-sbp" ? "ссылка действует" : "оплатить"} до ${fmtDate(p.expiresAt)}`}
              {p.paidAt && ` · оплачено ${fmtDate(p.paidAt)}`}
              {staff && p.errorMessage && ` · ${p.errorMessage}`}
            </p>
            {p.status === "pending" && (
              <div className="mt-3 flex flex-wrap items-start gap-4">
                {(p.qrImage || qr[p.id]) && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL QR-кода, оптимизация next/image не нужна
                  <img src={p.qrImage ?? qr[p.id]!} alt="QR-код для оплаты" width={148} height={148} className="rounded border border-line bg-white p-1" />
                )}
                <div className="space-y-2 text-sm">
                  {p.provider === "tbank-sbp" ? (
                    <p className="text-muted">Отсканируйте QR-код камерой телефона или откройте ссылку — оплата через СБП из приложения вашего банка.</p>
                  ) : (
                    <p className="text-muted">Оплатите по реквизитам счёта или отсканируйте QR-код в приложении банка — сумма и назначение подставятся автоматически.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {p.fileId && (
                      <a href={`/api/files/${p.fileId}/link`} target="_blank" rel="noopener" className={btnClass("secondary", "sm")}>
                        Счёт PDF
                      </a>
                    )}
                    {p.paymentUrl && (
                      <a href={p.paymentUrl} target="_blank" rel="noopener" className={btnClass("primary", "sm")}>
                        {p.provider === "tbank-sbp" ? "Оплатить по СБП" : "Оплатить в Т-Бизнесе"}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
            {staff && p.status === "pending" && (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <ActionForm action={markPaidAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <input name="comment" required minLength={3} placeholder="№ платёжки / дата поступления" className={`${fieldClass} sm:max-w-56`} aria-label="Основание отметки оплаты" />
                  <SubmitButton size="sm" variant="secondary">
                    Отметить оплату
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={cancelInvoiceAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <ConfirmSubmit title="Отменить счёт?" text="Счёт пропадёт у заказчика из списка к оплате. Если он уже оплачен в банке — отметьте оплату, а не отменяйте.">
                    Отменить
                  </ConfirmSubmit>
                </ActionForm>
              </div>
            )}
          </li>
        ))}
      </ul>

      {staff && !contract.quickOrderId && contract.status !== "CANCELLED" && paid < contract.amount && (
        <ActionForm action={issueInvoiceAction} className="mt-4 space-y-3 border-t border-line pt-4">
          <input type="hidden" name="contractId" value={contract.id} />
          <p className="text-sm font-medium">Выставить счёт</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select name="kind" defaultValue={paid > 0 ? "final" : "prepay"} className={fieldClass} aria-label="Назначение">
              <option value="prepay">Предоплата 50% — {rub(Math.round(contract.amount / 2))}</option>
              <option value="final">Окончательный расчёт — {rub(Math.max(0, contract.amount - paid))}</option>
              <option value="custom">Произвольная сумма</option>
            </select>
            <select name="method" defaultValue="invoice" className={fieldClass} aria-label="Способ оплаты">
              <option value="invoice">Счёт на оплату (PDF + QR по реквизитам)</option>
              <option value="sbp" disabled={!bankConnected}>
                QR-ссылка СБП{bankConnected ? "" : " — нужен Т-Бизнес"}
              </option>
            </select>
            <input name="amount" type="number" min={1} step="0.01" placeholder="Сумма для «произвольной», ₽" className={fieldClass} aria-label="Произвольная сумма" />
          </div>
          {!bankConnected && (
            <Alert tone="info">
              Т-Бизнес не подключён: счёт формируется по реквизитам ИП, оплату отмечаете вручную после поступления на расчётный счёт. После подключения токена T-API счёт выставляется в банке, приходит
              заказчику на почту, а оплата отмечается автоматически.
            </Alert>
          )}
          <SubmitButton size="sm">Выставить</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
