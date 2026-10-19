import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/domain/rbac";
import { resendVerificationAction, updateProfileAction } from "@/app/actions/cabinet";
import { ActionForm, FieldError, SubmitButton } from "@/components/client";
import { Alert, btnClass, Card, DefList, fieldClass, PageHeader } from "@/components/ui";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Профиль" subtitle={ROLE_LABELS[user.role]} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card title="Личные данные">
          <ActionForm action={updateProfileAction} className="space-y-3">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-ink-soft">
                Имя
              </label>
              <input id="name" name="name" defaultValue={user.name} className={fieldClass} />
              <FieldError name="name" />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-ink-soft">
                Телефон
              </label>
              <input id="phone" name="phone" defaultValue={user.phone ?? ""} className={fieldClass} />
            </div>
            <SubmitButton>Сохранить</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Учётная запись">
          <DefList items={[["Почта", user.email], ["Роль", ROLE_LABELS[user.role]], ["Почта подтверждена", user.emailVerifiedAt ? "да" : "нет"]]} />
          {!user.emailVerifiedAt && (
            <div className="mt-4 space-y-2">
              <Alert tone="warning">Подтвердите адрес — на него приходят коды подписания договоров и уведомления.</Alert>
              <ActionForm action={resendVerificationAction}>
                <SubmitButton size="sm" variant="secondary">
                  Отправить письмо повторно
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-medium">Персональные данные</p>
            <p className="mt-1 text-xs text-muted">Выгрузка всех данных, связанных с вашей учётной записью (152-ФЗ). Для удаления данных обратитесь к администратору.</p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- скачивание файла из API, не переход по странице */}
            <a href="/api/export/me" className={`${btnClass("secondary", "sm")} mt-3`}>
              Выгрузить мои данные (JSON)
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
