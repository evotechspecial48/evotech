import type { Metadata } from "next";
import Link from "next/link";
import { STRUCTURE_LIMITS } from "@/domain/quick-order";
import { STRUCTURE_TYPE } from "@/domain/labels";
import { PageHero } from "@/components/site/page-shell";
import { btnClass } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Быстрый заказ проекта навеса, гаража, террасы",
  description: "Онлайн-проектирование малых конструкций: навесы, гаражи, террасы, беседки, ангары. Варианты эскиза, договор, оплата через Т-Банк, архив документации.",
};

const FLOW = [
  "Выберите тип конструкции",
  "Заполните пошаговое ТЗ и загрузите фото участка",
  "Сравните варианты эскиза и выберите подходящий",
  "Подтвердите типовой договор кодом из письма",
  "Оплатите заказ через Т-Банк",
  "Скачайте архив: эскизы, 3D-модель, чертежи, спецификации",
];

export default async function QuickOrderLanding() {
  const user = await getSessionUser();
  const hrefFor = (type?: string) => {
    const target = `/cabinet/quick-orders/new${type ? `?type=${type}` : ""}`;
    return user ? target : `/register?next=${encodeURIComponent(target)}`;
  };
  const startHref = hrefFor();
  return (
    <>
      <PageHero eyebrow="Быстрый заказ" title="Проект малой конструкции онлайн" lead="Навесы, гаражи, террасы, беседки и небольшие ангары — от параметров до комплекта документации без визитов и переписки." />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(STRUCTURE_LIMITS).map(([k, v]) => (
            <Link key={k} href={hrefFor(k)} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 transition hover:border-accent-500">
              <p className="font-semibold">{STRUCTURE_TYPE[k]}</p>
              <p className="mt-1 text-xs text-muted">
                до {v.maxLength}×{v.maxWidth} м
              </p>
              <p className="mt-3 text-sm">от {v.min.toLocaleString("ru-RU")} ₽</p>
            </Link>
          ))}
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <ol className="space-y-3">
            {FLOW.map((f, i) => (
              <li key={f} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-600 font-mono text-xs text-white">{i + 1}</span>
                <span className="pt-0.5">{f}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <p className="text-sm text-warning-700">◷ Сервис работает в демонстрационном режиме: варианты эскиза и документация формируются тестовым генератором.</p>
            <p className="mt-3 text-sm text-muted">Для оформления заказа нужен личный кабинет — регистрация занимает минуту.</p>
            <Link href={startHref} className={`${btnClass("signal", "lg")} mt-5`}>
              Начать быстрый заказ
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
