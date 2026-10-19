import { randomUUID } from "node:crypto";
import type { FileAsset, FileCategory, StageCode } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { sha256, signPayload } from "@/lib/crypto";
import { scanner, storage } from "@/lib/storage";
import { UserError, NotFoundError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { checkUpload, safeFileName } from "@/domain/files";
import { can, ForbiddenError } from "@/domain/rbac";
import { loadLeadAccess, loadProjectAccess } from "./scope";
import { CUSTOMER_VISIBLE_VERSION } from "./stages";

export interface UploadTarget {
  projectId?: string | null;
  leadId?: string | null;
  quickOrderId?: string | null;
  stageCode?: StageCode | null;
  category?: FileCategory;
  internal?: boolean;
}

async function maxSizeMb(): Promise<number> {
  const s = await db.setting.findUnique({ where: { key: "files.maxSizeMb" } });
  return typeof s?.value === "number" ? s.value : env.FILE_MAX_SIZE_MB;
}

/** Проверка права загрузки в указанный контекст. */
async function assertCanUploadTo(user: SessionUser, t: UploadTarget) {
  if (!can(user.role, "files.upload")) throw new ForbiddenError();
  if (t.projectId) {
    const a = await loadProjectAccess(user, t.projectId);
    if (user.role !== "CUSTOMER" && !a.canWork && user.role !== "SALES_MANAGER") throw new ForbiddenError("Нет права загружать файлы в проект");
    return;
  }
  if (t.leadId) {
    await loadLeadAccess(user, t.leadId);
    return;
  }
  if (t.quickOrderId) {
    const qo = await db.quickOrder.findUnique({ where: { id: t.quickOrderId }, select: { customerId: true } });
    if (!qo) throw new NotFoundError("Заказ");
    if (qo.customerId !== user.id && !can(user.role, "quick_orders.view_all")) throw new ForbiddenError();
    return;
  }
  throw new UserError("Не указан объект, к которому относится файл");
}

export async function saveUpload(user: SessionUser, file: File, target: UploadTarget, ip: string | null): Promise<FileAsset> {
  await assertCanUploadTo(user, target);
  const name = safeFileName(file.name);
  const check = checkUpload(name, file.size, await maxSizeMb());
  if (!check.ok) {
    await audit({ actorId: user.id, action: "file.rejected", ip, meta: { name, size: file.size, reason: check.reason } });
    throw new UserError(`${name}: ${check.reason}`);
  }
  const data = Buffer.from(await file.arrayBuffer());
  const scan = await scanner.scan(data, name);
  if (scan === "INFECTED") {
    await audit({ actorId: user.id, action: "file.rejected", ip, meta: { name, reason: "infected" } });
    throw new UserError(`${name}: файл не прошёл антивирусную проверку`);
  }
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${check.ext}`;
  await storage().put(key, data, check.mime);
  const asset = await db.fileAsset.create({
    data: {
      originalName: name,
      storageKey: key,
      mimeType: check.mime,
      size: data.length,
      checksum: sha256(data),
      category: target.category ?? "OTHER",
      scanStatus: scan,
      projectId: target.projectId ?? null,
      leadId: target.leadId ?? null,
      quickOrderId: target.quickOrderId ?? null,
      stageCode: target.stageCode ?? null,
      internal: user.role !== "CUSTOMER" && !!target.internal,
      uploadedById: user.id,
    },
  });
  await audit({ actorId: user.id, action: "file.upload", entityType: "FileAsset", entityId: asset.id, projectId: asset.projectId, ip, meta: { name, size: asset.size } });
  return asset;
}

/** Сохранение файла, сформированного системой (договор, архив). */
export async function saveGenerated(data: Buffer, name: string, mime: string, target: UploadTarget, actorId: string | null): Promise<FileAsset> {
  const ext = name.split(".").pop() ?? "bin";
  const key = `generated/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await storage().put(key, data, mime);
  return db.fileAsset.create({
    data: {
      originalName: name,
      storageKey: key,
      mimeType: mime,
      size: data.length,
      checksum: sha256(data),
      category: target.category ?? "DOCUMENT",
      scanStatus: "CLEAN",
      projectId: target.projectId ?? null,
      leadId: target.leadId ?? null,
      quickOrderId: target.quickOrderId ?? null,
      stageCode: target.stageCode ?? null,
      uploadedById: actorId,
    },
  });
}

/**
 * Право на скачивание файла. Итоговый архив быстрого заказа отдаётся только через
 * отдельный маршрут с проверкой договора, оплаты и статуса (см. quick-orders.ts).
 */
export async function assertCanDownload(user: SessionUser, file: FileAsset): Promise<void> {
  if (file.deletedAt) throw new NotFoundError("Файл");
  if (file.scanStatus === "INFECTED") throw new ForbiddenError("Файл заблокирован антивирусной проверкой");
  if (!can(user.role, "files.download")) throw new ForbiddenError();
  if (file.internal && user.role === "CUSTOMER") throw new ForbiddenError();
  if (file.category === "ARCHIVE" && file.quickOrderId) throw new ForbiddenError("Итоговый архив скачивается со страницы заказа");
  if (file.projectId) {
    await loadProjectAccess(user, file.projectId);
    if (user.role === "CUSTOMER" && file.stageVersionId) {
      const visible = await db.stageVersion.count({ where: { id: file.stageVersionId, ...CUSTOMER_VISIBLE_VERSION } });
      if (!visible) throw new ForbiddenError("Версия ещё не передана на согласование");
    }
    return;
  }
  if (file.leadId) {
    await loadLeadAccess(user, file.leadId);
    return;
  }
  if (file.quickOrderId) {
    const qo = await db.quickOrder.findUnique({ where: { id: file.quickOrderId }, select: { customerId: true } });
    if (qo?.customerId === user.id || can(user.role, "quick_orders.view_all")) return;
    throw new ForbiddenError();
  }
  if (file.uploadedById === user.id || user.role === "DIRECTOR") return;
  throw new ForbiddenError();
}

/** Временная подписанная ссылка на скачивание (по умолчанию 5 минут). */
export function signedFileUrl(fileId: string, userId: string, inline = false): string {
  const token = signPayload(JSON.stringify({ f: fileId, u: userId, i: inline ? 1 : 0 }), env.FILE_LINK_TTL_SECONDS);
  return `/api/files/dl/${token}`;
}

export async function softDeleteFile(user: SessionUser, fileId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, include: { stageVersion: true } });
  if (!file) throw new NotFoundError("Файл");
  await assertCanDownload(user, file);
  if (file.stageVersion?.lockedAt) throw new UserError("Файл входит в согласованную версию и не может быть удалён");
  if (file.uploadedById !== user.id && user.role !== "DIRECTOR" && user.role !== "PROJECT_MANAGER") throw new ForbiddenError();
  await db.fileAsset.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  await audit({ actorId: user.id, action: "file.delete", entityType: "FileAsset", entityId: fileId, projectId: file.projectId });
}
