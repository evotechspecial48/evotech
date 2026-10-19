import type { Metadata } from "next";
import { SERVICES } from "@/content/site";
import { CtaBand, PageHero } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Услуги",
  description: "КМ, КМД, 3D-моделирование, расчёты на прочность, реверсивный инжиниринг, оцифровка чертежей, МАФ и машиностроение.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHero eyebrow="Услуги" title="Проектирование и конструкторская документация" lead="Работаем в Tekla Structures, AutoCAD, SolidWorks, ЛИРА-САПР и SCAD. Выпускаем документацию по ГОСТ и СПДС." />
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-2">
        {SERVICES.map((s) => (
          <article key={s.slug} id={s.slug} className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-muted">{s.short}</p>
            <ul className="mt-4 space-y-1.5 text-sm">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden="true" className="text-accent-600">
                    —
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <CtaBand />
    </>
  );
}
