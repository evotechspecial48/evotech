"use client";

import { useEffect, useState } from "react";
import { btnClass } from "./ui";

/** Регистрация service worker (только в продакшене — в разработке кэш статики мешает HMR). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * «Установить приложение»: Android/Chrome — системный запрос установки, iPhone/iPad — подсказка «Поделиться → На экран „Домой“».
 * Уже установлено (открыто как приложение) — ничего не показывает.
 */
export function InstallApp({ className }: { className?: string }) {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setAndroid(/android/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!evt && !ios && !android)) return null;
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {android && (
        <a href="/android/evotech.apk" download className={btnClass("primary", "sm")}>
          🤖 Скачать приложение для Android (APK)
        </a>
      )}
      {(evt || ios) && (
        <button
          type="button"
          className={btnClass("secondary", "sm")}
          onClick={async () => {
            if (!evt) return setHint((v) => !v);
            await evt.prompt();
            if ((await evt.userChoice).outcome === "accepted") setInstalled(true);
            setEvt(null);
          }}
        >
          📲 Установить приложение
        </button>
      )}
      {hint && (
        <p className="mt-2 text-xs text-muted" role="status">
          В Safari нажмите «Поделиться» <span aria-hidden="true">⎋</span>, затем «На экран „Домой“» — кабинет откроется как приложение.
        </p>
      )}
    </div>
  );
}
