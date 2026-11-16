"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallApp } from "../pwa";
import { cx } from "../ui";
import { NavLinks } from "./nav-links";

type Item = { href: string; label: string; badge: number };

// Вкладки нижней панели — по порядку важности; у роли показываются первые 4 доступных
const TABS: { href: string; short: string; icon: string }[] = [
  { href: "/cabinet", short: "Главная", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/cabinet/projects", short: "Проекты", icon: "M3 7h7l2 2h9v10H3z" },
  { href: "/cabinet/leads", short: "Заявки", icon: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" },
  { href: "/cabinet/approvals", short: "Согласов.", icon: "M5 12l4 4 10-10" },
  { href: "/cabinet/notifications", short: "Уведомления", icon: "M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20h4" },
];

const isActive = (path: string, href: string) => (href === "/cabinet" ? path === "/cabinet" : path.startsWith(href));

/** Нижняя панель и полноэкранное меню кабинета для телефона (на десктопе — боковая колонка). */
export function MobileNav({ items, logout }: { items: Item[]; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const tabs = TABS.filter((t) => items.some((i) => i.href === t.href)).slice(0, 4);
  const badge = (href: string) => items.find((i) => i.href === href)?.badge ?? 0;
  const moreActive = !tabs.some((t) => isActive(path, t.href));

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Разделы кабинета" className="fixed inset-0 z-40 flex flex-col bg-surface lg:hidden">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <span className="font-semibold">Все разделы</span>
            <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-lg text-xl" aria-label="Закрыть меню">
              ✕
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 [&_a]:py-3 [&_a]:text-base">
            <NavLinks items={items} />
            <Link href="/cabinet/profile" className="mt-2 block rounded-lg px-3 py-3 text-base text-ink-soft hover:bg-steel-50">
              Профиль
            </Link>
          </nav>
          <div className="space-y-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <InstallApp />
            <form action={logout}>
              <button className="min-h-11 w-full rounded-lg border border-line px-3 text-left text-sm text-muted">Выйти</button>
            </form>
          </div>
        </div>
      )}
      <nav aria-label="Основные разделы" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = isActive(path, t.href);
            const n = badge(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined} className={cx("relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px]", active ? "text-accent-700" : "text-muted")}>
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={t.icon} />
                  </svg>
                  <span className="max-w-full truncate">{t.short}</span>
                  {n > 0 && <span className="absolute right-[calc(50%-1.4rem)] top-1 min-w-4 rounded-full bg-signal-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{n}</span>}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={cx("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]", moreActive ? "text-accent-700" : "text-muted")}>
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              Ещё
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
