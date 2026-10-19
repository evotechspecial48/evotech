import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { ForbiddenError } from "@/domain/rbac";
import { assertCanDownload, signedFileUrl } from "@/services/files";

/** Проверка прав и выдача временной подписанной ссылки (редирект). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const file = await db.fileAsset.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  try {
    await assertCanDownload(user, file);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return NextResponse.redirect(new URL(signedFileUrl(file.id, user.id, inline), req.url));
}
