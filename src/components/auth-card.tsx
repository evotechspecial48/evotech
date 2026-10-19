export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid-paper flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-lg sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-line pt-4 text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
