import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, ROLES } from "@/domain/rbac";
import { anonymizeUserAction, inviteUserAction, updateUserAction, userStatusAction } from "@/app/actions/cabinet";
import { ActionForm, ConfirmSubmit, FieldError, SubmitButton } from "@/components/client";
import { Badge, Card, fieldClass, fmtDateTime, PageHeader, Table } from "@/components/ui";

export default async function UsersPage() {
  const me = await requireUser("users.manage");
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], include: { company: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Пользователи и роли" subtitle="Приглашение сотрудников, назначение ролей, блокировка, обезличивание данных" />
      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <Card title={`Пользователи (${users.length})`}>
          <Table head={["Пользователь", "Роль", "Статус", "Последний вход", "Действия"]}>
            {users.map((u) => (
              <tr key={u.id} className="align-top">
                <td>
                  <span className="font-medium">{u.name}</span>
                  <span className="block text-xs text-muted">
                    {u.email}
                    {u.company ? ` · ${u.company.name}` : ""}
                  </span>
                </td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td>
                  {u.status === "ACTIVE" ? <Badge tone="success">Активен</Badge> : u.status === "INVITED" ? <Badge tone="info">Приглашён</Badge> : <Badge tone="danger">Заблокирован</Badge>}
                  {u.anonymizedAt && <span className="block text-xs text-muted">обезличен</span>}
                </td>
                <td className="text-muted">{fmtDateTime(u.lastLoginAt)}</td>
                <td>
                  {u.id !== me.id && !u.anonymizedAt && (
                    <details>
                      <summary className="cursor-pointer text-sm text-accent-700">Изменить</summary>
                      <div className="mt-2 w-72 space-y-3 rounded-lg border border-line bg-surface p-3">
                        <ActionForm action={updateUserAction} className="space-y-2">
                          <input type="hidden" name="userId" value={u.id} />
                          <input name="name" defaultValue={u.name} className={fieldClass} aria-label="Имя" />
                          <select name="role" defaultValue={u.role} className={fieldClass} aria-label="Роль">
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          <input name="phone" defaultValue={u.phone ?? ""} placeholder="Телефон" className={fieldClass} aria-label="Телефон" />
                          <input name="position" defaultValue={u.position ?? ""} placeholder="Должность" className={fieldClass} aria-label="Должность" />
                          <SubmitButton size="sm">Сохранить</SubmitButton>
                        </ActionForm>
                        <ActionForm action={userStatusAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="status" value={u.status === "BLOCKED" ? "ACTIVE" : "BLOCKED"} />
                          <ConfirmSubmit title={u.status === "BLOCKED" ? "Разблокировать пользователя?" : "Заблокировать пользователя?"} text="Активные сессии будут завершены." variant={u.status === "BLOCKED" ? "primary" : "danger"}>
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
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Пригласить пользователя">
          <ActionForm action={inviteUserAction} resetOnSuccess className="space-y-3">
            <div>
              <label htmlFor="iname" className="mb-1 block text-sm font-medium text-ink-soft">
                Имя и фамилия
              </label>
              <input id="iname" name="name" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
                Почта
              </label>
              <input id="email" name="email" type="email" className={fieldClass} />
              <FieldError name="email" />
            </div>
            <div>
              <label htmlFor="role" className="mb-1 block text-sm font-medium text-ink-soft">
                Роль
              </label>
              <select id="role" name="role" className={fieldClass} defaultValue="DESIGNER">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <input name="position" placeholder="Должность" className={fieldClass} aria-label="Должность" />
            <input name="phone" placeholder="Телефон" className={fieldClass} aria-label="Телефон" />
            <SubmitButton>Отправить приглашение</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Ссылка для установки пароля действует 7 дней. Двухфакторная аутентификация подготовлена архитектурно (поле twoFactorEnabled).</p>
        </Card>
      </div>
    </>
  );
}
