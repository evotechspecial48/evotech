import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };

const DEMO = [
  ["director@evotech.demo", "Директор"],
  ["pm@evotech.demo", "Руководитель проектов"],
  ["sales@evotech.demo", "Менеджер проектов"],
  ["designer@evotech.demo", "Проектировщик"],
  ["customer@evotech.demo", "Заказчик"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect("/cabinet");
  return (
    <AuthCard
      title="Вход в личный кабинет"
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Link href="/register" className="text-accent-700">
            Регистрация
          </Link>
          <Link href="/forgot-password" className="text-accent-700">
            Забыли пароль?
          </Link>
        </div>
      }
    >
      {sp.reset && (
        <div className="mb-4">
          <Alert tone="success">Пароль изменён. Войдите с новым паролем.</Alert>
        </div>
      )}
      <LoginForm next={sp.next} />
      {process.env.NODE_ENV !== "production" && (
        <details className="mt-5 rounded-lg border border-line bg-steel-50 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-ink-soft">Демо-доступы (пароль Demo2026!)</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {DEMO.map(([e, r]) => (
              <li key={e}>
                {e} — <span className="font-sans text-muted">{r}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AuthCard>
  );
}
