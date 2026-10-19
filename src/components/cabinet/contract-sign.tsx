"use client";

import { contractAcceptAction, contractOtpAction } from "@/app/actions/cabinet";
import { ActionForm, FieldError, SubmitButton } from "../client";
import { fieldClass } from "../ui";

/** Подписание простой электронной подписью: согласие + одноразовый код из письма. */
export function ContractSign({ contractId, version, back }: { contractId: string; version: number; back?: string }) {
  return (
    <div className="space-y-4">
      <ActionForm action={contractOtpAction}>
        <input type="hidden" name="contractId" value={contractId} />
        <p className="mb-2 text-sm text-muted">1. Получите одноразовый код на электронную почту.</p>
        <SubmitButton variant="secondary" size="sm" pendingText="Отправляем…">
          Получить код
        </SubmitButton>
      </ActionForm>
      <ActionForm action={contractAcceptAction} className="space-y-3 border-t border-line pt-4">
        <input type="hidden" name="contractId" value={contractId} />
        <input type="hidden" name="back" value={back ?? ""} />
        <p className="text-sm text-muted">2. Подтвердите согласие и введите код.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" className="mt-1 size-4 accent-accent-600" />
          <span>Я ознакомился(-ась) с редакцией {version} договора и принимаю его условия</span>
        </label>
        <div>
          <label htmlFor="code" className="mb-1 block text-xs text-muted">
            Код из письма
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${fieldClass} max-w-[160px] font-mono tracking-[0.3em]`} />
          <FieldError name="code" />
        </div>
        <SubmitButton pendingText="Подписываем…">Подписать договор</SubmitButton>
      </ActionForm>
    </div>
  );
}
