import type { Metadata } from "next";
import { ADVANTAGES, COMPANY } from "@/content/site";
import { CtaBand, PageHero } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "О компании", description: "EvoTechnology — проектная организация полного цикла: КМ, КМД, 3D-моделирование и расчёты." };

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="О компании" title="Проектная организация полного цикла" lead={`${COMPANY.tagline}.`} />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4 text-ink-soft">
          <p>
            EvoTechnology выполняет проектирование металлоконструкций, разработку конструкторской документации и 3D-моделирование для промышленных, коммерческих и частных заказчиков.
          </p>
          <p>
            Мы работаем в информационной модели: сначала согласуем с вами эскиз и 3D-модель, затем выпускаем документацию. Так изменения на ранних стадиях не требуют переделки всего
            комплекта, а результат совпадает с ожиданиями.
          </p>
          <p>Цифровой сервис компании объединяет приём заявок, техническое задание, этапы согласования, файлы, договоры и оплату в одном личном кабинете.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ADVANTAGES.map((a) => (
            <li key={a.title} className="rounded-lg border border-line bg-surface p-4">
              <p className="font-semibold">{a.title}</p>
              <p className="mt-1 text-sm text-muted">{a.text}</p>
            </li>
          ))}
        </ul>
      </div>
      <CtaBand />
    </>
  );
}
