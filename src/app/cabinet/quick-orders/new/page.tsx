import { requireUser } from "@/lib/auth";
import { STRUCTURE_LIMITS, type StructureTypeT } from "@/domain/quick-order";
import { QuickOrderWizard } from "@/components/cabinet/quick-order-wizard";
import { PageHeader } from "@/components/ui";

export default async function NewQuickOrderPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireUser("quick_orders.create");
  const { type } = await searchParams;
  const initial = type && type in STRUCTURE_LIMITS ? (type as StructureTypeT) : undefined;
  return (
    <>
      <PageHeader title="Быстрый заказ" back={{ href: "/cabinet/quick-orders", label: "К заказам" }} subtitle="Пошаговое техническое задание для малой конструкции" />
      <QuickOrderWizard initialType={initial} />
    </>
  );
}
