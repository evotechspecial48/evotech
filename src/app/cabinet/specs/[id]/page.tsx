import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/page";
import { can } from "@/domain/rbac";
import { SPEC_STATUS } from "@/domain/labels";
import { SPEC_FIELDS, type SpecData } from "@/domain/spec";
import { getSpecForUser } from "@/services/specs";
import { saveSpecAction, specApproveAction, specClarifyAction } from "@/app/actions/cabinet";
import { ActionForm, ConfirmSubmit, FileUploader, SubmitButton } from "@/components/client";
import { FileList } from "@/components/cabinet/shared";
import { Alert, Badge, Card, fieldClass, fmtDateTime, PageHeader, StatusBadge } from "@/components/ui";

export default async function SpecPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const user = await requireUser(["spec.edit", "projects.view_assigned", "projects.view_all"]);
  const { spec, ctx } = await orNotFound(getSpecForUser(user, id));
  const versions = await db.technicalSpecificationVersion.findMany({ where: { specId: id }, orderBy: { version: "desc" } });
  const authors = Object.fromEntries((await db.user.findMany({ where: { id: { in: versions.map((x) => x.authorId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const viewing = v ? versions.find((x) => x.version === Number(v)) : null;
  const data = (viewing?.data ?? spec.data) as SpecData;
  const isCustomer = user.role === "CUSTOMER";
  const editable =
    !viewing && spec.status !== "APPROVED" && can(user.role, "spec.edit") && (isCustomer ? spec.status !== "SUBMITTED" : true);
  const files = await db.fileAsset.findMany({
    where: { deletedAt: null, category: { in: ["SOURCE", "PHOTO", "DRAWING"] }, ...(ctx.projectId ? { projectId: ctx.projectId } : { leadId: ctx.leadId }), ...(isCustomer ? { internal: false } : {}) },
    orderBy: { createdAt: "desc" },
  });
  const groups = [...new Set(SPEC_FIELDS.map((f) => f.group))];
  const labelOf = Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, f.label]));

  return (
    <>
      <PageHeader
        back={ctx.projectId ? { href: `/cabinet/projects/${ctx.projectId}`, label: "К проекту" } : ctx.leadId ? { href: `/cabinet/leads/${ctx.leadId}`, label: "К заявке" } : undefined}
        title="Техническое задание"
        subtitle={`${data.objectName || "Без названия"} · версия ${viewing?.version ?? spec.currentVersion}`}
        actions={<StatusBadge map={SPEC_STATUS} value={spec.status} />}
      />
      {viewing && (
        <div className="mb-5">
          <Alert tone="info" title={`Просмотр версии ${viewing.version}${viewing.isSnapshot ? " (утверждённый снимок)" : ""}`}>
            <Link href={`/cabinet/specs/${id}`} className="underline">
              Вернуться к текущей редакции
            </Link>
          </Alert>
        </div>
      )}
      {spec.status === "CLARIFICATION" && spec.clarification && (
        <div className="mb-5">
          <Alert tone="warning" title="Запрошены уточнения">
            {spec.clarification}
          </Alert>
        </div>
      )}
      {spec.status === "APPROVED" && (
        <div className="mb-5">
          <Alert tone="success" title="ТЗ утверждено">
            Утверждённая версия зафиксирована как неизменяемый снимок и используется для проектирования.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <ActionForm action={saveSpecAction} className="space-y-6">
            <input type="hidden" name="specId" value={spec.id} />
            {groups.map((g) => (
              <Card key={g} title={g}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {SPEC_FIELDS.filter((f) => f.group === g).map((f) => (
                    <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                      <label htmlFor={f.key} className="mb-1 block text-sm font-medium text-ink-soft">
                        {f.label}
                        {f.required && <span className="text-danger-700"> *</span>}
                      </label>
                      {f.type === "textarea" ? (
                        <textarea id={f.key} name={f.key} rows={3} defaultValue={data[f.key] ?? ""} disabled={!editable} className={fieldClass} />
                      ) : f.type === "select" ? (
                        <select id={f.key} name={f.key} defaultValue={data[f.key] ?? ""} disabled={!editable} className={fieldClass}>
                          <option value="">Не выбрано</option>
                          {f.options!.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input id={f.key} name={f.key} type={f.type === "date" ? "date" : "text"} defaultValue={data[f.key] ?? ""} disabled={!editable} className={fieldClass} />
                      )}
                      {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
            {editable && (
              <Card>
                <label htmlFor="changeNote" className="mb-1 block text-sm font-medium text-ink-soft">
                  Комментарий к изменениям
                </label>
                <input id="changeNote" name="changeNote" className={fieldClass} placeholder="Что изменено (сохраняется в истории версий)" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <SubmitButton name="intent" value="save">
                    Сохранить версию
                  </SubmitButton>
                  {["DRAFT", "CLARIFICATION"].includes(spec.status) && (
                    <SubmitButton name="intent" value="submit" variant="secondary" pendingText="Отправляем…">
                      Сохранить и отправить на проверку
                    </SubmitButton>
                  )}
                </div>
              </Card>
            )}
          </ActionForm>

          <Card title="Вложения: фото, схемы, исходные файлы">
            <FileList files={files} />
            {spec.status !== "APPROVED" && (
              <div className="mt-4">
                <FileUploader
                  target={ctx.projectId ? { projectId: ctx.projectId } : { leadId: ctx.leadId ?? undefined }}
                  categories={[
                    { value: "SOURCE", label: "Исходные данные" },
                    { value: "PHOTO", label: "Фотографии" },
                    { value: "DRAWING", label: "Чертежи и схемы" },
                  ]}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {!isCustomer && spec.status === "SUBMITTED" && (
            <Card title="Проверка ТЗ">
              <ActionForm action={specClarifyAction} className="space-y-2">
                <input type="hidden" name="specId" value={spec.id} />
                <label htmlFor="comment" className="block text-xs text-muted">
                  Что нужно уточнить у заказчика
                </label>
                <textarea id="comment" name="comment" rows={3} className={fieldClass} />
                <SubmitButton size="sm" variant="secondary">
                  Запросить уточнения
                </SubmitButton>
              </ActionForm>
              {can(user.role, "spec.approve") && (
                <ActionForm action={specApproveAction} className="mt-4 border-t border-line pt-4">
                  <input type="hidden" name="specId" value={spec.id} />
                  <ConfirmSubmit title="Утвердить ТЗ?" text="Будет создан неизменяемый снимок. Дальнейшие изменения — только через новую редакцию по согласованию." confirmText="Утвердить" variant="primary">
                    Утвердить ТЗ
                  </ConfirmSubmit>
                </ActionForm>
              )}
            </Card>
          )}
          <Card title="История версий">
            {versions.length === 0 ? (
              <p className="text-sm text-muted">Версий пока нет — сохраните ТЗ.</p>
            ) : (
              <ol className="space-y-3">
                {versions.map((ver) => (
                  <li key={ver.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/cabinet/specs/${id}?v=${ver.version}`} className="font-medium text-accent-700">
                        Версия {ver.version}
                      </Link>
                      {ver.isSnapshot && <Badge tone="success">Утверждённый снимок</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {authors[ver.authorId] ?? "—"} · {fmtDateTime(ver.createdAt)}
                    </p>
                    {ver.changeNote && <p className="mt-1">{ver.changeNote}</p>}
                    {ver.changedKeys.length > 0 && <p className="mt-1 text-xs text-muted">Изменено: {ver.changedKeys.map((k) => labelOf[k] ?? k).join(", ")}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
