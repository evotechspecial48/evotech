import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/domain/rbac";
import { CONTRACT_STATUS } from "@/domain/labels";
import { contractCancelAction, contractReviseAction } from "@/app/actions/cabinet";
import { ContractSign } from "@/components/cabinet/contract-sign";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Alert, Badge, btnClass, Card, DefList, fieldClass, fmtDateTime, PageHeader, rub, StatusBadge } from "@/components/ui";

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const user = await requireUser(["contracts.manage", "contracts.accept", "projects.view_all"]);
  const contract = await db.contract.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" } }, acceptances: { include: { version: true } }, lead: { select: { id: true, number: true } }, project: { select: { id: true, number: true } }, quickOrder: { select: { id: true, number: true } } },
  });
  if (!contract) notFound();
  const isOwner = contract.customerId === user.id;
  if (!isOwner && !can(user.role, "contracts.manage") && !(can(user.role, "projects.view_all") && contract.projectId)) notFound();
  const current = contract.versions[0];
  const shown = contract.versions.find((x) => x.version === Number(v)) ?? current;
  const customer = await db.user.findUnique({ where: { id: contract.customerId }, select: { name: true, email: true } });
  const accepted = contract.acceptances.find((a) => a.versionId === current.id);
  const signers = Object.fromEntries((await db.user.findMany({ where: { id: { in: contract.acceptances.map((a) => a.userId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <>
      <PageHeader
        back={{ href: "/cabinet/contracts", label: "К договорам" }}
        title={`Договор ${contract.number}`}
        subtitle={`${rub(contract.amount)} · ${contract.termDays} раб. дн. · заказчик ${customer?.name}`}
        actions={
          <>
            <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
            <a href={`/api/contracts/${contract.id}/pdf?v=${shown.version}`} target="_blank" rel="noopener" className={btnClass("secondary", "sm")}>
              PDF редакции {shown.version}
            </a>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title={`Текст договора · редакция ${shown.version}${shown.id === current.id ? " (актуальная)" : ""}`}>
          {shown.id !== current.id && (
            <div className="mb-3">
              <Alert tone="warning">Это не актуальная редакция договора.</Alert>
            </div>
          )}
          <div className="prose-doc max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-steel-50 p-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{shown.body}</pre>
          </div>
          <p className="mt-2 font-mono text-xs text-muted">Контрольная сумма: {shown.checksum.slice(0, 32)}…</p>
        </Card>
        <div className="space-y-6">
          {isOwner && contract.status === "AWAITING_SIGNATURE" && (
            <Card title="Подписание">
              <ContractSign contractId={contract.id} version={current.version} back={contract.quickOrder ? `/cabinet/quick-orders/${contract.quickOrder.id}` : undefined} />
            </Card>
          )}
          {accepted && (
            <Alert tone="success" title="Договор подписан">
              {signers[accepted.userId]} · {fmtDateTime(accepted.acceptedAt)} · IP {accepted.ip} · редакция {accepted.version.version} · способ: простая ЭП (код из письма)
            </Alert>
          )}
          <Card title="Основание">
            <DefList
              items={[
                ["Заявка", contract.lead ? <Link key="l" href={`/cabinet/leads/${contract.lead.id}`} className="text-accent-700">№{contract.lead.number}</Link> : null],
                ["Проект", contract.project ? <Link key="p" href={`/cabinet/projects/${contract.project.id}`} className="text-accent-700">№{contract.project.number}</Link> : null],
                ["Быстрый заказ", contract.quickOrder ? <Link key="q" href={`/cabinet/quick-orders/${contract.quickOrder.id}`} className="text-accent-700">№{contract.quickOrder.number}</Link> : null],
                ["Создан", fmtDateTime(contract.createdAt)],
              ]}
            />
          </Card>
          <Card title="Редакции и подписания">
            <ul className="space-y-2 text-sm">
              {contract.versions.map((ver) => {
                const acc = contract.acceptances.find((a) => a.versionId === ver.id);
                return (
                  <li key={ver.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`?v=${ver.version}`} className="text-accent-700">
                      Редакция {ver.version} · {fmtDateTime(ver.createdAt)}
                    </Link>
                    {acc ? <Badge tone="success">подписана</Badge> : <Badge tone="neutral">не подписана</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
          {can(user.role, "contracts.manage") && contract.status !== "SIGNED" && contract.status !== "CANCELLED" && (
            <Card title="Корректировка">
              <ActionForm action={contractReviseAction} className="space-y-3">
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Сумма, ₽</span>
                    <input name="amount" type="number" defaultValue={contract.amount} className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Срок, дн.</span>
                    <input name="termDays" type="number" defaultValue={contract.termDays} className={fieldClass} />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">Текст новой редакции</span>
                  <textarea name="body" rows={10} defaultValue={current.body} className={`${fieldClass} font-mono text-xs`} />
                </label>
                <SubmitButton size="sm">Создать новую редакцию</SubmitButton>
              </ActionForm>
              <ActionForm action={contractCancelAction} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="contractId" value={contract.id} />
                <ConfirmSubmit title="Аннулировать договор?" text="Заказчик не сможет его подписать. Действие записывается в журнал.">
                  Аннулировать
                </ConfirmSubmit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
