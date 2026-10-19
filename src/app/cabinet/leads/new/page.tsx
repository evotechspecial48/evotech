import { requireUser } from "@/lib/auth";
import { createLeadAction } from "@/app/actions/cabinet";
import { ActionForm, FieldError, SubmitButton } from "@/components/client";
import { Card, fieldClass, PageHeader } from "@/components/ui";

export default async function NewLeadPage() {
  const user = await requireUser(["leads.create", "leads.manage"]);
  const staff = user.role !== "CUSTOMER";
  return (
    <>
      <PageHeader title="Новая заявка" back={{ href: "/cabinet/leads", label: "К заявкам" }} subtitle={staff ? "Регистрация обращения по телефону или вручную" : "Опишите задачу — менеджер поможет подготовить ТЗ"} />
      <Card className="max-w-3xl">
        <ActionForm action={createLeadAction} className="grid gap-4 sm:grid-cols-2">
          {staff && (
            <>
              <L name="contactName" label="Контактное лицо *" />
              <L name="email" label="Почта *" type="email" />
              <L name="phone" label="Телефон" />
              <L name="companyName" label="Компания" />
              <div>
                <label htmlFor="source" className="mb-1 block text-sm font-medium text-ink-soft">
                  Источник
                </label>
                <select id="source" name="source" className={fieldClass}>
                  <option value="phone">Телефон</option>
                  <option value="manual">Вручную</option>
                </select>
              </div>
            </>
          )}
          <L name="title" label="Что нужно спроектировать *" className="sm:col-span-2" />
          <div>
            <label htmlFor="objectType" className="mb-1 block text-sm font-medium text-ink-soft">
              Тип объекта
            </label>
            <select id="objectType" name="objectType" className={fieldClass}>
              <option value="">Не выбран</option>
              {["Каркас здания", "Ангар / склад", "Навес", "Площадка обслуживания", "Эстакада", "Лестница / ограждение", "Малая архитектурная форма", "Другое"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <L name="budget" label="Бюджет" />
          <div className="sm:col-span-2">
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink-soft">
              Описание задачи
            </label>
            <textarea id="description" name="description" rows={5} className={fieldClass} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Создаём…">Создать заявку</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}

function L({ name, label, type = "text", className }: { name: string; label: string; type?: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <input id={name} name={name} type={type} className={fieldClass} />
      <FieldError name={name} />
    </div>
  );
}
