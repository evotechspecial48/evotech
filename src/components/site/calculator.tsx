"use client";

import { useMemo, useState } from "react";
import { CALC_WORKS, estimateProject, type CalcWork } from "@/domain/quick-order";
import { LeadForm } from "./lead-form";
import { fieldClass } from "../ui";

/** Интерактивный предварительный расчёт: оценка стоимости и сроков, затем заявка с расчётом. */
export function Calculator() {
  const [work, setWork] = useState<CalcWork>("km_kmd");
  const [tons, setTons] = useState(20);
  const [complexity, setComplexity] = useState<1 | 2 | 3>(2);
  const est = useMemo(() => estimateProject(work, tons, complexity), [work, tons, complexity]);
  const complexityLabel = complexity === 1 ? "простая (типовые узлы)" : complexity === 2 ? "средняя" : "высокая (сложная геометрия, много узлов)";
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-5">
        <div>
          <label htmlFor="calc-work" className="mb-1 block text-sm font-medium text-ink-soft">
            Вид работ
          </label>
          <select id="calc-work" className={fieldClass} value={work} onChange={(e) => setWork(e.target.value as CalcWork)}>
            {Object.entries(CALC_WORKS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="calc-tons" className="mb-1 flex justify-between text-sm font-medium text-ink-soft">
            <span>Масса металлоконструкций</span>
            <output htmlFor="calc-tons" className="font-mono text-ink">
              {tons} т
            </output>
          </label>
          <input id="calc-tons" type="range" min={1} max={300} value={tons} onChange={(e) => setTons(Number(e.target.value))} className="w-full accent-accent-600" />
          <p className="mt-1 text-xs text-muted">Не знаете массу? Ориентир: навес 6×4 м ≈ 0,5 т, склад 24×60 м ≈ 60–90 т.</p>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-soft">Сложность</legend>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map((c) => (
              <label key={c} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${complexity === c ? "border-accent-600 bg-accent-50 font-medium text-accent-700" : "border-line-strong bg-surface"}`}>
                <input type="radio" name="calc-complexity" className="sr-only" checked={complexity === c} onChange={() => setComplexity(c)} />
                {c === 1 ? "Простая" : c === 2 ? "Средняя" : "Высокая"}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="rounded-xl border border-line bg-steel-50 p-5" aria-live="polite">
          <p className="text-sm text-muted">Предварительная стоимость</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">
            {est.min.toLocaleString("ru-RU")} – {est.max.toLocaleString("ru-RU")} ₽
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Срок: {est.days[0]}–{est.days[1]} рабочих дней
          </p>
          <p className="mt-3 text-xs text-muted">Оценка ориентировочная. Точную стоимость менеджер рассчитает по ТЗ в течение рабочего дня.</p>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <h3 className="mb-4 text-lg font-semibold">Получить точный расчёт</h3>
        <LeadForm
          source="site_calculator"
          compact
          submitLabel="Получить расчёт"
          defaults={{
            title: `${CALC_WORKS[work].label}, ~${tons} т`,
            description: `Предварительный расчёт на сайте: ${CALC_WORKS[work].label}; масса ~${tons} т; сложность ${complexityLabel}; оценка ${est.min.toLocaleString("ru-RU")}–${est.max.toLocaleString("ru-RU")} ₽.`,
          }}
        />
      </div>
    </div>
  );
}
