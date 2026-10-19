"use client";

import { useState } from "react";
import { stageActionAction, uploadVersionAction } from "@/app/actions/cabinet";
import { STAGE_ACTION_LABELS, STAGE_RULES, type StageAction } from "@/domain/stage";
import { ActionForm, FileUploader, SubmitButton, type UploadedFile } from "../client";
import { fieldClass } from "../ui";

/** Загрузка новой версии результата этапа: файлы → описание → создание версии. */
export function VersionUploader({ stageId, projectId, stageCode, category }: { stageId: string; projectId: string; stageCode: string; category: string }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-medium">Новая версия результата</p>
      <FileUploader target={{ projectId, stageCode }} categories={[{ value: category, label: "Результат этапа" }]} refreshOnDone={false} onUploaded={(f) => setFiles((p) => [...p, ...f])} label="Прикрепить файлы" />
      {files.length === 0 && <p className="text-xs text-muted">Сначала прикрепите файлы результата.</p>}
      <ActionForm action={uploadVersionAction} className="space-y-2" resetOnSuccess>
        <input type="hidden" name="stageId" value={stageId} />
        <input type="hidden" name="fileIds" value={files.map((f) => f.id).join(",")} />
        <label htmlFor={`desc-${stageId}`} className="block text-xs text-muted">
          Что сделано / изменено
        </label>
        <textarea id={`desc-${stageId}`} name="description" rows={2} className={fieldClass} required />
        <SubmitButton size="sm" disabled={!files.length} pendingText="Создаём версию…">
          Создать версию
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

/** Кнопки допустимых действий по этапу; для действий с обязательным комментарием — поле ввода. */
export function StageActions({ stageId, actions }: { stageId: string; actions: StageAction[] }) {
  const [active, setActive] = useState<StageAction | null>(null);
  const simple = actions.filter((a) => a !== "upload_version" && !STAGE_RULES[a].commentRequired);
  const withComment = actions.filter((a) => STAGE_RULES[a].commentRequired);
  if (!simple.length && !withComment.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {simple.map((a) => (
          <ActionForm key={a} action={stageActionAction}>
            <input type="hidden" name="stageId" value={stageId} />
            <input type="hidden" name="action" value={a} />
            <SubmitButton size="sm" variant={a === "customer_approve" || a === "confirm_internal" ? "primary" : "secondary"} pendingText="…">
              {a === "customer_approve" ? "✓ " : ""}
              {STAGE_ACTION_LABELS[a]}
            </SubmitButton>
          </ActionForm>
        ))}
        {withComment.map((a) => (
          <button key={a} type="button" onClick={() => setActive(active === a ? null : a)} className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium hover:bg-steel-50" aria-expanded={active === a}>
            {STAGE_ACTION_LABELS[a]}
          </button>
        ))}
      </div>
      {active && (
        <ActionForm action={stageActionAction} className="space-y-2 rounded-lg border border-[#f5c2bf] bg-danger-50 p-3">
          <input type="hidden" name="stageId" value={stageId} />
          <input type="hidden" name="action" value={active} />
          <label htmlFor={`c-${stageId}`} className="block text-sm font-medium text-danger-700">
            Замечания (обязательно)
          </label>
          <textarea id={`c-${stageId}`} name="comment" rows={3} required className={fieldClass} placeholder="Опишите, что нужно исправить" />
          <SubmitButton size="sm" variant="danger">
            {STAGE_ACTION_LABELS[active]}
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
