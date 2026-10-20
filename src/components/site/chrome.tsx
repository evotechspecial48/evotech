import Image from "next/image";
import Link from "next/link";
import { COMPANY } from "@/content/site";
import { btnClass } from "../ui";

// Фирменный логотип «ЭвоТех» (public/brand). Светлая версия — для тёмного фона.
export function Logo({ light = false, height = 40 }: { light?: boolean; height?: number }) {
  return (
    <Image
      src={light ? "/brand/logo-light.png" : "/brand/logo.png"}
      alt="ЭвоТех"
      width={Math.round((height * 1200) / 355)}
      height={height}
      priority={!light}
      className="h-auto w-auto"
      style={{ height }}
    />
  );
}

// Услуги, этапы работы, сведения о компании и контакты собраны на одной странице /o-kompanii
const NAV = [
  { href: "/o-kompanii", label: "О компании" },
  { href: "/o-kompanii#uslugi", label: "Услуги" },
  { href: "/o-kompanii#process", label: "Как мы работаем" },
  { href: "/raboty", label: "Примеры работ" },
  { href: "/bystryj-zakaz", label: "Быстрый заказ" },
  { href: "/o-kompanii#kontakty", label: "Контакты" },
];

// Шапка без обращения к сессии — публичные страницы остаются статическими (быстрая загрузка, SEO).
// Гость, открывший кабинет, будет перенаправлен middleware на страницу входа.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="ЭвоТех — на главную">
          <Logo />
        </Link>
        <nav aria-label="Основное меню" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-2 text-sm text-ink-soft hover:bg-steel-50 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={COMPANY.phoneHref} className="hidden whitespace-nowrap text-sm font-medium text-ink 2xl:block">
            {COMPANY.phone}
          </a>
          <Link href="/cabinet" className={btnClass("secondary", "sm")}>
            Личный кабинет
          </Link>
          <span className="hidden sm:block">
            <Link href="/#calc" className={btnClass("primary", "sm")}>
              Рассчитать проект
            </Link>
          </span>
          <details className="relative xl:hidden">
            <summary className={`${btnClass("ghost", "sm")} list-none`} aria-label="Открыть меню">
              ☰
            </summary>
            <nav aria-label="Мобильное меню" className="absolute right-0 top-11 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2.5 text-sm hover:bg-steel-50">
                  {n.label}
                </Link>
              ))}
              <Link href="/#calc" className={`${btnClass("primary", "sm")} mt-2 w-full`}>
                Рассчитать проект
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="blueprint mt-auto text-steel-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light height={46} />
          <p className="mt-3 max-w-sm text-sm text-steel-200">{COMPANY.tagline}. КМ, КМД, 3D-модели, расчёты и онлайн-сервис проектирования.</p>
          <p className="mt-4 text-sm">
            <a href={COMPANY.phoneHref} className="font-semibold text-white">
              {COMPANY.phone}
            </a>
            <br />
            <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
              {COMPANY.email}
            </a>
          </p>
          <div className="mt-3 flex gap-3 text-sm">
            <a href={COMPANY.vk} className="underline-offset-2 hover:text-white hover:underline" rel="noopener" target="_blank">
              ВКонтакте
            </a>
            <a href={COMPANY.telegram} className="underline-offset-2 hover:text-white hover:underline" rel="noopener" target="_blank">
              Telegram
            </a>
            <a href={COMPANY.whatsapp} className="underline-offset-2 hover:text-white hover:underline" rel="noopener" target="_blank">
              WhatsApp
            </a>
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-steel-400">Сервис</p>
          <ul className="space-y-2 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-white">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-steel-400">Документы</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/privacy" className="hover:text-white">
                Политика конфиденциальности
              </Link>
            </li>
            <li>
              <Link href="/consent" className="hover:text-white">
                Согласие на обработку персональных данных
              </Link>
            </li>
            <li>
              <Link href="/zayavka" className="hover:text-white">
                Оставить заявку
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-steel-400">
            {COMPANY.legalName}, ИНН {COMPANY.inn}
            <br />
            {COMPANY.address}
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-steel-400">© {new Date().getFullYear()} ЭвоТех (EvoTechnology). Все права защищены.</div>
    </footer>
  );
}
