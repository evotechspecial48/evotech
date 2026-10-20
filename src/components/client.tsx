"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/errors";
import { btnClass, cx } from "./ui";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const FormCtx = createContext<ActionState>(null);
const PendingCtx = createContext<boolean | null>(null);

/**
 * Форма серверного действия: блокировка кнопки на время отправки, сообщения об успехе и ошибке,
 * ошибки полей (через FieldError), сброс и обновление данных страницы после успеха.
 */
export function ActionForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess,
  onSuccessHref,
  id,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccessHref?: string;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      const href = (state.data?.redirect as string | undefined) ?? onSuccessHref;
      // Внешние адреса (платёжная форма банка) — полная навигация
      if (href && /^https?:\/\//.test(href)) window.location.assign(href);
      else if (href) router.push(href);
      else router.refresh();
    }
  }, [state, resetOnSuccess, onSuccessHref, router]);
  // Отправка вручную (а не через form action): React не очищает поля, и при ошибке ввод сохраняется
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  }
  return (
    <FormCtx.Provider value={state}>
      <PendingCtx.Provider value={pending}>
        <form ref={formRef} onSubmit={onSubmit} className={className} id={id} noValidate aria-busy={pending}>
          {children}
          <FormMessage successMessage={successMessage} />
        </form>
      </PendingCtx.Provider>
    </FormCtx.Provider>
  );
}

function FormMessage({ successMessage }: { successMessage?: string }) {
  const state = useContext(FormCtx);
  if (!state) return null;
  if (state.ok === false && state.error) {
    return (
      <p role="alert" className="mt-3 rounded-lg border border-[#f5c2bf] bg-danger-50 px-3 py-2 text-sm text-danger-700">
        {state.error}
      </p>
    );
  }
  const msg = state.message ?? successMessage;
  if (state.ok && msg) {
    return (
      <p role="status" className="mt-3 rounded-lg border border-[#bfe3cf] bg-success-50 px-3 py-2 text-sm text-success-700">
        ✓ {msg}
      </p>
    );
  }
  return null;
}

export function FieldError({ name }: { name: string }) {
  const state = useContext(FormCtx);
  const err = state?.fieldErrors?.[name];
  if (!err) return null;
  return (
    <p id={`${name}-error`} className="mt-1 text-xs font-medium text-danger-700">
      {err}
    </p>
  );
}

export function useFormState() {
  return useContext(FormCtx);
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingText = "Сохранение…",
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "signal";
  size?: "sm" | "md" | "lg";
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const ctxPending = useContext(PendingCtx);
  const { pending: statusPending } = useFormStatus();
  const pending = ctxPending ?? statusPending;
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending} className={cx(btnClass(variant, size), className)}>
      {pending && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {pending ? pendingText : children}
    </button>
  );
}

/** Кнопка опасного действия с подтверждением в модальном окне. */
export function ConfirmSubmit({
  children,
  title,
  text,
  confirmText = "Подтвердить",
  variant = "danger",
  size = "sm",
}: {
  children: ReactNode;
  title: string;
  text?: string;
  confirmText?: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ctxPending = useContext(PendingCtx);
  const { pending: statusPending } = useFormStatus();
  const pending = ctxPending ?? statusPending;
  return (
    <>
      <button type="button" className={btnClass(variant === "danger" ? "secondary" : variant, size)} onClick={() => ref.current?.showModal()} disabled={pending}>
        {children}
      </button>
      <dialog ref={ref} className="w-[min(92vw,440px)] rounded-xl border border-line p-0 shadow-xl backdrop:bg-steel-900/40" aria-labelledby="confirm-title">
        <div className="p-5">
          <h2 id="confirm-title" className="text-lg font-semibold">
            {title}
          </h2>
          {text && <p className="mt-2 text-sm text-muted">{text}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btnClass("secondary", "sm")} onClick={() => ref.current?.close()}>
              Отмена
            </button>
            <button type="submit" className={btnClass(variant, "sm")} onClick={() => setTimeout(() => ref.current?.close(), 0)}>
              {confirmText}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
}

/** Загрузка нескольких файлов с индикатором прогресса (XHR — для событий progress). */
export function FileUploader({
  target,
  accept = ".pdf,.docx,.xlsx,.zip,.7z,.rar,.jpg,.jpeg,.png,.dwg,.dxf,.ifc,.step,.stp,.rvt",
  onUploaded,
  label = "Выберите файлы",
  hint,
  refreshOnDone = true,
  categories,
  allowInternal,
}: {
  target: Record<string, string | undefined>;
  accept?: string;
  onUploaded?: (files: UploadedFile[]) => void;
  label?: string;
  hint?: string;
  refreshOnDone?: boolean;
  categories?: { value: string; label: string }[];
  allowInternal?: boolean;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<UploadedFile[]>([]);
  const [category, setCategory] = useState(categories?.[0]?.value ?? "");
  const [internal, setInternal] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    for (const [k, v] of Object.entries(target)) if (v) fd.append(k, v);
    if (category) fd.append("category", category);
    if (internal) fd.append("internal", "1");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      try {
        const res = JSON.parse(xhr.responseText) as { files?: UploadedFile[]; errors?: string[]; error?: string };
        if (res.errors?.length || res.error) setError([res.error, ...(res.errors ?? [])].filter(Boolean).join("; "));
        if (res.files?.length) {
          setDone((d) => [...d, ...res.files!]);
          onUploaded?.(res.files);
          if (refreshOnDone) router.refresh();
        }
      } catch {
        setError("Не удалось загрузить файлы");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Ошибка сети при загрузке");
    };
    xhr.send(fd);
  }

  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-steel-50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {categories && (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Категория</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm">
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {allowInternal && (
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Внутренний (не виден заказчику)
          </label>
        )}
        <label className={cx(btnClass("secondary", "sm"), "cursor-pointer")}>
          <span aria-hidden="true">⤒</span> {label}
          <input ref={inputRef} type="file" multiple accept={accept} className="sr-only" onChange={(e) => upload(e.target.files)} disabled={progress !== null} />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">{hint ?? "PDF, DOCX, XLSX, ZIP, 7Z, RAR, JPG, PNG, DWG, DXF, IFC, STEP, RVT — размер ограничен настройками (по умолчанию до 500 МБ)."}</p>
      {progress !== null && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="mb-1 text-xs text-muted">Загрузка… {progress}%</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-steel-200">
            <div className="h-full bg-accent-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {error}
        </p>
      )}
      {done.length > 0 && !refreshOnDone && (
        <ul className="mt-2 space-y-1 text-sm">
          {done.map((f) => (
            <li key={f.id} className="text-success-700">
              ✓ {f.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Периодическое обновление страницы, пока идёт фоновая операция. */
export function AutoRefresh({ active, intervalMs = 2500 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
