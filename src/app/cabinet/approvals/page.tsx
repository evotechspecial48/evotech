import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/domain/rbac";
import { STAGE_STATUS } from "@/domain/labels";
import { projectScope } from "@/services/scope";
import { Card, EmptyState, fmtDateTime, PageHeader, StatusBadge, Table } from "@/components/ui";

export default async function ApprovalsPage() {
  const user = await requireUser(["stages.review_internal", "stages.customer_decide", "spec.approve"]);
  const statuses = user.role === "CUSTOMER" ? ["customer_review"] : ["internal_review", "customer_review", "changes_requested"];
  const stages = await db.projectStage.findMany({
    where: { status: { in: statuses as Prisma.EnumStageStatusFilter["in"] }, project: projectScope(user) },
    include: { project: { select: { id: true, number: true, title: true } }, versions: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { project: { number: "asc" } },
  });
  const specs = can(user.role, "spec.approve") ? await db.technicalSpecification.findMany({ where: { status: "SUBMITTED" }, include: { lead: { select: { number: true } }, project: { select: { number: true } } } }) : [];
  const history = await db.approval.findMany({
    where: user.role === "CUSTOMER" ? { userId: user.id } : { kind: { in: ["CUSTOMER", "INTERNAL"] }, stageVersion: { stage: { project: projectScope(user) } } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { stageVersion: { include: { stage: { include: { project: { select: { id: true, number: true } } } } } } },
  });
  const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: history.map((h) => h.userId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Согласования" subtitle={user.role === "CUSTOMER" ? "Результаты, ожидающие вашего решения" : "Версии на проверке и у заказчика"} />
      <div className="space-y-6">
        <Card title="Ожидают решения">
          {stages.length === 0 && specs.length === 0 ? (
            <EmptyState title="Нет объектов на согласовании" />
          ) : (
            <Table head={["Проект", "Этап", "Версия", "Статус", ""]}>
              {stages.map((s) => (
                <tr key={s.id}>
                  <td>
                    №{s.project.number} · {s.project.title}
                  </td>
                  <td>{s.title}</td>
                  <td className="font-mono">{s.versions[0]?.version ?? "—"}</td>
                  <td>
                    <StatusBadge map={STAGE_STATUS} value={s.status} />
                  </td>
                  <td>
                    <Link href={`/cabinet/projects/${s.project.id}?tab=stages`} className="text-accent-700">
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))}
              {specs.map((sp) => (
                <tr key={sp.id}>
                  <td>{sp.project ? `Проект №${sp.project.number}` : `Заявка №${sp.lead?.number}`}</td>
                  <td>Техническое задание</td>
                  <td className="font-mono">{sp.currentVersion}</td>
                  <td>На проверке</td>
                  <td>
                    <Link href={`/cabinet/specs/${sp.id}`} className="text-accent-700">
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="История решений">
          {history.length === 0 ? (
            <p className="text-sm text-muted">Пока пусто.</p>
          ) : (
            <Table head={["Дата", "Проект / этап", "Решение", "Кто", "Комментарий"]}>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(h.createdAt)}</td>
                  <td>{h.stageVersion ? `№${h.stageVersion.stage.project.number} · ${h.stageVersion.stage.title}, v${h.stageVersion.version}` : "ТЗ"}</td>
                  <td>{h.decision === "APPROVED" ? (h.kind === "CUSTOMER" ? "Согласовано" : "Проверка пройдена") : h.decision === "CHANGES_REQUESTED" ? "На доработку" : "Отправлено на проверку"}</td>
                  <td>{names[h.userId]}</td>
                  <td className="max-w-xs text-muted">{h.comment}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
