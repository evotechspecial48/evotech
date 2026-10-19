import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { textToPdf } from "@/lib/pdf";
import { can } from "@/domain/rbac";

/** PDF актуальной (или указанной) версии договора с отметкой о подтверждении. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const contract = await db.contract.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" } }, acceptances: { include: { version: true } } } });
  if (!contract) return new Response("Не найден", { status: 404 });
  const allowed = contract.customerId === user.id || can(user.role, "contracts.manage") || (can(user.role, "projects.view_all") && !!contract.projectId);
  if (!allowed) return new Response("Нет доступа", { status: 403 });
  const vParam = Number(new URL(req.url).searchParams.get("v"));
  const version = contract.versions.find((v) => v.version === vParam) ?? contract.versions[0];
  const acc = contract.acceptances.find((a) => a.versionId === version.id);
  const stamp = acc
    ? `\n\n# Отметка о подписании\n\nДокумент подписан простой электронной подписью ${acc.acceptedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (МСК), IP ${acc.ip ?? "—"}, редакция ${version.version}, контрольная сумма ${acc.checksum.slice(0, 16)}…`
    : `\n\nРедакция ${version.version}. Документ не подписан.`;
  const pdf = await textToPdf(`Договор ${contract.number}`, version.body + stamp);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`Договор_${contract.number}_v${version.version}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
