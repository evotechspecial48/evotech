import Link from "next/link";
import { btnClass } from "../ui";

export function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <section className="blueprint text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#8fb4e0]">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {lead && <p className="mt-3 max-w-2xl text-lg text-steel-200">{lead}</p>}
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6">
        <div>
          <p className="text-xl font-semibold">Готовы обсудить проект?</p>
          <p className="text-sm text-muted">Оценим задачу в течение рабочего дня.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/#calc" className={btnClass("primary", "lg")}>
            Рассчитать проект
          </Link>
          <Link href="/bystryj-zakaz" className={btnClass("secondary", "lg")}>
            Быстрый заказ
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_p]:text-ink-soft [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">{children}</div>;
}
