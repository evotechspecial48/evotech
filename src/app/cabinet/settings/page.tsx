import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { templateVariables } from "@/domain/spec";
import { updateSettingsAction, updateTemplateAction } from "@/app/actions/cabinet";
import { ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, DefList, fieldClass, fmtDateTime, PageHeader } from "@/components/ui";

const KIND: Record<string, string> = { CONTRACT: "Договор на проектирование", QUICK_CONTRACT: "Договор быстрого заказа", OFFER: "Коммерческое предложение" };

export default async function SettingsPage() {
  await requireUser("settings.manage");
  const [settings, templates] = await Promise.all([db.setting.findMany(), db.documentTemplate.findMany({ where: { active: true }, orderBy: { kind: "asc" } })]);
  const s = Object.fromEntries(settings.map((x) => [x.key, x.value]));
  const req = (s["company.requisites"] ?? {}) as Record<string, string>;
  return (
    <>
      <PageHeader title="Настройки" subtitle="Параметры системы, реквизиты, календарь и шаблоны документов" />
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Параметры">
            <ActionForm action={updateSettingsAction} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-muted">Режим таймера по умолчанию</span>
                  <select name="timerMode" defaultValue={String(s["timer.defaultMode"] ?? "WORKING")} className={fieldClass}>
                    <option value="WORKING">Рабочие дни</option>
                    <option value="CALENDAR">Календарные дни</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-muted">Максимальный размер файла, МБ</span>
                  <input name="maxSizeMb" type="number" defaultValue={Number(s["files.maxSizeMb"] ?? 50)} className={fieldClass} />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted">Праздничные дни (ГГГГ-ММ-ДД через запятую)</span>
                <textarea name="holidays" rows={3} defaultValue={((s["calendar.holidays"] as string[]) ?? []).join(", ")} className={`${fieldClass} font-mono text-xs`} />
              </label>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium">Реквизиты исполнителя (подставляются в документы)</legend>
                {[
                  ["reqName", "Наименование", req.name],
                  ["reqInn", "ИНН", req.inn],
                  ["reqCity", "Город", req.city],
                  ["reqAddress", "Адрес", req.address],
                  ["reqBank", "Банк", req.bank],
                  ["reqPhone", "Телефон", req.phone],
                  ["reqEmail", "Почта", req.email],
                ].map(([n, l, v]) => (
                  <label key={n} className="text-sm">
                    <span className="mb-1 block text-xs text-muted">{l}</span>
                    <input name={n} defaultValue={v ?? ""} className={fieldClass} />
                  </label>
                ))}
              </fieldset>
              <SubmitButton>Сохранить</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Интеграции">
            <DefList
              items={[
                ["AI-провайдер", <Badge key="ai" tone={env.AI_PROVIDER === "mock" ? "warning" : "success"}>{env.AI_PROVIDER === "mock" ? "Демонстрационный (MockAIProvider)" : `Claude (${env.CLAUDE_MODEL})`}</Badge>],
                ["Эквайринг", <Badge key="pay" tone={env.PAYMENT_PROVIDER === "mock" ? "warning" : "success"}>{env.PAYMENT_PROVIDER === "mock" ? "Демо-банк" : "Т-Банк"}</Badge>],
                ["Почта", env.MAIL_TRANSPORT === "smtp" ? `SMTP ${env.SMTP_HOST}:${env.SMTP_PORT}` : "Вывод в лог"],
                ["Хранилище файлов", env.STORAGE_DRIVER === "local" ? "Локальный диск" : "S3"],
                ["Электронная подпись", "Простая ЭП (код из письма); ЭДО — точка расширения"],
              ]}
            />
            <p className="mt-4 text-xs text-muted">Провайдеры переключаются переменными окружения — см. docs/AI_PROVIDER.md и docs/API.md.</p>
          </Card>
        </div>
        {templates.map((t) => (
          <Card key={t.id} title={`Шаблон: ${KIND[t.kind]}`} actions={<span className="text-xs text-muted">версия {t.version} · {fmtDateTime(t.updatedAt)}</span>}>
            <ActionForm action={updateTemplateAction} className="space-y-3">
              <input type="hidden" name="templateId" value={t.id} />
              <input name="name" defaultValue={t.name} className={fieldClass} aria-label="Название шаблона" />
              <textarea name="body" rows={12} defaultValue={t.body} className={`${fieldClass} font-mono text-xs`} aria-label="Текст шаблона" />
              <p className="text-xs text-muted">Переменные: {templateVariables(t.body).map((v) => `{{${v}}}`).join(", ")}</p>
              <SubmitButton size="sm">Сохранить новую версию шаблона</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
