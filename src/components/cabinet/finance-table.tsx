"use client";

import { useState } from "react";
import { saveFinanceAction } from "@/app/actions/cabinet";
import { ActionForm, FieldError, SubmitButton } from "../client";
import { fieldClass } from "../ui";

type Row = {
  month: string;
  label: string;
  fact?: boolean;
  revenue: number;
  designers: number;
  pm: number;
  managers: number;
  tax: number;
  sro: number;
  ads: number;
  adsPlatforms: number;
  other: number;
  profit: number;
};

const LINES: { key: keyof Row; label: string; manual?: boolean }[] = [
  { key: "revenue", label: "Выручка" },
  { key: "designers", label: "З/П проектировщики" },
  { key: "pm", label: "З/П Руководитель" },
  { key: "managers", label: "Менеджер" },
  { key: "tax", label: "Налог" },
  { key: "sro", label: "СРО", manual: true },
  { key: "ads", label: "Реклама", manual: true },
  { key: "adsPlatforms", label: "Реклама площадки", manual: true },
  { key: "other", label: "Прочие расходы", manual: true },
];

const money = (n: number) => n.toLocaleString("ru-RU");

/** Финансы директора по месяцам — как таблица учёта компании; ручные строки правятся формой под таблицей. */
export function FinanceTable({ rows, editable = true }: { rows: Row[]; editable?: boolean }) {
  const [month, setMonth] = useState(rows[rows.length - 1]?.month ?? "");
  const current = rows.find((r) => r.month === month);
  const total = (k: keyof Row) => rows.reduce((s, r) => s + (r[k] as number), 0);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-line-strong text-left">
              <th className="py-2 pr-3 font-semibold">Показатель</th>
              {rows.map((r) => (
                <th key={r.month} className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                  {r.label}
                  {r.fact && <span className="block text-[10px] font-normal text-muted">факт</span>}
                </th>
              ))}
              <th className="whitespace-nowrap py-2 pl-2 text-right font-semibold">Итого</th>
            </tr>
          </thead>
          <tbody>
            {LINES.map((l) => (
              <tr key={l.key} className={`border-b border-line ${l.key === "revenue" ? "font-semibold" : ""}`}>
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                  {l.label}
                  {l.manual && <span className="ml-1 text-xs font-normal text-muted">вручную</span>}
                </th>
                {rows.map((r) => (
                  <td key={r.month} className={`px-2 py-1.5 text-right font-mono text-xs ${l.manual && !r[l.key] ? "text-muted" : ""}`}>
                    {money(r[l.key] as number)}
                  </td>
                ))}
                <td className="py-1.5 pl-2 text-right font-mono text-xs font-semibold">{money(total(l.key))}</td>
              </tr>
            ))}
            <tr className="bg-success-50 font-semibold">
              <th scope="row" className="py-2 pr-3 text-left">
                Прибыль
              </th>
              {rows.map((r) => (
                <td key={r.month} className={`px-2 py-2 text-right font-mono text-xs ${r.profit < 0 ? "text-danger-700" : ""}`}>
                  {money(r.profit)}
                </td>
              ))}
              <td className={`py-2 pl-2 text-right font-mono text-xs ${total("profit") < 0 ? "text-danger-700" : ""}`}>{money(total("profit"))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Выручка — договоры, подписанные в месяце. Проектировщики — оплата исполнителей по проектам месяца. Руководитель — 10% выручки, не менее 50 000. Менеджер — 30 000 + 3% от его договоров без
        отметки «редакция». Налог — ориентировочно 8% от выручки. Месяцы с отметкой «факт» — по таблице учёта (лист «Проекты»): выручка, зарплаты и налог как фактически начислено.
      </p>

      {editable && (
        <ActionForm action={saveFinanceAction} className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-6" key={month}>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Месяц</span>
            <select name="month" value={month} onChange={(e) => setMonth(e.target.value)} className={fieldClass}>
              {rows.map((r) => (
                <option key={r.month} value={r.month}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {LINES.filter((l) => l.manual).map((l) => (
            <label key={l.key} className="text-sm">
              <span className="mb-1 block text-xs text-muted">{l.label}, ₽</span>
              <input name={l.key} type="number" min={0} step={1} defaultValue={current ? (current[l.key] as number) : 0} className={fieldClass} />
              <FieldError name={l.key} />
            </label>
          ))}
          <div className="flex items-end">
            <SubmitButton size="sm">Сохранить расходы</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
