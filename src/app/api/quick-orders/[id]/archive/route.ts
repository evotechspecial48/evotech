import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { archiveAccess } from "@/services/quick-orders";
import { signedFileUrl } from "@/services/files";

/**
 * Итоговый архив быстрого заказа. Доступен, только если договор подтверждён, платёж успешен
 * и результат имеет статус completed. Ссылка на файл — временная.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const { qo, gate } = await archiveAccess(user, id);
  if (!gate.ok || !qo.archiveFileId) {
    await audit({ actorId: user.id, action: "archive.download", entityType: "QuickOrder", entityId: id, meta: { denied: gate.ok ? ["archive_missing"] : gate.reasons } });
    return NextResponse.json({ error: "Архив недоступен", reasons: gate.ok ? ["Архив не сформирован"] : gate.reasons }, { status: 403 });
  }
  return NextResponse.redirect(new URL(signedFileUrl(qo.archiveFileId, user.id), req.url));
}
