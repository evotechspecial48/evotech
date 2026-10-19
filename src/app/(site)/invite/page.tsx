import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { InviteForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Приглашение", robots: { index: false } };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Завершение регистрации" subtitle="Вас пригласили в сервис EvoTechnology. Задайте пароль для входа.">
      {token ? <InviteForm token={token} /> : <Alert tone="danger">Ссылка приглашения некорректна.</Alert>}
    </AuthCard>
  );
}
