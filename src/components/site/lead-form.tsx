"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { submitLeadAction } from "@/app/actions/public";
import { ActionForm, FieldError, SubmitButton, useFormState } from "../client";
import { fieldClass } from "../ui";
import { LEAD_FORM_FILES } from "@/domain/files";

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
      {/* Первый шаг: имя, один канал связи, файлы. Подробности — по желанию */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="contactName" label="Ваше имя" required autoComplete="name" className="sm:col-span-2" />
        <Text name="phone" label="Телефон" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" />
        <Text name="email" label="Электронная почта" type="email" autoComplete="email" placeholder="name@company.ru" />
        <p className="-mt-2 text-xs text-muted sm:col-span-2">Укажите телефон или почту — достаточно одного, чтобы мы связались с вами.</p>
        <div className="sm:col-span-2">
          <label htmlFor="files" className="mb-1 block text-sm font-medium text-ink-soft">
            Файлы: ТЗ, чертежи, модели, фото
          </label>
          <input id="files" name="files" type="file" multiple accept={LEAD_FORM_FILES.accept} className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-steel-100 file:px-3 file:py-1.5 file:text-sm`} />
          <p className="mt-1 text-xs text-muted">PDF, DWG, IFC, XLSX, архивы (ZIP, RAR, 7z), фото — до {LEAD_FORM_FILES.max} файлов, всего до {LEAD_FORM_FILES.totalMb} МБ.</p>
          <FieldError name="files" />
        </div>
        {compact && defaults?.title ? (
          <>
            {/* В калькуляторе тема и детали заявки формируются из параметров расчёта */}
            <input type="hidden" name="title" value={defaults.title} />
            <input type="hidden" name="description" value={defaults.description ?? ""} />
          </>
        ) : (
          <details className="rounded-lg border border-line p-3 sm:col-span-2" open={!!defaults?.title}>
            <summary className="cursor-pointer text-sm font-medium">Подробнее о задаче — необязательно</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Text name="title" label="Что нужно спроектировать" defaultValue={defaults?.title} className="sm:col-span-2" placeholder="Например: КМД на каркас склада 24×60 м" />
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
              {!compact && (
                <div className="sm:col-span-2">
                  <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink-soft">
                    Подробности
                  </label>
                  <textarea id="description" name="description" rows={4} defaultValue={defaults?.description} className={fieldClass} placeholder="Размеры, нагрузки, сроки, что уже есть (КМ, эскизы, фото)…" />
                </div>
              )}
            </div>
          </details>
        )}
      </div>
      <Consent />
      <SubmitButton size="lg" pendingText="Отправляем…" className="w-full sm:w-auto">
        {submitLabel}
      </SubmitButton>
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
      <input id={name} name={name} required={required} aria-invalid={!!err} aria-describedby={err ? `${name}-error` : undefined} className={`${fieldClass} ym-disable-keys`} {...rest} />
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
