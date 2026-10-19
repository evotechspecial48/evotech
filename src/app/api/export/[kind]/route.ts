import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { can } from "@/domain/rbac";
import { LEAD_SOURCE, LEAD_STATUS, PROJECT_STATUS } from "@/domain/labels";
import { exportPersonalData } from "@/services/users";
import { projectScope } from "@/services/scope";

const csv = (rows: (string | number | null | undefined)[][]) =>
  "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

/** Выгрузка данных: заявки и проекты (CSV) для сотрудников, персональные данные (JSON) для владельца. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  if (kind === "me") {
    const data = await exportPersonalData(user, user.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="my-data.json"' },
    });
  }
  if (!can(user.role, "data.export")) return new Response("Нет доступа", { status: 403 });
  let body = "";
  if (kind === "leads") {
    const leads = await db.lead.findMany({ orderBy: { createdAt: "desc" }, include: { manager: { select: { name: true } } } });
    body = csv([
      ["№", "Дата", "Тема", "Контакт", "Компания", "Статус", "Источник", "Менеджер", "utm_source", "utm_campaign"],
      ...leads.map((l) => {
        const utm = (l.utm ?? {}) as Record<string, string>;
        return [l.number, l.createdAt.toISOString().slice(0, 10), l.title, l.contactName, l.companyName, LEAD_STATUS[l.status].label, LEAD_SOURCE[l.source], l.manager?.name, utm.utm_source, utm.utm_campaign];
      }),
    ]);
  } else if (kind === "projects") {
    const projects = await db.project.findMany({ where: projectScope(user), orderBy: { createdAt: "desc" }, include: { customer: { select: { name: true } }, manager: { select: { name: true } } } });
    body = csv([["№", "Название", "Заказчик", "Руководитель", "Статус", "Создан"], ...projects.map((p) => [p.number, p.title, p.customer.name, p.manager?.name, PROJECT_STATUS[p.status].label, p.createdAt.toISOString().slice(0, 10)])]);
  } else return new Response("Неизвестный тип", { status: 404 });
  await audit({ actorId: user.id, action: "user.export", meta: { kind } });
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}.csv"` } });
}
