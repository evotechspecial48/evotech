import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { REQUEST_STATUS } from "@/domain/labels";
import { projectScope } from "@/services/scope";
import { Card, EmptyState, fmtDateTime, PageHeader, StatusBadge, Table } from "@/components/ui";

export default async function RequestsPage() {
  const user = await requireUser(["requests.create", "requests.answer"]);
  const requests = await db.customerRequest.findMany({
    where: { project: projectScope(user) },
    include: { project: { select: { id: true, number: true, title: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader title="Сообщения и запросы" subtitle={user.role === "CUSTOMER" ? "Запросы сотрудников по вашим проектам" : "Запросы сведений, файлов и подтверждений у заказчиков"} />
      <Card>
        {requests.length === 0 ? (
          <EmptyState title="Запросов нет" />
        ) : (
          <Table head={["Проект", "Запрос", "Статус", "Создан", "Таймер"]}>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">№{r.project.number}</td>
                <td className="max-w-md">
                  <Link href={`/cabinet/projects/${r.project.id}?tab=requests`} className="hover:text-accent-700">
                    {r.question.slice(0, 140)}
                  </Link>
                </td>
                <td>
                  <StatusBadge map={REQUEST_STATUS} value={r.status} />
                </td>
                <td className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</td>
                <td className="text-xs text-muted">{r.pausesTimer ? (r.status === "OPEN" ? "на паузе" : "пауза снята") : "не влияет"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
