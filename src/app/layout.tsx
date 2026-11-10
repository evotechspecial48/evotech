import type { Metadata, Viewport } from "next";
// Шрифты — из пакетов Fontsource (файлы в проекте): сборка не зависит от доступа к Google Fonts
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

const siteUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "ЭвоТех — проектирование металлоконструкций КМ, КМД", template: "%s — ЭвоТех" },
  description:
    "Проектирование металлоконструкций: КМ, КМД, 3D-модели, расчёты на прочность. Онлайн-сервис с прозрачными этапами, сроками и быстрым заказом навесов, гаражей и террас.",
  keywords: ["проектирование металлоконструкций", "КМ", "КМД", "Tekla Structures", "чертежи КМД", "проект навеса", "3D-модель"],
  openGraph: { type: "website", locale: "ru_RU", siteName: "ЭвоТех" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#202426", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2">
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
