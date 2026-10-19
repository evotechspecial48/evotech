import Link from "next/link";
import type { FileAsset } from "@prisma/client";
import { FILE_CATEGORY } from "@/domain/labels";
import { formatSize, previewKind } from "@/domain/files";
import { deleteFileAction } from "@/app/actions/cabinet";
import { Badge, btnClass, EmptyState, fmtDateTime } from "../ui";

export function FileList({ files, canDelete, emptyText = "Файлов пока нет" }: { files: (FileAsset & { uploadedBy?: { name: string } | null })[]; canDelete?: (f: FileAsset) => boolean; emptyText?: string }) {
  if (!files.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line">
      {files.map((f) => {
        const preview = previewKind(f.mimeType);
        return (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <a href={`/api/files/${f.id}/link`} className="break-all text-sm font-medium text-accent-700 hover:underline">
                {f.originalName}
              </a>
              <p className="text-xs text-muted">
                {FILE_CATEGORY[f.category]} · {formatSize(f.size)} · {fmtDateTime(f.createdAt)}
                {f.uploadedBy ? ` · ${f.uploadedBy.name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {f.internal && <Badge tone="neutral">Внутренний</Badge>}
              {f.scanStatus === "INFECTED" && <Badge tone="danger">Заблокирован</Badge>}
              {preview && (
                <a href={`/api/files/${f.id}/link?inline=1`} target="_blank" rel="noopener" className={btnClass("ghost", "sm")}>
                  Просмотр
                </a>
              )}
              {canDelete?.(f) && (
                <form action={deleteFileAction}>
                  <input type="hidden" name="fileId" value={f.id} />
                  <button className={btnClass("ghost", "sm")} aria-label={`Удалить ${f.originalName}`}>
                    Удалить
                  </button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CommentList({ comments }: { comments: { id: string; body: string; internal: boolean; createdAt: Date; author: { name: string; role: string } }[] }) {
  if (!comments.length) return <EmptyState title="Комментариев пока нет" />;
  return (
    <ol className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className={`rounded-lg border p-3 ${c.internal ? "border-dashed border-line-strong bg-steel-50" : "border-line bg-surface"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              <span className="font-medium text-ink">{c.author.name}</span>
              {c.internal && <span className="ml-2">· внутренний</span>}
            </span>
            <time dateTime={c.createdAt.toISOString()}>{fmtDateTime(c.createdAt)}</time>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{c.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function History({ items, labels }: { items: { id: string; fromStatus: string | null; toStatus: string; comment: string | null; createdAt: Date; actorName?: string | null }[]; labels: Record<string, { label: string }> }) {
  if (!items.length) return <p className="text-sm text-muted">История пуста.</p>;
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {items.map((h) => (
        <li key={h.id} className="text-sm">
          <span aria-hidden="true" className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-accent-600" />
          <p>
            {h.fromStatus ? `${labels[h.fromStatus]?.label ?? h.fromStatus} → ` : ""}
            <span className="font-medium">{labels[h.toStatus]?.label ?? h.toStatus}</span>
          </p>
          {h.comment && <p className="text-muted">{h.comment}</p>}
          <p className="text-xs text-muted">
            {fmtDateTime(h.createdAt)}
            {h.actorName ? ` · ${h.actorName}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function NoAccess() {
  return (
    <div className="py-12 text-center">
      <p className="font-medium">Нет доступа</p>
      <Link href="/cabinet" className="text-sm text-accent-700">
        На главную кабинета
      </Link>
    </div>
  );
}
