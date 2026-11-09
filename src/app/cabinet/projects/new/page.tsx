import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createManualProjectAction } from "@/app/actions/cabinet";
import { SPEC_FIELDS } from "@/domain/spec";
import { ActionForm, FieldError, SubmitButton } from "@/components/client";
import { Card, fieldClass, PageHeader } from "@/components/ui";

const OBJECT_TYPES = SPEC_FIELDS.find((f) => f.key === "objectType")?.options ?? [];

export default async function NewManualProjectPage() {
  const user = await requireUser("projects.create");
  const [managers, designers] = await Promise.all([
    db.user.findMany({ where: { role: { in: ["PROJECT_MANAGER", "DIRECTOR"] }, status: { not: "BLOCKED" } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: "DESIGNER", status: { not: "BLOCKED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
  return (
    <>
      <PageHeader
        title="Новый заказчик и проект"
        back={{ href: "/cabinet/projects", label: "К проектам" }}
        subtitle="Для заказов, поступивших вне сайта: заказчик, реквизиты, стоимость, договор и команда — одной формой"
      />
      <ActionForm action={createManualProjectAction} className="grid max-w-4xl gap-6">
        <Card title="Заказчик">
          <div className="grid gap-4 sm:grid-cols-2">
            <L name="customerName" label="Контактное лицо (ФИО) *" required />
            <L name="email" label="Почта *" type="email" required hint="Логин заказчика в личном кабинете" />
            <L name="phone" label="Телефон" type="tel" />
            <L name="position" label="Должность" />
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="invite" defaultChecked className="mt-0.5" />
              <span>Отправить заказчику приглашение в личный кабинет (ссылка для установки пароля, 7 дней)</span>
            </label>
          </div>
        </Card>

        <Card title="Реквизиты организации">
          <div className="grid gap-4 sm:grid-cols-2">
            <L name="companyName" label="Наименование (ООО, ИП…)" className="sm:col-span-2" hint="Для физического лица оставьте пустым" />
            <L name="inn" label="ИНН" inputMode="numeric" />
            <L name="kpp" label="КПП" inputMode="numeric" />
            <L name="ogrn" label="ОГРН / ОГРНИП" inputMode="numeric" />
            <L name="companyPhone" label="Телефон организации" type="tel" />
            <L name="legalAddress" label="Юридический адрес" className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <label htmlFor="bankDetails" className="mb-1 block text-sm font-medium text-ink-soft">
                Банковские реквизиты
              </label>
              <textarea id="bankDetails" name="bankDetails" rows={3} className={fieldClass} placeholder="Банк, БИК, расчётный счёт, корреспондентский счёт" />
            </div>
          </div>
        </Card>

        <Card title="Проект и договор">
          <div className="grid gap-4 sm:grid-cols-2">
            <L name="title" label="Название проекта *" required className="sm:col-span-2" />
            <div>
              <label htmlFor="objectType" className="mb-1 block text-sm font-medium text-ink-soft">
                Тип объекта
              </label>
              <select id="objectType" name="objectType" className={fieldClass}>
                <option value="">Не выбран</option>
                {OBJECT_TYPES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <L name="address" label="Адрес / регион объекта" />
            <L name="amount" label="Стоимость заказа, ₽ *" type="number" required min={1} />
            <L name="termDays" label="Срок, дней *" type="number" required min={1} max={1000} hint="Режим подсчёта (рабочие/календарные) — из настроек" />
            <L name="contractNumber" label="Номер договора" hint="Пусто — присвоится автоматически (Д-ГГГГ-NNNN)" />
            <L name="startedAt" label="Дата начала работ" type="date" defaultValue={today} />
            <div className="sm:col-span-2">
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink-soft">
                Описание задачи
              </label>
              <textarea id="description" name="description" rows={4} className={fieldClass} />
            </div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="contractSigned" defaultChecked className="mt-0.5" />
              <span>
                Договор уже подписан (на бумаге или по ЭДО) — таймер срока запустится с даты начала. Если снять отметку, заказчик подпишет договор в кабинете кодом, и таймер
                стартует в момент подписания.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="briefApproved" defaultChecked className="mt-0.5" />
              <span>ТЗ и исходные данные согласованы — начать сразу с этапа «Эскиз»</span>
            </label>
          </div>
        </Card>

        <Card title="Команда">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="managerId" className="mb-1 block text-sm font-medium text-ink-soft">
                Руководитель проекта
              </label>
              <select id="managerId" name="managerId" defaultValue={user.role === "PROJECT_MANAGER" ? user.id : ""} className={fieldClass}>
                <option value="">Не назначен</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.role === "DIRECTOR" ? " (директор)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="designerId" className="mb-1 block text-sm font-medium text-ink-soft">
                Проектировщик (при необходимости)
              </label>
              <select id="designerId" name="designerId" className={fieldClass}>
                <option value="">Не назначен</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <L name="fee" label="Оплата проектировщику, ₽" type="number" min={0} hint="Видна только руководителям" />
            <L name="advance" label="Аванс проектировщику, ₽" type="number" min={0} />
          </div>
        </Card>

        <div>
          <SubmitButton pendingText="Создаём…">Создать заказчика и проект</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

function L({
  name,
  label,
  type = "text",
  className,
  hint,
  required,
  min,
  max,
  defaultValue,
  inputMode,
}: {
  name: string;
  label: string;
  type?: string;
  className?: string;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string;
  inputMode?: "numeric";
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <input id={name} name={name} type={type} required={required} min={min} max={max} defaultValue={defaultValue} inputMode={inputMode} className={fieldClass} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}
