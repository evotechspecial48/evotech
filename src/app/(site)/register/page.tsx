import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Регистрация", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard
      title="Регистрация заказчика"
      subtitle="Личный кабинет для заявок, проектов и быстрых заказов. Сотрудники компании подключаются по приглашению."
      footer={
        <>
          Уже есть кабинет?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-accent-700">
            Войти
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthCard>
  );
}
