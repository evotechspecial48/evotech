"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

export function NavLinks({ items }: { items: { href: string; label: string; badge: number }[] }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const active = i.href === "/cabinet" ? path === "/cabinet" : path.startsWith(i.href);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex items-center justify-between rounded-lg px-3 py-2 text-sm", active ? "bg-accent-50 font-medium text-accent-700" : "text-ink-soft hover:bg-steel-50 hover:text-ink")}
            >
              {i.label}
              {i.badge > 0 && <span className="rounded-full bg-signal-500 px-1.5 text-[11px] font-semibold text-white">{i.badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
