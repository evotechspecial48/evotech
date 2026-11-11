import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/page";
import { can } from "@/domain/rbac";
import { CONTRACT_STATUS, LEAD_SOURCE, LEAD_STATUS, OFFER_STATUS, SPEC_STATUS } from "@/domain/labels";
import { loadLeadAccess } from "@/services/scope";
import {
  convertLeadAction,
  deleteContractAction,
  deleteLeadAction,
  deleteOfferAction,
  ensureSpecAction,
  leadAssignAction,
  leadCommentAction,
  leadStatusAction,
  leadTaskAction,
  offerStatusAction,
  toggleTaskAction,
  updateLeadContactsAction,
  uploadContractAction,
  uploadOfferAction,
} from "@/app/actions/cabinet";
import { ActionForm, ConfirmSubmit, FieldError, FileUploader, SubmitButton } from "@/components/client";
import { CommentList, FileList, History } from "@/components/cabinet/shared";
import { ContractCreator, OfferBuilder } from "@/components/cabinet/lead-widgets";
import { Alert, btnClass, Card, DefList, fieldClass, fmtDate, fmtDateTime, PageHeader, rub, StatusBadge } from "@/components/ui";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(["leads.view_all", "leads.view_own"]);
  await orNotFound(loadLeadAccess(user, id));
  const isCustomer = user.role === "CUSTOMER";
  const lead = await db.lead.findUniqueOrThrow({
    where: { id },
    include: {
      manager: true,
      customer: true,
      spec: true,
      project: { select: { id: true, number: true } },
      offers: { orderBy: { createdAt: "desc" } },
      contracts: { orderBy: { createdAt: "desc" } },
      comments: { where: isCustomer ? { internal: false } : {}, include: { author: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" } },
      tasks: { include: { assignee: { select: { name: true } } }, orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }] },
      files: { where: { deletedAt: null, ...(isCustomer ? { internal: false } : {}) }, orderBy: { createdAt: "desc" } },
    },
  });
  const [history, managers, pms] = await Promise.all([
    db.statusChange.findMany({ where: { entityType: "Lead", entityId: id }, orderBy: { createdAt: "desc" } }),
    can(user.role, "leads.manage") ? db.user.findMany({ where: { role: { in: ["SALES_MANAGER", "DIRECTOR"] }, status: "ACTIVE" }, select: { id: true, name: true } }) : [],
    can(user.role, "projects.create") ? db.user.findMany({ where: { role: "PROJECT_MANAGER", status: "ACTIVE" }, select: { id: true, name: true } }) : [],
  ]);
  const actorNames = Object.fromEntries((await db.user.findMany({ where: { id: { in: history.map((h) => h.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const manage = can(user.role, "leads.manage");
  const visibleOffers = isCustomer ? lead.offers.filter((o) => o.status !== "DRAFT") : lead.offers;
  const contract = lead.contracts.find((c) => c.status !== "CANCELLED");
  const lastOffer = lead.offers[0];
  const utm = (lead.utm ?? {}) as Record<string, string>;

  return (
    <>
      <PageHeader
        back={{ href: "/cabinet/leads", label: "К заявкам" }}
        title={`Заявка №${lead.number}`}
        subtitle={lead.title}
        actions={<StatusBadge map={LEAD_STATUS} value={lead.status} />}
      />
      {lead.project && (
        <div className="mb-5">
          <Alert tone="success">
            По заявке создан{" "}
            <Link className="underline" href={`/cabinet/projects/${lead.project.id}`}>
              проект №{lead.project.number}
            </Link>
            .
          </Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card title="Карточка заказчика и заявки">
            <DefList
              items={[
                ["Контактное лицо", lead.contactName],
                ["Компания", lead.companyName],
                ["Почта", lead.email ?? (isCustomer ? null : "не указана — нужна для договора")],
                ["Телефон", lead.phone],
                ["Тип объекта", lead.objectType],
                ["Бюджет", lead.budget],
                ["Источник", LEAD_SOURCE[lead.source]],
                ["Создана", fmtDateTime(lead.createdAt)],
                ...(!isCustomer
                  ? ([
                      ["UTM", Object.keys(utm).length ? Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(", ") : "—"],
                      ["Переход с", lead.referrer],
                      ["Кабинет заказчика", lead.customer ? `${lead.customer.name} (${lead.customer.status === "INVITED" ? "приглашён" : "активен"})` : "не создан"],
                    ] as [string, string | null][])
                  : []),
              ]}
            />
            {lead.description && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-steel-50 p-3 text-sm">{lead.description}</p>}
            {manage && lead.status !== "won" && (
              <details className="mt-4 rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">Изменить контакты</summary>
                <ActionForm action={updateLeadContactsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <Field name="title" label="Что нужно спроектировать *" defaultValue={lead.title} className="sm:col-span-2" />
                  <Field name="contactName" label="Контактное лицо *" defaultValue={lead.contactName} />
                  <Field name="companyName" label="Компания" defaultValue={lead.companyName ?? ""} />
                  <Field name="email" label="Почта" type="email" defaultValue={lead.email ?? ""} />
                  <Field name="phone" label="Телефон" defaultValue={lead.phone ?? ""} />
                  <div className="sm:col-span-2">
                    <SubmitButton size="sm">Сохранить</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card
            title="Техническое задание"
            actions={
              lead.spec ? (
                <Link href={`/cabinet/specs/${lead.spec.id}`} className={btnClass("secondary", "sm")}>
                  Открыть ТЗ
                </Link>
              ) : (
                <form action={ensureSpecAction}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <button className={btnClass("secondary", "sm")}>Создать ТЗ</button>
                </form>
              )
            }
          >
            {lead.spec ? (
              <p className="text-sm">
                Статус: <StatusBadge map={SPEC_STATUS} value={lead.spec.status} /> · версия {lead.spec.currentVersion}
                {lead.spec.status === "CLARIFICATION" && lead.spec.clarification && <span className="mt-2 block text-warning-700">Нужны уточнения: {lead.spec.clarification}</span>}
              </p>
            ) : (
              <p className="text-sm text-muted">ТЗ ещё не создано.</p>
            )}
          </Card>

          <Card title="Коммерческие предложения">
            {visibleOffers.length === 0 ? (
              <p className="text-sm text-muted">Предложений пока нет.</p>
            ) : (
              <ul className="divide-y divide-line">
                {visibleOffers.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <a href={`/api/offers/${o.id}/pdf`} target="_blank" rel="noopener" className="font-medium text-accent-700 hover:underline">
                        КП №{o.number} (версия {o.version}) · {o.fileId ? "файл" : "PDF"}
                      </a>
                      <p className="text-xs text-muted">
                        {rub(o.total)} · {o.termDays} раб. дн. · действует до {fmtDate(o.validUntil)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge map={OFFER_STATUS} value={o.status} />
                      {!isCustomer && o.status === "DRAFT" && <OfferBtn id={o.id} status="SENT" label="Отправить заказчику" />}
                      {isCustomer && o.status === "SENT" && (
                        <>
                            <OfferBtn id={o.id} status="ACCEPTED" label="Принять" />
                            <OfferBtn id={o.id} status="REJECTED" label="Отклонить" variant="secondary" />
                          </>
                        )}
                      </div>
                      {can(user.role, "offers.manage") && (
                        <ActionForm action={deleteOfferAction}>
                          <input type="hidden" name="offerId" value={o.id} />
                          <ConfirmSubmit title={`Удалить КП №${o.number}?`} text="КП будет удалено из заявки без возможности восстановления. Загруженный файл останется в файлах заявки.">
                            Удалить
                          </ConfirmSubmit>
                        </ActionForm>
                      )}
                      {can(user.role, "offers.manage") && o.status !== "ACCEPTED" && !o.fileId && (
                        <details className="w-full rounded-lg border border-line p-3">
                          <summary className="cursor-pointer text-sm">Изменить КП</summary>
                          <div className="mt-3">
                            <OfferBuilder
                              leadId={lead.id}
                              offer={{ id: o.id, items: o.items as unknown as { title: string; qty: number; unit: string; price: number }[], termDays: o.termDays, validDays: Math.max(1, Math.round((o.validUntil.getTime() - Date.now()) / 86400_000)), notes: o.notes }}
                            />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {can(user.role, "offers.manage") && !["won", "lost"].includes(lead.status) && (
                <>
                <details className="mt-4 rounded-lg border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium">Сформировать коммерческое предложение</summary>
                  <div className="mt-3">
                    <OfferBuilder leadId={lead.id} />
                  </div>
                </details>
                <details className="mt-3 rounded-lg border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium">Загрузить готовое КП (PDF / Word)</summary>
                  <ActionForm action={uploadOfferAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <UploadField name="file" label="Файл КП *" accept=".pdf,.docx,.doc,.xlsx" className="sm:col-span-2" />
                    <NumField name="total" label="Сумма, ₽ *" defaultValue={lastOffer?.total} />
                    <NumField name="termDays" label="Срок, раб. дн. *" defaultValue={lastOffer?.termDays ?? 15} />
                    <NumField name="validDays" label="Действует, дн." defaultValue={10} />
                    <div className="flex items-end">
                      <SubmitButton size="sm" pendingText="Загружаем…">
                        Загрузить КП
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              </>
            )}
          </Card>

          <Card title="Договор">
            {contract ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <Link href={`/cabinet/contracts/${contract.id}`} className="font-medium text-accent-700 hover:underline">
                  Договор {contract.number} · {rub(contract.amount)} · {contract.termDays} раб. дн.
                </Link>
                <span className="flex items-center gap-2">
                  <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
                  {can(user.role, "contracts.manage") && !lead.project && (contract.status !== "SIGNED" || user.role === "DIRECTOR") && (
                    <ActionForm action={deleteContractAction}>
                      <input type="hidden" name="contractId" value={contract.id} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <ConfirmSubmit title={`Удалить договор ${contract.number}?`} text="Договор и все его редакции будут удалены без возможности восстановления, заявка вернётся в «Коммерческое предложение». В журнале останется запись.">
                        Удалить
                      </ConfirmSubmit>
                    </ActionForm>
                  )}
                </span>
              </div>
            ) : can(user.role, "contracts.manage") && !["won", "lost"].includes(lead.status) ? (
              <>
                <ContractCreator leadId={lead.id} defaultAmount={lastOffer?.total ?? 100000} defaultTerm={lastOffer?.termDays ?? 20} />
                <details className="mt-4 rounded-lg border border-line p-3">
                  <summary className="cursor-pointer text-sm font-medium">Загрузить готовый договор (PDF / Word)</summary>
                  <ActionForm action={uploadContractAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <UploadField name="file" label="Файл договора *" accept=".pdf,.docx,.doc" className="sm:col-span-2" />
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-muted">Номер договора</span>
                      <input name="number" placeholder="Пусто — присвоится автоматически" className={fieldClass} />
                      <FieldError name="number" />
                    </label>
                    <NumField name="amount" label="Сумма, ₽ *" defaultValue={lastOffer?.total} />
                    <NumField name="termDays" label="Срок, раб. дн. *" defaultValue={lastOffer?.termDays ?? 20} />
                    <label className="flex items-start gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" name="signed" className="mt-0.5" />
                      <span>Договор уже подписан (на бумаге или по ЭДО) — сразу создать проект. Иначе заказчик подпишет его в кабинете кодом из письма.</span>
                    </label>
                    <div className="sm:col-span-2">
                      <SubmitButton size="sm" pendingText="Загружаем…">
                        Загрузить договор
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              </>
            ) : (
              <p className="text-sm text-muted">Договор ещё не сформирован.</p>
            )}
            {contract?.status === "SIGNED" && !lead.project && can(user.role, "projects.create") && (
              <ActionForm action={convertLeadAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <input type="hidden" name="leadId" value={lead.id} />
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-muted">Руководитель проекта</span>
                  <select name="managerId" className={fieldClass}>
                    {pms.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton pendingText="Создаём проект…">Создать проект и передать РП</SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card title="Файлы">
            <FileList files={lead.files} canDelete={(f) => f.uploadedById === user.id} />
            <div className="mt-4">
              <FileUploader target={{ leadId: lead.id }} categories={[{ value: "SOURCE", label: "Исходные данные" }, { value: "TZ", label: "Готовое ТЗ (файл)" }, { value: "PHOTO", label: "Фотографии" }, { value: "DRAWING", label: "Чертежи" }, { value: "DOCUMENT", label: "Документы" }]} allowInternal={!isCustomer} />
            </div>
          </Card>

          <Card title="Комментарии">
            <CommentList comments={lead.comments} />
            <ActionForm action={leadCommentAction} resetOnSuccess className="mt-4 space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <label htmlFor="body" className="sr-only">
                Комментарий
              </label>
              <textarea id="body" name="body" rows={3} required className={fieldClass} placeholder={isCustomer ? "Вопрос или уточнение для менеджера" : "Комментарий"} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!isCustomer ? (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="internal" /> Внутренний (не виден заказчику)
                  </label>
                ) : (
                  <span />
                )}
                <SubmitButton size="sm" pendingText="Отправка…">
                  Отправить
                </SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          {manage && (
            <Card title="Управление">
              <ActionForm action={leadStatusAction} className="space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <label htmlFor="status" className="block text-xs text-muted">
                  Статус
                </label>
                <select id="status" name="status" defaultValue={lead.status} className={fieldClass}>
                  {Object.entries(LEAD_STATUS)
                    .filter(([k]) => k !== "won" && k !== "qualification")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                </select>
                <input name="reason" placeholder="Комментарий (для отказа — обязательно)" className={fieldClass} aria-label="Комментарий к смене статуса" />
                <SubmitButton size="sm" variant="secondary">
                  Изменить статус
                </SubmitButton>
              </ActionForm>
              <ActionForm action={leadAssignAction} className="mt-5 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="leadId" value={lead.id} />
                <label htmlFor="managerId" className="block text-xs text-muted">
                  Ответственный менеджер
                </label>
                <select id="managerId" name="managerId" defaultValue={lead.managerId ?? ""} className={fieldClass}>
                  <option value="" disabled>
                    Не назначен
                  </option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <SubmitButton size="sm" variant="secondary">
                  Назначить
                </SubmitButton>
              </ActionForm>
              {!lead.project && (
                <ActionForm action={deleteLeadAction} className="mt-5 space-y-2 border-t border-line pt-4">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <label htmlFor="deleteReason" className="block text-xs text-muted">
                    Удаление ошибочной или неактуальной заявки
                  </label>
                  <input id="deleteReason" name="reason" required minLength={3} placeholder="Причина удаления" className={fieldClass} />
                  <ConfirmSubmit title="Удалить заявку?" text="Заявка, её КП, ТЗ, комментарии, задачи, файлы и неподписанный договор будут удалены без возможности восстановления. В журнале останется запись об удалении.">
                    Удалить заявку
                  </ConfirmSubmit>
                </ActionForm>
              )}
            </Card>
          )}
          {!isCustomer && (
            <Card title="Задачи">
              {lead.tasks.length === 0 ? (
                <p className="text-sm text-muted">Задач нет.</p>
              ) : (
                <ul className="space-y-2">
                  {lead.tasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm">
                      <form action={toggleTaskAction}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <button aria-label={t.doneAt ? "Вернуть в работу" : "Отметить выполненной"} className="mt-0.5 grid size-5 place-items-center rounded border border-line-strong text-xs">
                          {t.doneAt ? "✓" : ""}
                        </button>
                      </form>
                      <span className={t.doneAt ? "text-muted line-through" : ""}>
                        {t.title}
                        <span className="block text-xs text-muted">
                          {t.assignee?.name} · до {fmtDate(t.dueAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {manage && (
                <ActionForm action={leadTaskAction} resetOnSuccess className="mt-4 space-y-2 border-t border-line pt-4">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input name="title" placeholder="Новая задача" className={fieldClass} aria-label="Задача" />
                  <input name="dueAt" type="date" className={fieldClass} aria-label="Срок" />
                  <SubmitButton size="sm" variant="secondary">
                    Добавить
                  </SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
          <Card title="История статусов">
            <History items={history.map((h) => ({ ...h, actorName: h.actorId ? actorNames[h.actorId] : null }))} labels={LEAD_STATUS} />
          </Card>
        </div>
      </div>
    </>
  );
}

function OfferBtn({ id, status, label, variant = "primary" }: { id: string; status: string; label: string; variant?: "primary" | "secondary" }) {
  return (
    <ActionForm action={offerStatusAction}>
      <input type="hidden" name="offerId" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

function Field({ name, label, type = "text", defaultValue, className }: { name: string; label: string; type?: string; defaultValue: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={`lead-${name}`} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      <input id={`lead-${name}`} name={name} type={type} defaultValue={defaultValue} className={fieldClass} />
      <FieldError name={name} />
    </div>
  );
}

function UploadField({ name, label, accept, className }: { name: string; label: string; accept: string; className?: string }) {
  return (
    <label className={`text-sm ${className ?? ""}`}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input name={name} type="file" required accept={accept} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      <FieldError name={name} />
    </label>
  );
}

function NumField({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input name={name} type="number" min={1} defaultValue={defaultValue} className={fieldClass} />
      <FieldError name={name} />
    </label>
  );
}
