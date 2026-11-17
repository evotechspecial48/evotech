import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, ROLES } from "@/domain/rbac";
import { anonymizeUserAction, mergeAccountsAction, resendInviteAction, updateUserAction, userStatusAction } from "@/app/actions/cabinet";
import { isPlaceholderEmail } from "@/services/users";
import { ActionForm, ConfirmSubmit, FieldError, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, DefList, fieldClass, fmtDateTime, PageHeader } from "@/components/ui";

/** Карточка пользователя: правка, приглашение, блокировка, обезличивание, объединение с дублем. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser("users.manage");
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, include: { company: { select: { name: true } }, _count: { select: { memberships: true, customerProjects: true, customerLeads: true } } } });
  if (!u) notFound();
  // Кандидаты в дубли: другие неанонимизированные записи (обычно — самостоятельная регистрация «Заказчик»)
  const others = await db.user.findMany({
    where: { id: { notIn: [u.id, me.id] }, anonymizedAt: null },
    select: { id: true, name: true, email: true, role: true, status: true },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader back={{ href: "/cabinet/users", label: "К пользователям" }} title={u.name} subtitle={`${ROLE_LABELS[u.role]} · ${u.email}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card title="Данные и роль">
            {u.anonymizedAt ? (
              <p className="text-sm text-muted">Персональные данные обезличены {fmtDateTime(u.anonymizedAt)}.</p>
            ) : (
              <ActionForm action={updateUserAction} className="space-y-3">
                <input type="hidden" name="userId" value={u.id} />
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">ФИО</span>
                  <input name="name" defaultValue={u.name} className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">Почта (логин)</span>
                  <input name="email" type="email" required defaultValue={u.email} className={fieldClass} />
                  <FieldError name="email" />
                </label>
                {isPlaceholderEmail(u.email) && <Alert tone="warning">Почта из таблицы учёта — замените её на настоящую, затем отправьте приглашение.</Alert>}
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">Роль</span>
                  {/* Свою роль директор не меняет */}
                  {u.id === me.id && <input type="hidden" name="role" value={u.role} />}
                  <select name="role" defaultValue={u.role} disabled={u.id === me.id} className={fieldClass}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="phone" defaultValue={u.phone ?? ""} placeholder="Телефон" className={fieldClass} aria-label="Телефон" />
                  <input name="position" defaultValue={u.position ?? ""} placeholder="Должность" className={fieldClass} aria-label="Должность" />
                </div>
                <SubmitButton size="sm">Сохранить</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card title="Сведения">
            <DefList
              items={[
                ["Статус", u.status === "ACTIVE" ? <Badge key="s" tone="success">Активен</Badge> : u.status === "INVITED" ? <Badge key="s" tone="info">Приглашён</Badge> : <Badge key="s" tone="danger">Заблокирован</Badge>],
                ["Последний вход", fmtDateTime(u.lastLoginAt)],
                ["Создан", fmtDateTime(u.createdAt)],
                ["Компания", u.company?.name],
                ["Проектов (исполнитель)", String(u._count.memberships)],
                ["Проектов и заявок (заказчик)", String(u._count.customerProjects + u._count.customerLeads)],
              ]}
            />
          </Card>
        </div>
        {!u.anonymizedAt && (
          <div className="space-y-6">
            {u.status === "INVITED" && (
              <Card title="Приглашение">
                <p className="mb-3 text-sm text-muted">Письмо со ссылкой для установки пароля уйдёт на {u.email}. Ссылка действует 7 дней.</p>
                <ActionForm action={resendInviteAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <SubmitButton size="sm">Отправить приглашение</SubmitButton>
                </ActionForm>
              </Card>
            )}
            <Card title="Объединить с дублем">
              <p className="mb-3 text-sm text-muted">
                Этот человек зарегистрировался сам и получил вторую запись? Выберите её: вход (почта и пароль) перейдёт сюда, дубль будет удалён. Роль, имя, проекты и оплаты этой записи сохранятся.
              </p>
              <ActionForm action={mergeAccountsAction} className="space-y-3">
                <input type="hidden" name="keepId" value={u.id} />
                <select name="duplicateId" required defaultValue="" className={fieldClass} aria-label="Дубль">
                  <option value="" disabled>
                    Выберите дубль — новые записи сверху
                  </option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {ROLE_LABELS[o.role]} · {o.email}
                    </option>
                  ))}
                </select>
                <ConfirmSubmit title="Объединить учётные записи?" text="Вход дубля перейдёт к этой записи, сам дубль будет удалён. Отменить нельзя." variant="primary">
                  Объединить
                </ConfirmSubmit>
              </ActionForm>
            </Card>
            {u.id !== me.id && (
              <Card title="Доступ и данные">
                <div className="flex flex-wrap gap-3">
                  <ActionForm action={userStatusAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value={u.status === "BLOCKED" ? "ACTIVE" : "BLOCKED"} />
                    <ConfirmSubmit
                      title={u.status === "BLOCKED" ? "Разблокировать пользователя?" : "Заблокировать пользователя?"}
                      text="Активные сессии будут завершены."
                      variant={u.status === "BLOCKED" ? "primary" : "danger"}
                    >
                      {u.status === "BLOCKED" ? "Разблокировать" : "Заблокировать"}
                    </ConfirmSubmit>
                  </ActionForm>
                  <ActionForm action={anonymizeUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <ConfirmSubmit title="Обезличить персональные данные?" text="Имя, почта и телефон будут удалены без возможности восстановления. Договоры и платежи сохранятся.">
                      Обезличить ПДн
                    </ConfirmSubmit>
                  </ActionForm>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
