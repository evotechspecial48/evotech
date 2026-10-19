import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { navFor, ROLE_LABELS } from "@/domain/rbac";
import { Logo } from "@/components/site/chrome";
import { NavLinks } from "@/components/cabinet/nav-links";
import { logoutAction } from "@/app/actions/public";
import { btnClass } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Личный кабинет", template: "%s — кабинет EvoTechnology" }, robots: { index: false } };

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  const items = navFor(user.role).map((i) => ({ href: i.href, label: i.label, badge: i.href === "/cabinet/notifications" ? unread : 0 }));
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Link href="/" aria-label="На сайт">
            <Logo />
          </Link>
        </div>
        <nav aria-label="Разделы кабинета" className="flex-1 overflow-y-auto p-3">
          <NavLinks items={items} />
        </nav>
        <div className="border-t border-line p-4 text-sm">
          <Link href="/cabinet/profile" className="flex items-center gap-3 rounded-lg p-1 hover:bg-steel-50">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-steel-900 text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted">{ROLE_LABELS[user.role]}</span>
            </span>
          </Link>
          <form action={logoutAction} className="mt-2">
            <button className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-steel-50 hover:text-ink">Выйти</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <details className="relative lg:hidden">
            <summary className={`${btnClass("ghost", "sm")} list-none`} aria-label="Меню кабинета">
              ☰ Меню
            </summary>
            <nav aria-label="Разделы кабинета" className="absolute left-0 top-11 z-30 max-h-[75vh] w-72 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg">
              <NavLinks items={items} />
              <form action={logoutAction} className="mt-2 border-t border-line pt-2">
                <button className="w-full rounded-md px-3 py-2 text-left text-sm text-muted">Выйти</button>
              </form>
            </nav>
          </details>
          <p className="hidden truncate text-sm text-muted lg:block">
            {ROLE_LABELS[user.role]} · <span className="text-ink">{user.name}</span>
          </p>
          <div className="flex items-center gap-2">
            {!user.emailVerifiedAt && (
              <Link href="/cabinet/profile" className="hidden rounded-full bg-warning-50 px-3 py-1 text-xs text-warning-700 sm:inline">
                ◷ Подтвердите почту
              </Link>
            )}
            <Link href="/cabinet/notifications" className={`${btnClass("ghost", "sm")} relative`} aria-label={`Уведомления${unread ? `, непрочитанных: ${unread}` : ""}`}>
              <span aria-hidden="true">🔔</span>
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-signal-500 px-1 text-[11px] font-semibold text-white">{unread}</span>}
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
