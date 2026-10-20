import Link from "next/link";
import { ADVANTAGES, COMPANY, FAQ, SERVICES, STEPS, TRUST, WORKS } from "@/content/site";
import { HeroFrame, WorkPlaceholder } from "@/components/site/art";
import { Calculator } from "@/components/site/calculator";
import { LeadForm } from "@/components/site/lead-form";
import { btnClass } from "@/components/ui";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ProfessionalService",
      name: "EvoTechnology",
      description: "Проектирование металлоконструкций: КМ, КМД, 3D-моделирование, расчёты на прочность.",
      telephone: COMPANY.phone,
      email: COMPANY.email,
      areaServed: "RU",
      address: { "@type": "PostalAddress", addressLocality: COMPANY.city, addressCountry: "RU" },
      sameAs: [COMPANY.vk],
      hasOfferCatalog: { "@type": "OfferCatalog", name: "Услуги", itemListElement: SERVICES.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.title, description: s.short } })) },
    },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

function Section({ id, eyebrow, title, lead, children, className = "" }: { id?: string; eyebrow?: string; title: string; lead?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 sm:py-20 ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {eyebrow && <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-600">{eyebrow}</p>}
        <h2 id={id ? `${id}-title` : undefined} className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {title}
        </h2>
        {lead && <p className="mt-3 max-w-2xl text-lg text-muted">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Первый экран */}
      <section className="blueprint relative overflow-hidden text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#8fb4e0]">КМ · КМД · 3D · Расчёты</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">Проектирование металлоконструкций с прозрачными сроками</h1>
            <p className="mt-5 max-w-xl text-lg text-steel-200">
              Чертежи КМ и КМД, 3D-модели и расчёты — с личным кабинетом, где видно каждый этап, версию и остаток срока. Для небольших конструкций — быстрый заказ онлайн.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#calc" className={btnClass("signal", "lg")}>
                Рассчитать проект
              </Link>
              <Link href="/bystryj-zakaz" className={`${btnClass("secondary", "lg")} border-white/30 bg-white/5 text-white hover:bg-white/10`}>
                Быстрый заказ
              </Link>
            </div>
            <ul className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
              {TRUST.map((t) => (
                <li key={t.label}>
                  <p className="text-2xl font-semibold">{t.value}</p>
                  <p className="text-xs leading-snug text-steel-400">{t.label}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <HeroFrame />
          </div>
        </div>
      </section>

      {/* Направления */}
      <Section id="services" eyebrow="Направления" title="Что мы проектируем" lead="От отдельного узла до каркаса промышленного здания — с выпуском документации по ГОСТ и СПДС.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <article key={s.slug} className="group rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] transition hover:border-accent-500">
              <p className="font-mono text-xs text-steel-400">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.short}</p>
            </article>
          ))}
          <Link href="/o-kompanii#uslugi" className="flex items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-sm font-medium text-accent-700 hover:bg-surface">
            Все услуги →
          </Link>
        </div>
      </Section>

      {/* Преимущества */}
      <Section eyebrow="Почему мы" title="Инженерная надёжность без лишней бюрократии" className="bg-surface">
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {ADVANTAGES.map((a) => (
            <div key={a.title} className="border-l-2 border-accent-600 pl-4">
              <h3 className="font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-muted">{a.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Этапы */}
      <Section id="process" eyebrow="Процесс" title="Как проходит проектирование" lead="Пять этапов, на каждом — версия результата и ваше согласование.">
        <ol className="grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <span className="grid size-9 place-items-center rounded-full bg-steel-900 font-mono text-sm text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Примеры */}
      <Section id="works" eyebrow="Портфолио" title="Примеры выполненных работ" className="bg-surface">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WORKS.slice(0, 6).map((w, i) => (
            <article key={w.title} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="aspect-[16/9] border-b border-line">
                <WorkPlaceholder seed={i} label={`Схема объекта: ${w.title}`} />
              </div>
              <div className="p-5">
                <h3 className="font-semibold">{w.title}</h3>
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
        <p className="mt-4 text-xs text-muted">Фотографии объектов будут опубликованы после подтверждения прав на публикацию.</p>
      </Section>

      {/* Калькулятор */}
      <Section id="calc" eyebrow="Предварительный расчёт" title="Оцените стоимость за минуту" lead="Укажите вид работ и примерную массу конструкций — покажем ориентир по цене и срокам.">
        <Calculator />
      </Section>

      {/* Цифровой сервис */}
      <Section eyebrow="Личный кабинет" title="Цифровой сервис вместо переписки в мессенджерах" className="bg-surface">
        <div className="grid gap-8 lg:grid-cols-2">
          <ul className="space-y-4">
            {[
              ["Таймер готовности", "Остаток срока и прогноз завершения; пауза, когда ждём ваши данные."],
              ["Согласования по версиям", "Эскиз, модель, чертежи — согласуйте или верните с замечаниями в один клик."],
              ["Совместное ТЗ", "Заполняйте техническое задание вместе с менеджером, история правок сохраняется."],
              ["Документы и оплата", "Договор подписывается кодом, оплата — через Т-Банк, файлы — по защищённым ссылкам."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 grid size-6 shrink-0 place-items-center rounded bg-accent-600 text-xs text-white">
                  ✓
                </span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="rounded-[var(--radius-card)] border border-line bg-bg p-5" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-sm font-semibold">Проект №12 · Каркас цеха 18×36 м</span>
              <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-700">◷ Пауза: ждём заказчика</span>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["Техническое задание", "✓ Завершён", 100],
                ["Эскиз", "◐ В работе", 55],
                ["3D-модель", "○ Не начат", 0],
              ].map(([t, s, v]) => (
                <div key={t as string}>
                  <div className="flex justify-between">
                    <span>{t}</span>
                    <span className="text-muted">{s}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-steel-100">
                    <div className="h-full rounded-full bg-accent-600" style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-xs text-muted">Осталось 17,5 раб. дн. · прогноз: 12.11.2026</p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="Вопросы" title="Частые вопросы">
        <div className="mx-auto max-w-3xl divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span aria-hidden="true" className="text-accent-600 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Контакты */}
      <Section id="contact" eyebrow="Контакты" title="Обсудим ваш проект" className="bg-surface">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4 text-sm">
            <p className="text-muted">Ответим в течение рабочего дня. ТЗ можно прислать в свободной форме.</p>
            <p>
              <span className="block text-xs text-muted">Телефон, WhatsApp, Telegram</span>
              <a href={COMPANY.phoneHref} className="text-xl font-semibold">
                {COMPANY.phone}
              </a>
            </p>
            <p>
              <span className="block text-xs text-muted">Почта</span>
              <a href={`mailto:${COMPANY.email}`} className="font-medium text-accent-700">
                {COMPANY.email}
              </a>
            </p>
            <p>
              <span className="block text-xs text-muted">Соцсети</span>
              <a href={COMPANY.vk} className="font-medium text-accent-700" target="_blank" rel="noopener">
                ВКонтакте: evotech48
              </a>
            </p>
          </div>
          <LeadForm source="site_contact" />
        </div>
      </Section>
    </>
  );
}
