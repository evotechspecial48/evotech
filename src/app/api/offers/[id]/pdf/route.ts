import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createPdf } from "@/lib/pdf";
import { can } from "@/domain/rbac";
import { companyRequisites } from "@/services/contracts";

interface Item {
  title: string;
  qty: number;
  unit: string;
  price: number;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const offer = await db.commercialOffer.findUnique({ where: { id }, include: { lead: true } });
  if (!offer) return new Response("Не найдено", { status: 404 });
  const allowed = can(user.role, "offers.manage") || (user.role === "CUSTOMER" && offer.lead.customerId === user.id && offer.status !== "DRAFT");
  if (!allowed) return new Response("Нет доступа", { status: 403 });
  const req_ = await companyRequisites();
  const pdf = await createPdf(`КП №${offer.number}`);
  pdf.heading(`Коммерческое предложение № ${offer.number} (версия ${offer.version})`, 16);
  pdf.paragraph(`${req_.name ?? "EvoTechnology"} · ${req_.phone ?? ""} · ${req_.email ?? ""}`);
  pdf.paragraph(`Для: ${offer.lead.companyName ?? offer.lead.contactName}. Объект: ${offer.lead.title}.`);
  pdf.spacer(6);
  (offer.items as unknown as Item[]).forEach((it, i) => {
    pdf.paragraph(`${i + 1}. ${it.title} — ${it.qty} ${it.unit} × ${it.price.toLocaleString("ru-RU")} ₽ = ${(it.qty * it.price).toLocaleString("ru-RU")} ₽`);
  });
  pdf.spacer(6);
  pdf.heading(`Итого: ${offer.total.toLocaleString("ru-RU")} ₽`, 13);
  pdf.paragraph(`Срок выполнения: ${offer.termDays} рабочих дней. Предложение действительно до ${offer.validUntil.toLocaleDateString("ru-RU")}.`);
  if (offer.notes) pdf.paragraph(offer.notes);
  return new Response(new Uint8Array(await pdf.save()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`КП_${offer.number}.pdf`)}`, "Cache-Control": "private, no-store" },
  });
}
