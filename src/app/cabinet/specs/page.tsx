import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SPEC_STATUS } from "@/domain/labels";
import { Card, EmptyState, fmtDateTime, PageHeader, StatusBadge, Table } from "@/components/ui";

export default async function SpecsPage() {
  const user = await requireUser("spec.edit");
  const where: Prisma.TechnicalSpecificationWhereInput =
    user.role === "CUSTOMER" ? { OR: [{ lead: { customerId: user.id } }, { project: { customerId: user.id } }] } : user.role === "SALES_MANAGER" ? { OR: [{ leadId: { not: null } }, { project: { salesManagerId: user.id } }] } : {};
  const specs = await db.technicalSpecification.findMany({
    where,
    include: { lead: { select: { number: true, title: true } }, project: { select: { number: true, title: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Технические задания" subtitle="Совместная подготовка ТЗ с историей изменений и утверждённой версией-снимком" />
      <Card>
        {specs.length === 0 ? (
          <EmptyState title="ТЗ пока нет" text="ТЗ создаётся вместе с заявкой." />
        ) : (
          <Table head={["Объект", "Основание", "Статус", "Версия", "Обновлено"]}>
            {specs.map((s) => {
              const data = s.data as Record<string, string>;
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/cabinet/specs/${s.id}`} className="font-medium hover:text-accent-700">
                      {data.objectName || "Без названия"}
                    </Link>
                  </td>
                  <td className="text-muted">{s.project ? `Проект №${s.project.number}` : s.lead ? `Заявка №${s.lead.number}` : "—"}</td>
                  <td>
                    <StatusBadge map={SPEC_STATUS} value={s.status} />
                  </td>
                  <td className="font-mono">{s.currentVersion}</td>
                  <td className="text-muted">{fmtDateTime(s.updatedAt)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
