import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyPayload } from "@/lib/crypto";
import { storage } from "@/lib/storage";
import { previewKind } from "@/domain/files";

/** Скачивание по временной подписанной ссылке. Каждое скачивание фиксируется в журнале. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyPayload(token);
  if (!payload) return new Response("Ссылка недействительна или истекла", { status: 410 });
  const { f, u, i } = JSON.parse(payload) as { f: string; u: string; i: number };
  const file = await db.fileAsset.findUnique({ where: { id: f } });
  if (!file || file.deletedAt) return new Response("Файл не найден", { status: 404 });
  const data = await storage().get(file.storageKey);
  await audit({ actorId: u, action: file.category === "ARCHIVE" ? "archive.download" : "file.download", entityType: "FileAsset", entityId: file.id, projectId: file.projectId, ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null });
  const inline = i === 1 && previewKind(file.mimeType) !== null;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
