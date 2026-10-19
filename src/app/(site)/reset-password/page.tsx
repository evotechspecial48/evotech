import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ResetForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Новый пароль", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthCard title="Новый пароль">{token ? <ResetForm token={token} /> : <Alert tone="danger">Ссылка некорректна. Запросите восстановление ещё раз.</Alert>}</AuthCard>;
}
