import Link from "next/link";
import { ADVANTAGES, COMPANY, DELIVERABLES, FAQ, INDUSTRIES, INPUTS, SERVICES, SOFTWARE, STEPS, TRUST, WORKS } from "@/content/site";
import { STAGES } from "@/domain/stage";
import { HeroFrame, WorkPlaceholder } from "@/components/site/art";
import { Calculator } from "@/components/site/calculator";
import { LeadForm } from "@/components/site/lead-form";
import { btnClass } from "@/components/ui";

// Единая посадочная страница: о компании, услуги, как мы работаем, примеры, расчёт и контакты.
// Пункты меню ведут на якоря этой страницы; прежние адреса перенаправляются сюда (next.config.ts).

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ProfessionalService",
      name: "ЭвоТех (EvoTechnology)",
      description: "Проектирование металлоконструкций: КМ, КМД, 3D-моделирование, расчёты на прочность, реверсивный инжиниринг.",
      telephone: COMPANY.phone,
      email: COMPANY.email,
      areaServed: "RU",
      address: { "@type": "PostalAddress", addressLocality: COMPANY.city, addressCountry: "RU" },
      sameAs: [COMPANY.vk],
      knowsAbout: SOFTWARE,
      hasOfferCatalog: { "@type": "OfferCatalog", name: "Услуги", itemListElement: SERVICES.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.title, description: s.short } })) },
    },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

const ANCHORS = [
  ["o-nas", "О компании"],
  ["uslugi", "Услуги"],
  ["process", "Как мы работаем"],
  ["works", "Примеры"],
  ["calc", "Расчёт"],
  ["kontakty", "Контакты"],
] as const;

function Section({ id, eyebrow, title, lead, children, className = "" }: { id?: string; eyebrow?: string; title: string; lead?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-32 py-16 sm:py-20 ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {eyebrow && <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-600">{eyebrow}</p>}
        <h2 id={id ? `${id}-title` : undefined} className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {title}
        </h2>
        {lead && <p className="mt-3 max-w-3xl text-lg text-muted">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Tick({ children, mark = "✓" }: { children: React.ReactNode; mark?: string }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="text-accent-600">
        {mark}
      </span>
      <span>{children}</span>
    </li>
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

      {/* Навигация по разделам страницы */}
      <nav aria-label="Разделы страницы" className="sticky top-16 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {ANCHORS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-ink-soft hover:border-accent-600 hover:text-accent-700">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* О компании */}
      <Section id="o-nas" eyebrow="О компании" title="Проектная организация полного цикла по металлоконструкциям">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4 text-ink-soft">
            <p>
              ЭвоТех выполняет проектирование металлоконструкций, разработку конструкторской документации и 3D-моделирование для промышленных, коммерческих и частных заказчиков по всей России.
            </p>
            <p>
              Мы работаем в информационной модели: сначала согласуем с вами эскиз и 3D-модель, затем выпускаем документацию. Изменения на ранних стадиях не требуют переделки всего комплекта, а
              результат совпадает с ожиданиями.
            </p>
            <p>Цифровой сервис компании объединяет приём заявок, техническое задание, этапы согласования, файлы, договоры и оплату в одном личном кабинете.</p>
            <div className="grid gap-6 pt-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Отрасли</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {INDUSTRIES.map((i) => (
                    <Tick key={i} mark="—">
                      {i}
                    </Tick>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Программы</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {SOFTWARE.map((s) => (
                    <li key={s} className="rounded bg-steel-100 px-2 py-1 text-xs text-steel-800">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {ADVANTAGES.map((a) => (
              <li key={a.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 text-sm text-muted">{a.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Услуги */}
      <Section id="uslugi" eyebrow="Услуги" title="Что мы проектируем" lead="От отдельного узла до каркаса промышленного здания. Документация по ГОСТ и СПДС." className="bg-surface">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <article key={s.slug} id={s.slug} className="scroll-mt-32 rounded-[var(--radius-card)] border border-line bg-bg p-6">
              <p className="font-mono text-xs text-steel-400">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.short}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {s.points.map((p) => (
                  <Tick key={p}>{p}</Tick>
                ))}
              </ul>
            </article>
          ))}
          <Link href="/bystryj-zakaz" className="flex flex-col justify-center rounded-[var(--radius-card)] border border-dashed border-accent-500 bg-accent-50 p-6 hover:bg-accent-100">
            <p className="font-semibold text-accent-700">Быстрый заказ онлайн →</p>
            <p className="mt-1 text-sm text-muted">Навесы, гаражи, террасы, беседки: варианты эскиза, договор и оплата без визитов.</p>
          </Link>
        </div>
        <h3 className="mt-14 text-xl font-semibold">Что вы получаете</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DELIVERABLES.map((d) => (
            <div key={d.title} className="border-l-2 border-accent-600 pl-4">
              <dt className="font-semibold">{d.title}</dt>
              <dd className="mt-1 text-sm text-muted">{d.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-muted">Форматы передачи: PDF, DWG/DXF, IFC, STEP, XLSX — по согласованию.</p>
      </Section>

      {/* Как мы работаем */}
      <Section id="process" eyebrow="Как мы работаем" title="От заявки до готовой документации" lead="Каждый этап заканчивается версией результата и вашим решением: согласовать или вернуть с замечаниями.">
        <ol className="grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <span className="grid size-9 place-items-center rounded-full bg-accent-600 font-mono text-sm text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h3 className="font-semibold">Что нужно для старта</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {INPUTS.map((i) => (
                <Tick key={i} mark="○">
                  {i}
                </Tick>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h3 className="font-semibold">Этапы проекта в кабинете</h3>
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
            <h3 className="font-semibold">Честный таймер срока</h3>
            <p className="mt-3 text-sm text-muted">
              Срок отсчитывается с даты подписания договора — в рабочих или календарных днях. Пока мы ждём от вас исходные данные, ответ на запрос или согласование, таймер останавливается и
              показывает причину. Прогноз сдачи пересчитывается с учётом пауз.
            </p>
          </div>
        </div>
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
        <Link href="/register" className={`${btnClass("secondary")} mt-8`}>
          Открыть личный кабинет
        </Link>
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
      <Section id="kontakty" eyebrow="Контакты" title="Обсудим ваш проект" lead="Ответим в течение рабочего дня. ТЗ можно прислать в свободной форме." className="bg-surface">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <dl className="space-y-5">
            <div>
              <dt className="text-xs text-muted">Телефон, WhatsApp, Telegram</dt>
              <dd className="mt-1">
                <a href={COMPANY.phoneHref} className="text-2xl font-semibold">
                  {COMPANY.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Электронная почта</dt>
              <dd className="mt-1">
                <a href={`mailto:${COMPANY.email}`} className="font-medium text-accent-700">
                  {COMPANY.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Мессенджеры и соцсети</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {[
                  ["WhatsApp", COMPANY.whatsapp],
                  ["Telegram", COMPANY.telegram],
                  ["ВКонтакте", COMPANY.vk],
                ].map(([l, h]) => (
                  <a key={l} href={h} target="_blank" rel="noopener" className={btnClass("secondary", "sm")}>
                    {l}
                  </a>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Адрес</dt>
              <dd className="mt-1">{COMPANY.address}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Реквизиты</dt>
              <dd className="mt-1">
                {COMPANY.legalName}, ИНН {COMPANY.inn}
              </dd>
            </div>
          </dl>
          <div className="rounded-[var(--radius-card)] border border-line bg-bg p-6 sm:p-8">
            <h3 className="mb-4 text-lg font-semibold">Написать нам</h3>
            <LeadForm source="site_contact" />
          </div>
        </div>
      </Section>
    </>
  );
}
