import type { Metadata } from "next";
import { STEPS } from "@/content/site";
import { STAGES } from "@/domain/stage";
import { CtaBand, PageHero } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Как проходит проектирование", description: "Этапы работы: ТЗ, договор, эскиз, 3D-модель, чертежи, передача результата. Таймер срока с паузами." };

export default function ProcessPage() {
  return (
    <>
      <PageHero eyebrow="Процесс" title="Как проходит проектирование" lead="Каждый этап заканчивается версией результата и вашим решением: согласовать или вернуть с замечаниями." />
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <ol className="relative space-y-8 border-l-2 border-line pl-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="absolute -left-[45px] grid size-8 place-items-center rounded-full bg-steel-900 font-mono text-sm text-white">{i + 1}</span>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-1 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Этапы проекта в кабинете</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {STAGES.map((s) => (
                <li key={s.code} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                  <span>{s.title}</span>
                  <span className="font-mono text-muted">{s.weight}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Честный таймер срока</h2>
            <p className="mt-2 text-sm text-muted">
              Срок отсчитывается с даты подписания договора — в рабочих или календарных днях. Когда мы ждём от вас исходные данные, ответ на запрос или согласование, таймер автоматически
              останавливается и показывает причину. Прогнозная дата сдачи пересчитывается с учётом пауз.
            </p>
          </div>
        </div>
      </div>
      <CtaBand />
    </>
  );
}
