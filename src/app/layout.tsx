import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

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
    <html lang="ru" className={`${plex.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2">
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
