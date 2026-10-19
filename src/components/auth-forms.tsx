"use client";

import Link from "next/link";
import { acceptInviteAction, forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/app/actions/public";
import { ActionForm, FieldError, SubmitButton, useFormState } from "./client";
import { fieldClass } from "./ui";

function F({ name, label, type = "text", autoComplete, required = true, hint }: { name: string; label: string; type?: string; autoComplete?: string; required?: boolean; hint?: string }) {
  const s = useFormState();
  const err = s?.fieldErrors?.[name];
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} required={required} aria-invalid={!!err} aria-describedby={err ? `${name}-error` : undefined} className={fieldClass} />
      {hint && !err && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

function ConsentBox() {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="consent" className="mt-1 size-4 accent-accent-600" />
        <span>
          Согласен(на) на{" "}
          <Link href="/consent" target="_blank" className="text-accent-700 underline">
            обработку персональных данных
          </Link>
        </span>
      </label>
      <FieldError name="consent" />
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <F name="email" label="Электронная почта" type="email" autoComplete="email" />
      <F name="password" label="Пароль" type="password" autoComplete="current-password" />
      <SubmitButton className="w-full" pendingText="Входим…">
        Войти
      </SubmitButton>
    </ActionForm>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  return (
    <ActionForm action={registerAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <F name="name" label="Имя и фамилия" autoComplete="name" />
      <F name="email" label="Электронная почта" type="email" autoComplete="email" />
      <F name="phone" label="Телефон" type="tel" autoComplete="tel" required={false} />
      <F name="company" label="Организация (необязательно)" autoComplete="organization" required={false} />
      <F name="password" label="Пароль" type="password" autoComplete="new-password" hint="Не короче 8 символов, буквы и цифры" />
      <ConsentBox />
      <SubmitButton className="w-full" pendingText="Создаём кабинет…">
        Зарегистрироваться
      </SubmitButton>
    </ActionForm>
  );
}

export function ForgotForm() {
  return (
    <ActionForm action={forgotPasswordAction} className="space-y-4">
      <F name="email" label="Электронная почта" type="email" autoComplete="email" />
      <SubmitButton className="w-full" pendingText="Отправляем…">
        Отправить ссылку
      </SubmitButton>
    </ActionForm>
  );
}

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <F name="password" label="Новый пароль" type="password" autoComplete="new-password" hint="Не короче 8 символов, буквы и цифры" />
      <SubmitButton className="w-full">Сохранить пароль</SubmitButton>
    </ActionForm>
  );
}

export function InviteForm({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInviteAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <F name="password" label="Придумайте пароль" type="password" autoComplete="new-password" hint="Не короче 8 символов, буквы и цифры" />
      <ConsentBox />
      <SubmitButton className="w-full">Завершить регистрацию</SubmitButton>
    </ActionForm>
  );
}
