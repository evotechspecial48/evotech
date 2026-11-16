"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// Яндекс Метрика: счётчик с Вебвизором (карта скроллинга и кликов строятся по его записям) и целями.
// Номер счётчика — NEXT_PUBLIC_YM_ID (задаётся при сборке). Без номера счётчик не подключается.
// Цели (в Метрике — «JavaScript-событие» с этими идентификаторами):
//   lead_form — отправлена заявка (страница благодарности), calculator_lead — заявка из калькулятора,
//   tz_upload — к заявке приложены файлы ТЗ, phone_click — клик по телефону, messenger_click — переход в мессенджер,
//   registration — успешная регистрация; qualified_lead и contract_signed — офлайн-конверсии с сервера.

export const YM_ID = Number(process.env.NEXT_PUBLIC_YM_ID) || 0;

type Ym = (id: number, method: string, ...args: unknown[]) => void;
declare global {
  interface Window {
    ym?: Ym & { a?: unknown[]; l?: number };
  }
}

export function ymGoal(goal: string, params?: Record<string, string>) {
  if (YM_ID && typeof window !== "undefined") window.ym?.(YM_ID, "reachGoal", goal, params);
}

const MESSENGERS: [RegExp, string][] = [
  [/(^|\.)wa\.me$|whatsapp/i, "whatsapp"],
  [/(^|\.)t\.me$|telegram/i, "telegram"],
  [/(^|\.)max\.ru$/i, "max"],
  [/(^|\.)vk\.(ru|com|me)$/i, "vk"],
];

function Counter() {
  const path = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (!YM_ID || window.ym) return;
    // Официальный загрузчик Метрики: очередь вызовов до загрузки tag.js
    const ym = function (...args: unknown[]) {
      (ym.a = ym.a || []).push(args);
    } as Ym & { a?: unknown[]; l?: number };
    ym.l = Date.now();
    window.ym = ym;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.appendChild(s);
    ym(YM_ID, "init", { webvisor: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, defer: true });

    // Клики по телефону и мессенджерам — на всех страницах, включая кнопки в шапке и подвале
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.protocol === "tel:") return ymGoal("phone_click", { page: location.pathname });
      const m = MESSENGERS.find(([re]) => re.test(a.hostname));
      if (m) ymGoal("messenger_click", { messenger: m[1], page: location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true });
    // Разовая отметка с сервера (успешная регистрация) — cookie evo_goal
    const goal = document.cookie.match(/(?:^|; )evo_goal=([^;]+)/)?.[1];
    if (goal) {
      document.cookie = "evo_goal=; Max-Age=0; path=/";
      ymGoal(decodeURIComponent(goal));
    }
  }, []);

  // init с defer: true не считает просмотр сам — первый и последующие (переходы без перезагрузки) отправляются здесь
  useEffect(() => {
    if (YM_ID && window.ym) window.ym(YM_ID, "hit", location.href, { referer: document.referrer, title: document.title });
  }, [path, search]);
  return null;
}

export function YandexMetrika() {
  if (!YM_ID) return null;
  return (
    <Suspense fallback={null}>
      <Counter />
    </Suspense>
  );
}

/** Цель при показе страницы — один раз на ключ (обновление страницы благодарности не удваивает конверсию). */
export function Goal({ goal, params, once }: { goal: string; params?: Record<string, string>; once?: string }) {
  const p = JSON.stringify(params ?? {});
  useEffect(() => {
    const key = once ? `ym_goal_${goal}_${once}` : "";
    try {
      if (key && sessionStorage.getItem(key)) return;
      if (key) sessionStorage.setItem(key, "1");
    } catch {
      // приватный режим — цель всё равно отправляется
    }
    ymGoal(goal, JSON.parse(p));
  }, [goal, once, p]);
  return null;
}
