"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Полоса загрузки сверху: появляется в момент нажатия на внутреннюю ссылку и исчезает, когда открылась новая страница.
 * Без неё переход на страницу, которая собирается на сервере, выглядит как «нажатие не сработало».
 */
function Bar() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [busy, setBusy] = useState(false);

  useEffect(() => setBusy(false), [path, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Фаза перехвата: <Link> сам вызывает preventDefault, поэтому defaultPrevented здесь не проверяем
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.origin !== location.origin) return;
      if (a.pathname.startsWith("/api/")) return;
      if (a.pathname === location.pathname && a.search === location.search) return; // та же страница или якорь
      setBusy(true);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Страховка: переход отменён или упал — полоса не висит бесконечно
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 15_000);
    return () => clearTimeout(t);
  }, [busy]);

  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200 ${busy ? "opacity-100" : "opacity-0"}`}>
      <div className={`h-full bg-signal-500 ${busy ? "animate-[navbar_1.2s_ease-in-out_infinite]" : ""}`} />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
