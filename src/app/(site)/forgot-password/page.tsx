import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Восстановление пароля", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthCard title="Восстановление пароля" subtitle="Отправим ссылку для установки нового пароля." footer={<Link href="/login" className="text-accent-700">← Вернуться ко входу</Link>}>
      <ForgotForm />
    </AuthCard>
  );
}
