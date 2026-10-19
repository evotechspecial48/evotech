import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OFFER_STATUS } from "@/domain/labels";
import { Card, EmptyState, fmtDate, PageHeader, rub, StatusBadge, Table } from "@/components/ui";

export default async function OffersPage() {
  await requireUser("offers.manage");
  const offers = await db.commercialOffer.findMany({ include: { lead: { select: { id: true, number: true, title: true, contactName: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Коммерческие предложения" subtitle="Формируются из карточки заявки" />
      <Card>
        {offers.length === 0 ? (
          <EmptyState title="КП пока нет" text="Откройте заявку и сформируйте коммерческое предложение." />
        ) : (
          <Table head={["№", "Заявка", "Сумма", "Срок", "Действует до", "Статус", ""]}>
            {offers.map((o) => (
              <tr key={o.id}>
                <td className="font-mono">
                  {o.number}/{o.version}
                </td>
                <td>
                  <Link href={`/cabinet/leads/${o.lead.id}`} className="hover:text-accent-700">
                    №{o.lead.number} · {o.lead.title}
                  </Link>
                  <span className="block text-xs text-muted">{o.lead.contactName}</span>
                </td>
                <td>{rub(o.total)}</td>
                <td>{o.termDays} дн.</td>
                <td>{fmtDate(o.validUntil)}</td>
                <td>
                  <StatusBadge map={OFFER_STATUS} value={o.status} />
                </td>
                <td>
                  <a href={`/api/offers/${o.id}/pdf`} target="_blank" rel="noopener" className="text-accent-700">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
