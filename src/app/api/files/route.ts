import { NextResponse } from "next/server";
import type { FileCategory, StageCode } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/request";
import { logger } from "@/lib/logger";
import { UserError } from "@/lib/errors";
import { ForbiddenError } from "@/domain/rbac";
import { saveUpload } from "@/services/files";

const CATEGORIES: FileCategory[] = ["SOURCE", "PHOTO", "SKETCH", "MODEL", "DRAWING", "SPECIFICATION", "DOCUMENT", "CONTRACT", "OTHER"];
const STAGES: StageCode[] = ["brief", "sketch", "model", "drawings", "documentation", "delivery"];

/** Загрузка файлов (multipart). Проверка: сессия, Origin (CSRF), права на объект, формат, размер, антивирус. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const fd = await req.formData();
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Файлы не выбраны" }, { status: 400 });
  if (files.length > 20) return NextResponse.json({ error: "Не более 20 файлов за раз" }, { status: 400 });
  const category = String(fd.get("category") ?? "");
  const stage = String(fd.get("stageCode") ?? "");
  const target = {
    projectId: (fd.get("projectId") as string) || null,
    leadId: (fd.get("leadId") as string) || null,
    quickOrderId: (fd.get("quickOrderId") as string) || null,
    stageCode: STAGES.includes(stage as StageCode) ? (stage as StageCode) : null,
    category: CATEGORIES.includes(category as FileCategory) ? (category as FileCategory) : undefined,
    internal: fd.get("internal") === "1",
  };
  // Фото участка для быстрого заказа загружаются до создания заказа — временно без привязки
  const draftUpload = fd.get("draft") === "quick-order" && user.role === "CUSTOMER";
  const saved: { id: string; name: string; size: number }[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const asset = draftUpload ? await saveDraft(user, file, ip) : await saveUpload(user, file, target, ip);
      saved.push({ id: asset.id, name: asset.originalName, size: asset.size });
    } catch (err) {
      if (err instanceof UserError || err instanceof ForbiddenError) errors.push(err.message);
      else {
        logger.error("upload.failed", { err });
        errors.push(`${file.name}: ошибка сохранения`);
      }
    }
  }
  return NextResponse.json({ files: saved, errors }, { status: saved.length ? 200 : 400 });
}

async function saveDraft(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, file: File, ip: string | null) {
  const { checkUpload, safeFileName } = await import("@/domain/files");
  const check = checkUpload(safeFileName(file.name), file.size, 20);
  if (!check.ok) throw new UserError(`${file.name}: ${check.reason}`);
  if (check.mime !== "image/jpeg" && check.mime !== "image/png" && check.mime !== "application/pdf") throw new UserError(`${file.name}: для участка загрузите фото (JPG, PNG) или PDF`);
  const { saveGenerated } = await import("@/services/files");
  const { db } = await import("@/lib/db");
  const { audit } = await import("@/lib/audit");
  const asset = await saveGenerated(Buffer.from(await file.arrayBuffer()), safeFileName(file.name), check.mime, { category: "PHOTO" }, user.id);
  await db.fileAsset.update({ where: { id: asset.id }, data: { scanStatus: "SKIPPED" } });
  await audit({ actorId: user.id, action: "file.upload", entityType: "FileAsset", entityId: asset.id, ip, meta: { draft: true } });
  return asset;
}
