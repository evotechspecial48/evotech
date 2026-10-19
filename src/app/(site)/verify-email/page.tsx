import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { Alert, btnClass } from "@/components/ui";
import { verifyEmailAction } from "@/app/actions/public";

export const metadata: Metadata = { title: "Подтверждение почты", robots: { index: false } };

// Подтверждение выполняется POST-запросом по кнопке: почтовые сканеры, открывающие ссылки, не «съедят» токен.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string; error?: string }> }) {
  const { token, done, error } = await searchParams;
  async function confirm() {
    "use server";
    const { redirect } = await import("next/navigation");
    const res = await verifyEmailAction(token ?? "");
    redirect(res?.ok ? "/verify-email?done=1" : `/verify-email?error=${encodeURIComponent(res?.error ?? "Ошибка")}`);
  }
  return (
    <AuthCard title="Подтверждение электронной почты">
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">Адрес подтверждён.</Alert>
          <Link href="/cabinet" className={btnClass("primary")}>
            Перейти в кабинет
          </Link>
        </div>
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : token ? (
        <form action={confirm}>
          <button className={btnClass("primary")}>Подтвердить адрес</button>
        </form>
      ) : (
        <Alert tone="danger">Ссылка некорректна.</Alert>
      )}
    </AuthCard>
  );
}
