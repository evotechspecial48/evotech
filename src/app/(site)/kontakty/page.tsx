import type { Metadata } from "next";
import { COMPANY } from "@/content/site";
import { LeadForm } from "@/components/site/lead-form";
import { PageHero } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Контакты", description: `Телефон ${COMPANY.phone}, WhatsApp, Telegram, ВКонтакте. Ответим в течение рабочего дня.` };

export default function ContactsPage() {
  return (
    <>
      <PageHero eyebrow="Контакты" title="Свяжитесь с нами" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <dl className="space-y-5">
          {[
            ["Телефон, WhatsApp, Telegram", <a key="p" href={COMPANY.phoneHref} className="text-xl font-semibold">{COMPANY.phone}</a>],
            ["Электронная почта", <a key="e" href={`mailto:${COMPANY.email}`} className="text-accent-700">{COMPANY.email}</a>],
            ["ВКонтакте", <a key="v" href={COMPANY.vk} className="text-accent-700" target="_blank" rel="noopener">vk.ru/evotech48</a>],
            ["Адрес", COMPANY.address],
            ["Реквизиты", `${COMPANY.legalName}, ИНН ${COMPANY.inn}`],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-lg font-semibold">Написать нам</h2>
          <LeadForm source="site_contact" />
        </div>
      </div>
    </>
  );
}
