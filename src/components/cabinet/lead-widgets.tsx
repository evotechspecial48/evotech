"use client";

import { useActionState, useState } from "react";
import { createContractAction, createOfferAction, previewContractAction } from "@/app/actions/cabinet";
import { ActionForm, SubmitButton } from "../client";
import { btnClass, fieldClass } from "../ui";

interface Row {
  title: string;
  qty: number;
  unit: string;
  price: number;
}

/** Конструктор коммерческого предложения: позиции, итог, срок, срок действия. */
export function OfferBuilder({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<Row[]>([
    { title: "Разработка КМ", qty: 1, unit: "компл.", price: 0 },
    { title: "Разработка КМД", qty: 1, unit: "компл.", price: 0 },
  ]);
  const total = rows.reduce((s, r) => s + (r.qty || 0) * (r.price || 0), 0);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <ActionForm action={createOfferAction} className="space-y-3" successMessage="КП сформировано">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 font-medium">Позиция</th>
              <th className="w-20 pb-1 font-medium">Кол-во</th>
              <th className="w-24 pb-1 font-medium">Ед.</th>
              <th className="w-32 pb-1 font-medium">Цена, ₽</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="pr-2 pb-2">
                  <input name="itemTitle" aria-label="Позиция" value={r.title} onChange={(e) => set(i, { title: e.target.value })} className={fieldClass} />
                </td>
                <td className="pr-2 pb-2">
                  <input name="itemQty" aria-label="Количество" type="number" min={1} value={r.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} className={fieldClass} />
                </td>
                <td className="pr-2 pb-2">
                  <input name="itemUnit" aria-label="Единица" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} className={fieldClass} />
                </td>
                <td className="pr-2 pb-2">
                  <input name="itemPrice" aria-label="Цена" type="number" min={0} step={100} value={r.price} onChange={(e) => set(i, { price: Number(e.target.value) })} className={fieldClass} />
                </td>
                <td className="pb-2">
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className={btnClass("ghost", "sm")} aria-label="Удалить позицию">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setRows((rs) => [...rs, { title: "", qty: 1, unit: "компл.", price: 0 }])} className={btnClass("ghost", "sm")}>
        + Позиция
      </button>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Срок, раб. дн.</span>
          <input name="termDays" type="number" min={1} defaultValue={15} className={fieldClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Действует, дн.</span>
          <input name="validDays" type="number" min={1} defaultValue={14} className={fieldClass} />
        </label>
        <div className="text-sm">
          <span className="mb-1 block text-xs text-muted">Итого</span>
          <p className="py-2 text-lg font-semibold">{total.toLocaleString("ru-RU")} ₽</p>
        </div>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Примечания</span>
        <textarea name="notes" rows={2} className={fieldClass} />
      </label>
      <SubmitButton>Сформировать КП</SubmitButton>
    </ActionForm>
  );
}

/** Договор по заявке: автозаполнение из шаблона, предпросмотр, формирование. */
export function ContractCreator({ leadId, defaultAmount, defaultTerm }: { leadId: string; defaultAmount: number; defaultTerm: number }) {
  const [preview, previewAction, previewPending] = useActionState(previewContractAction, null);
  const [amount, setAmount] = useState(defaultAmount);
  const [term, setTerm] = useState(defaultTerm);
  const text = (preview?.data?.preview as string | undefined) ?? null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Сумма, ₽</span>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={fieldClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Срок, раб. дн.</span>
          <input type="number" min={1} value={term} onChange={(e) => setTerm(Number(e.target.value))} className={fieldClass} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={previewAction}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="termDays" value={term} />
          <button className={btnClass("secondary", "sm")} disabled={previewPending}>
            {previewPending ? "Формируем…" : "Предпросмотр"}
          </button>
        </form>
        <ActionForm action={createContractAction}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="termDays" value={term} />
          <SubmitButton size="sm" pendingText="Формируем…">
            Сформировать и отправить заказчику
          </SubmitButton>
        </ActionForm>
      </div>
      {preview?.ok === false && <p className="text-sm text-danger-700">{preview.error}</p>}
      {text && (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-line bg-steel-50 p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
        </div>
      )}
    </div>
  );
}
