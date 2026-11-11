import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createPdf } from "@/lib/pdf";
import { can } from "@/domain/rbac";
import { renderTemplate } from "@/domain/spec";
import { activeTemplate, companyRequisites } from "@/services/contracts";

interface Item {
  title: string;
  qty: number;
  unit: string;
  price: number;
}

const money = (n: number) => n.toLocaleString("ru-RU");

/** КП по бланку компании: шапка с логотипом и реквизитами, таблица работ, условия из шаблона «КП», подпись. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const offer = await db.commercialOffer.findUnique({ where: { id }, include: { lead: true } });
  if (!offer) return new Response("Не найдено", { status: 404 });
  const allowed = can(user.role, "offers.manage") || (user.role === "CUSTOMER" && offer.lead.customerId === user.id && offer.status !== "DRAFT");
  if (!allowed) return new Response("Нет доступа", { status: 403 });
  // Готовое КП, загруженное файлом, отдаётся как есть (права на файл проверяет /api/files)
  if (offer.fileId) return NextResponse.redirect(new URL(`/api/files/${offer.fileId}/link`, req.url));
  const r = await companyRequisites();
  const date = offer.createdAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });

  const pdf = await createPdf(`КП №${offer.number}`);
  await pdf.image(await fs.readFile(path.join(process.cwd(), "public", "brand", "logo.png")), 34);
  for (const l of [`От проектной организации «ЭвоТех»`, r.shortName ?? r.name, `ИНН ${r.inn ?? ""} ОГРНИП ${r.ogrnip ?? ""}`, r.address, r.phone, `${r.email ?? ""} · сайт: evotechnology.su`]) {
    if (l) pdf.paragraph(l, 9.5);
  }
  pdf.rule();
  pdf.centered(`Коммерческое предложение № ${offer.number} от ${date}`, 13);
  pdf.centered("на разработку Конструкторской документации", 11, false);
  pdf.spacer(4);
  pdf.paragraph(`Для: ${offer.lead.companyName ?? offer.lead.contactName}. Объект: ${offer.lead.title}.`);

  const items = offer.items as unknown as Item[];
  pdf.table(
    [
      ["Поз.", "Вид работ", "Срок выполнения в раб. днях", "Сумма (руб.), без НДС"],
      ...items.map((it, i) => [String(i + 1), it.qty === 1 ? it.title : `${it.title} (${it.qty} ${it.unit} × ${money(it.price)} руб.)`, i === 0 ? String(offer.termDays) : "", money(it.qty * it.price)]),
      ["", "ИТОГО:", String(offer.termDays), money(offer.total)],
    ],
    { header: true, widths: [0.08, 0.52, 0.18, 0.22] },
  );
  if (offer.notes) pdf.paragraph(offer.notes);

  const validDays = Math.max(1, Math.round((offer.validUntil.getTime() - offer.createdAt.getTime()) / 86400_000));
  const tpl = await activeTemplate("OFFER").catch(() => null);
  const conditions = renderTemplate(tpl?.body ?? "", {
    executorShortName: r.shortName ?? r.name,
    validDays: String(validDays),
    validUntil: offer.validUntil.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }),
    number: String(offer.number),
    amount: money(offer.total),
    termDays: String(offer.termDays),
    customerName: offer.lead.companyName ?? offer.lead.contactName,
    subject: offer.lead.title,
  });
  for (const block of conditions.split(/\n{2,}/)) if (block.trim()) pdf.paragraph(block.trim());
  pdf.spacer(18);
  pdf.paragraph(`Индивидуальный предприниматель                      ____________________ ${r.signer ?? ""}`);

  return new Response(new Uint8Array(await pdf.save()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`КП_${offer.number}.pdf`)}`, "Cache-Control": "private, no-store" },
  });
}
