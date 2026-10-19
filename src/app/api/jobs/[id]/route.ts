import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/domain/rbac";

/** Статус AI-задачи для отображения прогресса длительной операции. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const job = await db.aIJob.findUnique({ where: { id }, select: { id: true, status: true, error: true, attempts: true, demo: true, updatedAt: true, quickOrder: { select: { customerId: true } } } });
  if (!job) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (job.quickOrder?.customerId !== user.id && !can(user.role, "quick_orders.view_all") && !can(user.role, "projects.view_all")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const { quickOrder: _q, ...rest } = job;
  void _q;
  return NextResponse.json(rest);
}
