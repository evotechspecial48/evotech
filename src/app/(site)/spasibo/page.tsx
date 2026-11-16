import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/content/site";
import { Goal } from "@/components/metrika";
import { PageHero } from "@/components/site/page-shell";
import { btnClass } from "@/components/ui";

export const metadata: Metadata = { title: "Заявка отправлена", robots: { index: false } };

/** Страница благодарности после заявки с сайта: цели Метрики «отправка формы», «заявка из калькулятора», «загрузка ТЗ». */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ n?: string; s?: string; f?: string }> }) {
  const { n = "", s = "", f } = await searchParams;
  const number = /^\d{1,9}$/.test(n) ? n : "";
  return (
    <>
      <PageHero eyebrow="Заявка отправлена" title={number ? `Спасибо! Заявка №${number} принята` : "Спасибо! Заявка принята"} lead="Менеджер свяжется с вами в течение рабочего дня — уточнит задачу и сроки." />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
        {number && (
          <>
            <Goal goal="lead_form" params={{ source: s }} once={number} />
            {s === "site_calculator" && <Goal goal="calculator_lead" once={number} />}
            {f === "1" && <Goal goal="tz_upload" once={number} />}
          </>
        )}
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h2 className="text-lg font-semibold">Что дальше</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-soft">
            <li>Менеджер изучит заявку{f === "1" ? " и приложенные файлы" : ""} и свяжется с вами.</li>
            <li>Вместе подготовим техническое задание и коммерческое предложение.</li>
            <li>После подписания договора следите за этапами и сроками в личном кабинете.</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className={btnClass("primary")}>
              Создать личный кабинет
            </Link>
            <Link href="/" className={btnClass("secondary")}>
              На главную
            </Link>
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Срочный вопрос?</h2>
          <p className="mt-2 text-ink-soft">
            Позвоните{" "}
            <a href={COMPANY.phoneHref} className="font-medium text-accent-700 underline">
              {COMPANY.phone}
            </a>{" "}
            или напишите в мессенджер:
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["MAX", COMPANY.max],
              ["Telegram", COMPANY.telegram],
              ["WhatsApp", COMPANY.whatsapp],
            ].map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noopener" className={btnClass("secondary", "sm")}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
