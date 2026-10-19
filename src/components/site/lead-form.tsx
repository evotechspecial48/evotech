"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { submitLeadAction } from "@/app/actions/public";
import { ActionForm, FieldError, SubmitButton, useFormState } from "../client";
import { fieldClass } from "../ui";

/** Короткая форма заявки: honeypot, метка времени, источник, referrer. */
export function LeadForm({
  source = "site_form",
  compact = false,
  defaults,
  submitLabel = "Отправить заявку",
}: {
  source?: "site_form" | "site_calculator" | "site_contact";
  compact?: boolean;
  defaults?: { title?: string; description?: string; objectType?: string };
  submitLabel?: string;
}) {
  const [ts, setTs] = useState("");
  const [referrer, setReferrer] = useState("");
  useEffect(() => {
    setTs(String(Date.now()));
    setReferrer(document.referrer);
  }, []);
  return (
    <ActionForm action={submitLeadAction} resetOnSuccess className="space-y-4">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="ts" value={ts} />
      <input type="hidden" name="referrer" value={referrer} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Сайт
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="contactName" label="Ваше имя" required autoComplete="name" />
        <Text name="phone" label="Телефон" type="tel" autoComplete="tel" placeholder="+7 900 000-00-00" />
        <Text name="email" label="Электронная почта" type="email" required autoComplete="email" className="sm:col-span-2" />
        {!compact && <Text name="companyName" label="Компания" autoComplete="organization" />}
        {!compact && (
          <div>
            <label htmlFor="objectType" className="mb-1 block text-sm font-medium text-ink-soft">
              Тип объекта
            </label>
            <select id="objectType" name="objectType" defaultValue={defaults?.objectType ?? ""} className={fieldClass}>
              <option value="">Не выбран</option>
              {["Каркас здания", "Ангар / склад", "Навес", "Площадка обслуживания", "Эстакада", "Лестница / ограждение", "Малая архитектурная форма", "Оборудование", "Другое"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        )}
        {compact && defaults?.title ? (
          <>
            {/* В калькуляторе тема и детали заявки формируются из параметров расчёта */}
            <input type="hidden" name="title" value={defaults.title} />
            <input type="hidden" name="description" value={defaults.description ?? ""} />
          </>
        ) : (
          <Text name="title" label="Что нужно спроектировать" required defaultValue={defaults?.title} className="sm:col-span-2" placeholder="Например: КМД на каркас склада 24×60 м" />
        )}
        {!compact && (
          <div className="sm:col-span-2">
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink-soft">
              Подробности
            </label>
            <textarea id="description" name="description" rows={4} defaultValue={defaults?.description} className={fieldClass} placeholder="Размеры, нагрузки, сроки, что уже есть (КМ, эскизы, фото)…" />
          </div>
        )}
      </div>
      <Consent />
      <SubmitButton size="lg" pendingText="Отправляем…" className="w-full sm:w-auto">
        {submitLabel}
      </SubmitButton>
      <Success />
    </ActionForm>
  );
}

function Text({ name, label, required, className, ...rest }: { name: string; label: string; required?: boolean; className?: string } & React.ComponentProps<"input">) {
  const state = useFormState();
  const err = state?.fieldErrors?.[name];
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
        {required && <span className="text-danger-700" aria-hidden="true"> *</span>}
      </label>
      <input id={name} name={name} required={required} aria-invalid={!!err} aria-describedby={err ? `${name}-error` : undefined} className={fieldClass} {...rest} />
      <FieldError name={name} />
    </div>
  );
}

function Consent() {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-accent-600" />
        <span>
          Согласен(на) на{" "}
          <Link href="/consent" className="text-accent-700 underline" target="_blank">
            обработку персональных данных
          </Link>{" "}
          в соответствии с{" "}
          <Link href="/privacy" className="text-accent-700 underline" target="_blank">
            политикой конфиденциальности
          </Link>
        </span>
      </label>
      <FieldError name="consent" />
    </div>
  );
}

function Success() {
  const state = useFormState();
  if (!state?.ok) return null;
  return (
    <p className="text-sm text-muted">
      Хотите следить за статусом?{" "}
      <Link href="/register" className="text-accent-700 underline">
        Зарегистрируйтесь
      </Link>{" "}
      с той же почтой — заявка появится в личном кабинете.
    </p>
  );
}
