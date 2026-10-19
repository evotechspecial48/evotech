// Базовые компоненты дизайн-системы (серверные, без состояния).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/domain/labels";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "signal";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700 border-transparent",
  secondary: "bg-surface text-ink border-line-strong hover:bg-steel-50",
  ghost: "bg-transparent text-ink-soft border-transparent hover:bg-steel-100",
  danger: "bg-danger-700 text-white border-transparent hover:bg-[#8c1a15]",
  signal: "bg-signal-500 text-white border-transparent hover:bg-signal-600",
};
export const btnClass = (variant: BtnVariant = "primary", size: "sm" | "md" | "lg" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap",
    size === "sm" ? "px-3 py-1.5 text-sm" : size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm",
    BTN[variant],
  );

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return <button {...props} className={cx(btnClass(variant, size), className)} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return <Link {...props} className={cx(btnClass(variant, size), className)} />;
}

const TONE: Record<Tone, { cls: string; icon: string }> = {
  neutral: { cls: "bg-steel-100 text-steel-800 border-steel-200", icon: "○" },
  info: { cls: "bg-info-50 text-info-700 border-accent-100", icon: "●" },
  progress: { cls: "bg-accent-50 text-accent-700 border-accent-100", icon: "◐" },
  warning: { cls: "bg-warning-50 text-warning-700 border-[#f3d9ac]", icon: "◷" },
  success: { cls: "bg-success-50 text-success-700 border-[#bfe3cf]", icon: "✓" },
  danger: { cls: "bg-danger-50 text-danger-700 border-[#f5c2bf]", icon: "!" },
};

/** Статус: текст + значок + цвет (цвет — не единственный признак). */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", t.cls, className)}>
      <span aria-hidden="true">{t.icon}</span>
      {children}
    </span>
  );
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const s = map[value] ?? { label: value, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Card({ children, className, title, actions, id }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-accent-700">
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid-paper rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-12 text-center">
      <div aria-hidden="true" className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-line-strong bg-surface text-xl text-steel-400">
        ⌀
      </div>
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const map: Record<Tone, string> = {
    neutral: "border-line bg-steel-50 text-ink-soft",
    info: "border-accent-100 bg-info-50 text-info-700",
    progress: "border-accent-100 bg-accent-50 text-accent-700",
    warning: "border-[#f3d9ac] bg-warning-50 text-warning-700",
    success: "border-[#bfe3cf] bg-success-50 text-success-700",
    danger: "border-[#f5c2bf] bg-danger-50 text-danger-700",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", map[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label ?? "Готовность"}</span>
        <span className="font-mono font-medium text-ink">{v}%</span>
      </div>
      <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Готовность"} className="h-2 overflow-hidden rounded-full bg-steel-100">
        <div className="h-full rounded-full bg-accent-600" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold", tone === "danger" ? "text-danger-700" : tone === "warning" ? "text-warning-700" : "text-ink")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Таблица: на узких экранах прокручивается горизонтально внутри своего контейнера. */
export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-medium first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2.5 [&_td:first-child]:pl-0">{children}</tbody>
      </table>
    </div>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Разделы" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-accent-600 text-accent-700" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {typeof t.count === "number" && t.count > 0 && <span className="ml-1.5 rounded-full bg-steel-100 px-1.5 text-xs text-steel-800">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function DefList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 text-ink">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-md", className)} aria-hidden="true" />;
}

export const fieldClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-steel-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 aria-[invalid=true]:border-danger-700";

export function Field({ label, name, error, hint, required, children }: { label: string; name: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
        {required && <span className="text-danger-700" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ name, error, ...props }: ComponentProps<"input"> & { name: string; error?: string }) {
  return <input id={name} name={name} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} {...props} className={cx(fieldClass, props.className)} />;
}

export function Textarea({ name, error, ...props }: ComponentProps<"textarea"> & { name: string; error?: string }) {
  return <textarea id={name} name={name} rows={props.rows ?? 4} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} {...props} className={cx(fieldClass, props.className)} />;
}

export function Select({ name, error, children, ...props }: ComponentProps<"select"> & { name: string; error?: string }) {
  return (
    <select id={name} name={name} aria-invalid={!!error} {...props} className={cx(fieldClass, "pr-8", props.className)}>
      {children}
    </select>
  );
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" }) : "—";
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) : "—";
export const rub = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("ru-RU")} ₽`);
