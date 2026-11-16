import type { MetadataRoute } from "next";

/** Веб-приложение: установка на главный экран телефона, запуск сразу в кабинет без адресной строки. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/cabinet",
    name: "ЭвоТех — личный кабинет",
    short_name: "ЭвоТех",
    description: "Заявки, проекты, согласования и документы ЭвоТех",
    lang: "ru",
    start_url: "/cabinet?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#202426",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Проекты", url: "/cabinet/projects", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Согласования", url: "/cabinet/approvals", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Уведомления", url: "/cabinet/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
