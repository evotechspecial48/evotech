import type { Metadata } from "next";
import Link from "next/link";
import { ADVANTAGES, COMPANY, DELIVERABLES, INDUSTRIES, INPUTS, SERVICES, SOFTWARE, STEPS, TRUST } from "@/content/site";
import { STAGES } from "@/domain/stage";
import { LeadForm } from "@/components/site/lead-form";
import { btnClass } from "@/components/ui";

// Единая страница: о компании, услуги, как мы работаем, контакты (раньше — 4 отдельные страницы;
// старые адреса перенаправляются сюда, см. next.config.ts).

export const metadata: Metadata = {
  title: "О компании, услуги и контакты",
  description:
    "ЭвоТех — проектирование металлоконструкций: КМ, КМД, 3D-моделирование, расчёты на прочность, реверсивный инжиниринг. Этапы работы, сроки, контакты и реквизиты.",
};

const SECTIONS = [
  ["o-nas", "О нас"],
  ["uslugi", "Услуги"],
  ["process", "Как мы работаем"],
  ["kontakty", "Контакты"],
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "ЭвоТех (EvoTechnology)",
  telephone: COMPANY.phone,
  email: COMPANY.email,
  address: { "@type": "PostalAddress", addressLocality: COMPANY.city, addressCountry: "RU" },
  sameAs: [COMPANY.vk],
  knowsAbout: SERVICES.map((s) => s.title),
};

function Heading({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="mb-8">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-600">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="mt-3 max-w-3xl text-lg text-muted">{lead}</p>}
    </header>
  );
}

export default function CompanyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="blueprint text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#8fb4e0]">О компании</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Проектная организация полного цикла по металлоконструкциям</h1>
            <p className="mt-4 max-w-2xl text-lg text-steel-200">
              {COMPANY.tagline}. Выпускаем КМ и КМД, ведём проекты в 3D-модели, считаем конструкции и сопровождаем заказчика на каждом этапе — с прозрачными сроками в личном кабинете.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="#kontakty" className={btnClass("signal", "lg")}>
                Обсудить проект
              </Link>
              <a href={COMPANY.phoneHref} className={`${btnClass("secondary", "lg")} border-white/30 bg-white/5 text-white hover:bg-white/10`}>
                {COMPANY.phone}
              </a>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-4">
            {TRUST.map((t) => (
              <li key={t.label} className="rounded-xl border border-white/15 bg-white/5 p-4">
                <p className="text-3xl font-semibold">{t.value}</p>
                <p className="mt-1 text-xs leading-snug text-steel-200">{t.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Навигация по разделам страницы */}
      <nav aria-label="Разделы страницы" className="sticky top-16 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-ink-soft hover:border-accent-600 hover:text-accent-700">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* О нас */}
      <section id="o-nas" aria-labelledby="o-nas-title" className="scroll-mt-32 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Heading id="o-nas" eyebrow="О нас" title="Инженерная надёжность без лишней бюрократии" />
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
                      <li key={i} className="flex gap-2">
                        <span aria-hidden="true" className="text-accent-600">
                          —
                        </span>
                        {i}
                      </li>
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
        </div>
      </section>

      {/* Услуги */}
      <section id="uslugi" aria-labelledby="uslugi-title" className="scroll-mt-32 bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Heading id="uslugi" eyebrow="Услуги" title="Что мы проектируем" lead="Работаем в Tekla Structures, AutoCAD, SolidWorks, ЛИРА-САПР и SCAD. Документация по ГОСТ и СПДС." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s, i) => (
              <article key={s.slug} id={s.slug} className="scroll-mt-32 rounded-[var(--radius-card)] border border-line bg-bg p-6">
                <p className="font-mono text-xs text-steel-400">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.short}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {s.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span aria-hidden="true" className="text-accent-600">
                        ✓
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
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
          <p className="mt-6 text-sm text-muted">Форматы: PDF, DWG/DXF, IFC, STEP, XLSX. Небольшие конструкции (навесы, гаражи, террасы) можно оформить онлайн через <Link href="/bystryj-zakaz" className="text-accent-700 underline">быстрый заказ</Link>.</p>
        </div>
      </section>

      {/* Как мы работаем */}
      <section id="process" aria-labelledby="process-title" className="scroll-mt-32 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Heading id="process" eyebrow="Как мы работаем" title="От заявки до готовой документации" lead="Каждый этап заканчивается версией результата и вашим решением: согласовать или вернуть с замечаниями." />
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
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent-600">
                      ○
                    </span>
                    {i}
                  </li>
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
                Срок отсчитывается с даты подписания договора — в рабочих или календарных днях. Пока мы ждём от вас исходные данные, ответ на запрос или согласование, таймер
                останавливается и показывает причину. Прогноз сдачи пересчитывается с учётом пауз.
              </p>
              <Link href="/register" className={`${btnClass("secondary", "sm")} mt-4`}>
                Открыть личный кабинет
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Контакты */}
      <section id="kontakty" aria-labelledby="kontakty-title" className="scroll-mt-32 bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Heading id="kontakty" eyebrow="Контакты" title="Обсудим ваш проект" lead="Ответим в течение рабочего дня. ТЗ можно прислать в свободной форме." />
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
                <dd className="mt-1 flex flex-wrap gap-2">
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
        </div>
      </section>
    </>
  );
}
