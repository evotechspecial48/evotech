import type { Metadata } from "next";
import { WORKS } from "@/content/site";
import { WorkPlaceholder } from "@/components/site/art";
import { CtaBand, PageHero } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Примеры работ", description: "Проекты КМ и КМД в Tekla Structures для промышленных, спортивных и коммерческих объектов." };

export default function WorksPage() {
  return (
    <>
      <PageHero eyebrow="Портфолио" title="Примеры реализованных объектов" lead="Нефтегаз, сельское хозяйство, спорт, общепит, машиностроение и малые архитектурные формы." />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WORKS.map((w, i) => (
            <article key={w.title} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="aspect-[16/9] border-b border-line">
                <WorkPlaceholder seed={i} label={`Схема объекта: ${w.title}`} />
              </div>
              <div className="p-5">
                <h2 className="font-semibold">{w.title}</h2>
                <p className="mt-1 text-sm text-muted">{w.client}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {w.tags.map((t) => (
                    <span key={t} className="rounded bg-steel-100 px-2 py-0.5 text-xs text-steel-800">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
          Здесь появятся фотографии объектов «до и после» и фрагменты 3D-моделей из портфолио компании после подтверждения прав на публикацию.
        </p>
      </div>
      <CtaBand />
    </>
  );
}
