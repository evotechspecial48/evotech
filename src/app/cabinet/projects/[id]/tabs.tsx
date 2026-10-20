import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AUDIT_LABELS } from "@/lib/audit";
import { can } from "@/domain/rbac";
import { AI_JOB_STATUS, CONTRACT_STATUS, REQUEST_STATUS, STAGE_STATUS, VERSION_STATUS } from "@/domain/labels";
import { availableActions, STAGES, type StageStatusT } from "@/domain/stage";
import { formatDuration } from "@/domain/timer";
import type { loadProjectAccess } from "@/services/scope";
import { CUSTOMER_VISIBLE_VERSION, customerSeesVersion, verifyVersionIntegrity } from "@/services/stages";
import {
  answerRequestAction,
  assignTeamAction,
  cancelRequestAction,
  createRequestAction,
  deletePauseAction,
  projectCommentAction,
  projectStatusAction,
  retryJobAction,
  selectProjectVariantAction,
  startProjectVariantsAction,
  timerPauseAction,
  timerResumeAction,
  timerStartAction,
  timerUpdateAction,
} from "@/app/actions/cabinet";
import { ActionForm, AutoRefresh, ConfirmSubmit, FileUploader, SubmitButton } from "@/components/client";
import { CommentList, FileList, History } from "@/components/cabinet/shared";
import { StageActions, VersionUploader } from "@/components/cabinet/stage-widgets";
import { TimerSummary } from "@/components/cabinet/timer-card";
import { Alert, Badge, btnClass, Card, DefList, EmptyState, fieldClass, fmtDate, fmtDateTime, rub, StatusBadge, Table } from "@/components/ui";

type Ctx = { user: SessionUser; access: Awaited<ReturnType<typeof loadProjectAccess>>; projectId: string };

const STAGE_FILE_CATEGORY: Record<string, string> = { brief: "SOURCE", sketch: "SKETCH", model: "MODEL", drawings: "DRAWING", documentation: "SPECIFICATION", delivery: "DOCUMENT" };

// ---------- Обзор ----------

export async function OverviewTab({ user, access, projectId }: Ctx) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      customer: { include: { company: true } },
      manager: true,
      salesManager: true,
      members: { include: { user: true } },
      contracts: { orderBy: { createdAt: "desc" } },
      timer: { include: { pauses: { orderBy: { startedAt: "desc" } } } },
    },
  });
  const manage = access.canManage;
  const [pms, designers] = manage
    ? await Promise.all([
        db.user.findMany({ where: { role: { in: ["PROJECT_MANAGER", "DIRECTOR"] }, status: "ACTIVE" }, select: { id: true, name: true } }),
        db.user.findMany({ where: { role: "DESIGNER", status: "ACTIVE" }, select: { id: true, name: true, position: true } }),
      ])
    : [[], []];
  const people = Object.fromEntries((await db.user.findMany({ where: { id: { in: project.timer?.pauses.flatMap((p) => [p.initiatorId, p.resumedById]).filter((x): x is string => !!x) ?? [] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const timer = project.timer;
  const manualOpen = timer?.pauses.some((p) => !p.endedAt && p.kind === "MANUAL");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <Card title="Срок проекта">
          <TimerSummary projectId={projectId} />
          {manage && timer && (
            <div className="mt-5 space-y-4 border-t border-line pt-4">
              {!timer.startedAt ? (
                <ActionForm action={timerStartAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <SubmitButton size="sm">Запустить таймер</SubmitButton>
                </ActionForm>
              ) : manualOpen ? (
                <ActionForm action={timerResumeAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input name="note" placeholder="Комментарий к возобновлению" className={`${fieldClass} sm:max-w-xs`} aria-label="Комментарий" />
                  <SubmitButton size="sm">Возобновить отсчёт</SubmitButton>
                </ActionForm>
              ) : (
                !timer.completedAt && (
                  <ActionForm action={timerPauseAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input name="reason" required placeholder="Причина остановки (обязательно)" className={`${fieldClass} sm:max-w-xs`} aria-label="Причина остановки" />
                    <SubmitButton size="sm" variant="secondary">
                      Остановить вручную
                    </SubmitButton>
                  </ActionForm>
                )
              )}
              <details className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">Изменить договорные сроки</summary>
                <ActionForm action={timerUpdateAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Срок, дней</span>
                    <input name="durationDays" type="number" min={1} defaultValue={timer.durationDays} className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Режим</span>
                    <select name="mode" defaultValue={timer.mode} className={fieldClass}>
                      <option value="WORKING">Рабочие дни</option>
                      <option value="CALENDAR">Календарные дни</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Дата начала</span>
                    <input name="startedAt" type="date" defaultValue={timer.startedAt?.toISOString().slice(0, 10)} className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Основание (обязательно)</span>
                    <input name="reason" required placeholder="Доп. соглашение №…" className={fieldClass} />
                  </label>
                  <div className="sm:col-span-2">
                    <SubmitButton size="sm" variant="secondary">
                      Сохранить сроки
                    </SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </div>
          )}
        </Card>
        <Card title="История пауз">
          {!timer?.pauses.length ? (
            <p className="text-sm text-muted">Пауз не было.</p>
          ) : (
            <Table head={["Причина", "Начало", "Окончание", "Длительность", "Инициатор", ""]}>
              {timer.pauses.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.reason}
                    <span className="block text-xs text-muted">{p.kind === "AUTO" ? "автоматически" : "вручную"}</span>
                  </td>
                  <td className="whitespace-nowrap">{fmtDateTime(p.startedAt)}</td>
                  <td className="whitespace-nowrap">{p.endedAt ? fmtDateTime(p.endedAt) : <Badge tone="warning">идёт</Badge>}</td>
                  <td className="whitespace-nowrap">{formatDuration((p.endedAt ?? new Date()).getTime() - p.startedAt.getTime())}</td>
                  <td>{p.initiatorId ? people[p.initiatorId] : "—"}</td>
                  <td>
                    {can(user.role, "timer.delete_pause") && (
                      <ActionForm action={deletePauseAction} className="flex gap-1">
                        <input type="hidden" name="pauseId" value={p.id} />
                        <input name="reason" placeholder="Основание" className="w-28 rounded border border-line-strong px-2 py-1 text-xs" aria-label="Основание удаления" />
                        <ConfirmSubmit title="Удалить запись о паузе?" text="Действие доступно только администратору и записывается в журнал. Время паузы будет учтено в сроке.">
                          Удалить
                        </ConfirmSubmit>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Участники">
          <DefList
            items={[
              ["Заказчик", `${project.customer.name}${project.customer.company ? `, ${project.customer.company.name}` : ""}`],
              ["Руководитель проекта", project.manager?.name ?? "не назначен"],
              ["Менеджер проектов", project.salesManager?.name],
              ["Проектировщики", project.members.map((m) => m.user.name).join(", ") || "не назначены"],
              // Оплата исполнителей — только для руководителя проекта и директора
              ...(manage && project.members.some((m) => m.fee || m.advance)
                ? ([["Оплата исполнителям", project.members.map((m) => `${m.user.name}: ${rub(m.fee)}${m.advance ? `, аванс ${rub(m.advance)}` : ""}`).join("; ")]] as [string, string][])
                : []),
            ]}
          />
          {manage && (
            <details className="mt-4 rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium">Назначить команду</summary>
              <ActionForm action={assignTeamAction} className="mt-3 space-y-3">
                <input type="hidden" name="projectId" value={projectId} />
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">Руководитель проекта</span>
                  <select name="managerId" defaultValue={project.managerId ?? ""} className={fieldClass}>
                    <option value="">Не назначен</option>
                    {pms.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend className="mb-1 text-xs text-muted">Проектировщики</legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {designers.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="designerIds" value={d.id} defaultChecked={access.info.memberIds.includes(d.id)} />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <SubmitButton size="sm">Сохранить команду</SubmitButton>
              </ActionForm>
            </details>
          )}
        </Card>
        <Card title="Договор">
          {project.contracts.length === 0 ? (
            <p className="text-sm text-muted">Договор не привязан.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {project.contracts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/cabinet/contracts/${c.id}`} className="text-accent-700 hover:underline">
                    {c.number} · {rub(c.amount)} · {c.termDays} дн.
                  </Link>
                  <span className="flex items-center gap-2">
                    <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                    {c.signedAt && <span className="text-xs text-muted">подписан {fmtDate(c.signedAt)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {manage && (
          <Card title="Статус проекта">
            <ActionForm action={projectStatusAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <select name="status" defaultValue={project.status === "COMPLETED" ? "ACTIVE" : project.status} className={`${fieldClass} sm:max-w-[180px]`} aria-label="Статус">
                <option value="ACTIVE">В работе</option>
                <option value="ON_HOLD">Приостановлен</option>
                <option value="CANCELLED">Отменён</option>
              </select>
              <input name="comment" required placeholder="Причина" className={`${fieldClass} sm:max-w-xs`} aria-label="Причина" />
              <SubmitButton size="sm" variant="secondary">
                Изменить
              </SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------- Этапы ----------

export async function StagesTab({ user, access, projectId }: Ctx) {
  const stages = await db.projectStage.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: {
      assignee: { select: { name: true } },
      versions: {
        orderBy: { version: "desc" },
        include: {
          files: { where: { deletedAt: null } },
          approvals: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  const names = Object.fromEntries(
    (await db.user.findMany({ where: { id: { in: stages.flatMap((s) => s.versions.flatMap((v) => [v.createdById, ...v.approvals.map((a) => a.userId)])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const spec = await db.technicalSpecification.findUnique({ where: { projectId }, select: { id: true } });
  const integrity = Object.fromEntries(await Promise.all(stages.flatMap((s) => s.versions.filter((v) => v.lockedAt && v.checksum !== "seed").map(async (v) => [v.id, await verifyVersionIntegrity(v.id)] as const))));
  const actor = access.actorKind;
  return (
    <ol className="space-y-5">
      {stages.map((s, idx) => {
        const def = STAGES[idx];
        const versions = user.role === "CUSTOMER" ? s.versions.filter(customerSeesVersion) : s.versions;
        const actions = actor && s.code !== "brief" ? availableActions(s.status as StageStatusT, actor) : [];
        const canUpload = actions.includes("upload_version") && (!s.versions[0] || !["INTERNAL_REVIEW", "CUSTOMER_REVIEW"].includes(s.versions[0].status));
        return (
          <li key={s.id}>
            <Card
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-steel-900 font-mono text-xs text-white">{s.order}</span>
                  {s.title}
                </span>
              }
              actions={<StatusBadge map={STAGE_STATUS} value={s.status} />}
            >
              <p className="text-xs text-muted">
                Объект согласования: {def?.approvalObject} · исполнитель: {s.assignee?.name ?? "—"} · начат {fmtDate(s.startedAt)}
                {s.completedAt && ` · завершён ${fmtDate(s.completedAt)}`}
              </p>
              {s.code === "brief" ? (
                <p className="mt-3 text-sm">
                  Этап завершается утверждением ТЗ.{" "}
                  {spec && (
                    <Link href={`/cabinet/specs/${spec.id}`} className="text-accent-700 underline">
                      Открыть ТЗ
                    </Link>
                  )}
                </p>
              ) : (
                <>
                  {versions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">Версий результата пока нет.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {versions.map((v) => (
                        <li key={v.id} className={`rounded-lg border p-3 ${v.id === s.versions[0]?.id ? "border-accent-100 bg-accent-50/40" : "border-line"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              Версия {v.version}
                              {v.previousVersionId && <span className="ml-1 text-xs font-normal text-muted">(на основе версии {v.version - 1})</span>}
                            </p>
                            <div className="flex items-center gap-2">
                              {v.lockedAt && <Badge tone="success">🔒 Зафиксирована</Badge>}
                              {v.lockedAt && integrity[v.id] === false && <Badge tone="danger">Нарушена целостность</Badge>}
                              <StatusBadge map={VERSION_STATUS} value={v.status} />
                            </div>
                          </div>
                          <p className="mt-1 text-sm">{v.description}</p>
                          <p className="text-xs text-muted">
                            {names[v.createdById]} · {fmtDateTime(v.createdAt)}
                          </p>
                          <div className="mt-2">
                            <FileList files={v.files} />
                          </div>
                          {v.approvals.length > 0 && (
                            <ol className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
                              {v.approvals
                                .filter((a) => user.role !== "CUSTOMER" || a.kind === "CUSTOMER")
                                .map((a) => (
                                  <li key={a.id}>
                                    <span className="text-muted">{fmtDateTime(a.createdAt)}</span> · {names[a.userId]} ·{" "}
                                    <span className={a.decision === "CHANGES_REQUESTED" ? "text-danger-700" : a.decision === "APPROVED" ? "text-success-700" : ""}>
                                      {a.kind === "INTERNAL" ? (a.decision === "SUBMITTED" ? "отправлено на внутреннюю проверку" : a.decision === "APPROVED" ? "внутренняя проверка пройдена" : "возвращено на доработку") : a.decision === "APPROVED" ? "согласовано заказчиком" : "замечания заказчика"}
                                    </span>
                                    {a.comment && <span>: «{a.comment}»</span>}
                                  </li>
                                ))}
                            </ol>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 space-y-3">
                    <StageActions stageId={s.id} actions={actions} />
                    {canUpload && <VersionUploader stageId={s.id} projectId={projectId} stageCode={s.code} category={STAGE_FILE_CATEGORY[s.code]} />}
                  </div>
                </>
              )}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Запросы ----------

export async function RequestsTab({ user, access, projectId }: Ctx) {
  const requests = await db.customerRequest.findMany({ where: { projectId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: requests.flatMap((r) => [r.authorId, r.answeredById]).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const isCustomer = user.role === "CUSTOMER";
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card title="Запросы заказчику">
        {requests.length === 0 ? (
          <EmptyState title="Запросов нет" />
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge map={REQUEST_STATUS} value={r.status} />
                  <span className="text-xs text-muted">
                    {names[r.authorId]} · {fmtDateTime(r.createdAt)}
                    {r.pausesTimer && r.status === "OPEN" && " · таймер на паузе"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.question}</p>
                {r.answer && (
                  <div className="mt-3 rounded-lg bg-success-50 p-3 text-sm">
                    <p className="text-xs text-success-700">
                      Ответ · {r.answeredById ? names[r.answeredById] : ""} · {fmtDateTime(r.answeredAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                  </div>
                )}
                {r.status === "OPEN" && (isCustomer || access.canManage) && (
                  <ActionForm action={answerRequestAction} className="mt-3 space-y-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <textarea name="answer" rows={2} required className={fieldClass} placeholder="Ваш ответ (файлы приложите во вкладке «Файлы»)" aria-label="Ответ" />
                    <SubmitButton size="sm">Ответить</SubmitButton>
                  </ActionForm>
                )}
                {r.status === "OPEN" && !isCustomer && (access.canManage || r.authorId === user.id) && (
                  <form action={cancelRequestAction} className="mt-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <button className="text-xs text-muted underline">Отменить запрос</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {!isCustomer && access.actorKind && (
        <Card title="Новый запрос заказчику">
          <ActionForm action={createRequestAction} resetOnSuccess className="space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <label htmlFor="question" className="block text-sm font-medium text-ink-soft">
              Что требуется от заказчика
            </label>
            <textarea id="question" name="question" rows={4} required className={fieldClass} placeholder="Сведения, файлы или подтверждение" />
            <select name="stageCode" className={fieldClass} aria-label="Этап">
              <option value="">Без привязки к этапу</option>
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.title}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pausesTimer" defaultChecked /> Остановить таймер до получения ответа
            </label>
            <SubmitButton>Отправить запрос</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

// ---------- Комментарии ----------

export async function CommentsTab({ user, access, projectId }: Ctx) {
  const comments = await db.comment.findMany({
    where: { projectId, ...(user.role === "CUSTOMER" ? { internal: false } : {}) },
    include: { author: { select: { name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
  const participants = await db.user.findMany({ where: { id: { in: [access.info.customerId, access.info.managerId, ...access.info.memberIds].filter((x): x is string => !!x) } }, select: { name: true } });
  return (
    <Card title="Обсуждение проекта">
      <CommentList comments={comments} />
      <ActionForm action={projectCommentAction} resetOnSuccess className="mt-5 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        <label htmlFor="cbody" className="sr-only">
          Комментарий
        </label>
        <textarea id="cbody" name="body" rows={3} required className={fieldClass} placeholder="Комментарий. Упомяните участника через @Имя Фамилия" />
        <p className="text-xs text-muted">Участники: {participants.map((p) => `@${p.name}`).join(", ")}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {user.role !== "CUSTOMER" ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="internal" /> Внутренний (не виден заказчику)
            </label>
          ) : (
            <span />
          )}
          <SubmitButton size="sm">Отправить</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

// ---------- Файлы ----------

export async function FilesTab({ user, access, projectId }: Ctx) {
  const files = await db.fileAsset.findMany({
    where: { projectId, deletedAt: null, ...(user.role === "CUSTOMER" ? { internal: false, OR: [{ stageVersionId: null }, { stageVersion: CUSTOMER_VISIBLE_VERSION }] } : {}) },
    include: { stageVersion: { select: { version: true, lockedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const uploaders = Object.fromEntries((await db.user.findMany({ where: { id: { in: files.map((f) => f.uploadedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u]));
  const required = ["sketch", "model", "drawings", "documentation"];
  const stagesWithFiles = new Set(files.filter((f) => f.stageVersionId).map((f) => f.stageCode));
  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <Card title={`Файлы проекта (${files.length})`}>
        <FileList files={files.map((f) => ({ ...f, uploadedBy: f.uploadedById ? uploaders[f.uploadedById] : null }))} canDelete={(f) => !f.stageVersionId && (f.uploadedById === user.id || access.canManage)} />
        <div className="mt-4">
          <FileUploader
            target={{ projectId }}
            allowInternal={user.role !== "CUSTOMER"}
            categories={[
              { value: "SOURCE", label: "Исходные данные" },
              { value: "PHOTO", label: "Фотографии" },
              { value: "DRAWING", label: "Чертежи" },
              { value: "DOCUMENT", label: "Документы" },
              { value: "OTHER", label: "Прочее" },
            ]}
          />
        </div>
      </Card>
      <Card title="Контроль обязательных результатов">
        <ul className="space-y-2 text-sm">
          {STAGES.filter((s) => required.includes(s.code)).map((s) => (
            <li key={s.code} className="flex items-center justify-between gap-2">
              <span>{s.approvalObject}</span>
              {stagesWithFiles.has(s.code) ? <Badge tone="success">Есть версия</Badge> : <Badge tone="neutral">Нет файлов</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------- Варианты AI ----------

export async function VariantsTab({ user, access, projectId }: Ctx) {
  const jobs = await db.aIJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, include: { variants: true }, take: 3 });
  const job = jobs[0];
  const running = job && ["queued", "processing"].includes(job.status);
  return (
    <div className="space-y-5">
      <AutoRefresh active={!!running} />
      <Alert tone="info" title="Демонстрационный режим">
        Варианты конструкции по утверждённому ТЗ формирует демонстрационный AI-провайдер. После подключения Claude API здесь появятся реальные предложения.
      </Alert>
      {access.canManage && (
        <ActionForm action={startProjectVariantsAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <SubmitButton disabled={!!running} pendingText="Запуск…">
            {job ? "Сгенерировать заново" : "Сгенерировать варианты по ТЗ"}
          </SubmitButton>
        </ActionForm>
      )}
      {!job ? (
        <EmptyState title="Варианты ещё не формировались" />
      ) : (
        <Card title="Последняя задача" actions={<StatusBadge map={AI_JOB_STATUS} value={job.status} />}>
          {running && <p className="text-sm text-muted">Генерация выполняется… страница обновится автоматически.</p>}
          {job.status === "failed" && (
            <div className="space-y-2">
              <Alert tone="danger">{job.error}</Alert>
              {access.canManage && (
                <ActionForm action={retryJobAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <SubmitButton size="sm">Повторить</SubmitButton>
                </ActionForm>
              )}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            {job.variants.map((v) => (
              <article key={v.id} className={`rounded-lg border p-3 ${v.status === "SELECTED" ? "border-success-700" : "border-line"}`}>
                <div className="overflow-hidden rounded border border-line bg-white" dangerouslySetInnerHTML={{ __html: v.imageSvg }} />
                <h3 className="mt-2 font-semibold">{v.title}</h3>
                <p className="text-sm text-muted">{v.description}</p>
                {v.status === "SELECTED" ? (
                  <Badge tone="success" className="mt-2">
                    Выбран заказчиком
                  </Badge>
                ) : (
                  user.role === "CUSTOMER" &&
                  job.status === "awaiting_selection" && (
                    <ActionForm action={selectProjectVariantAction} className="mt-2">
                      <input type="hidden" name="variantId" value={v.id} />
                      <SubmitButton size="sm">Выбрать этот вариант</SubmitButton>
                    </ActionForm>
                  )
                )}
              </article>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Лента событий ----------

export async function HistoryTab({ user, projectId }: Ctx) {
  const [changes, events] = await Promise.all([
    db.statusChange.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 100 }),
    user.role === "CUSTOMER" ? Promise.resolve([]) : db.auditEvent.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const ids = [...changes.map((c) => c.actorId), ...events.map((e) => e.actorId)].filter((x): x is string => !!x);
  const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Изменения статусов">
        <History items={changes.map((c) => ({ ...c, actorName: c.actorId ? names[c.actorId] : null }))} labels={{ ...STAGE_STATUS, ACTIVE: { label: "В работе" }, ON_HOLD: { label: "Приостановлен" }, CANCELLED: { label: "Отменён" }, COMPLETED: { label: "Завершён" } }} />
      </Card>
      {user.role !== "CUSTOMER" && (
        <Card title="Журнал действий по проекту">
          {events.length === 0 ? (
            <p className="text-sm text-muted">Событий нет.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
                  <span>
                    {AUDIT_LABELS[e.action] ?? e.action}
                    {e.actorId && <span className="text-muted"> · {names[e.actorId]}</span>}
                  </span>
                  <span className="text-xs text-muted">{fmtDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/cabinet/audit?project=${projectId}`} className={`${btnClass("ghost", "sm")} mt-3`}>
            Подробнее в журнале
          </Link>
        </Card>
      )}
    </div>
  );
}
