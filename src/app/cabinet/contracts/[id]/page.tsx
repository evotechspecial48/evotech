import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/domain/rbac";
import { CONTRACT_STATUS } from "@/domain/labels";
import { contractCancelAction, contractReviseAction, contractRevisionAction, deleteContractAction, sendSbisAction } from "@/app/actions/cabinet";
import { sbis } from "@/lib/edo/sbis";
import { ContractSign } from "@/components/cabinet/contract-sign";
import { ContractPayments } from "@/components/cabinet/contract-payments";
import { DocBody } from "@/components/cabinet/doc-body";
import { ActionForm, ConfirmSubmit, FieldError, SubmitButton } from "@/components/client";
import { Alert, Badge, btnClass, Card, DefList, fieldClass, fmtDateTime, PageHeader, rub, StatusBadge } from "@/components/ui";

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const user = await requireUser(["contracts.manage", "contracts.accept", "projects.view_all"]);
  const contract = await db.contract.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" } }, acceptances: { include: { version: true } }, payments: true, lead: { select: { id: true, number: true } }, project: { select: { id: true, number: true } }, quickOrder: { select: { id: true, number: true } } },
  });
  if (!contract) notFound();
  const isOwner = contract.customerId === user.id;
  if (!isOwner && !can(user.role, "contracts.manage") && !(can(user.role, "projects.view_all") && contract.projectId)) notFound();
  const current = contract.versions[0];
  const shown = contract.versions.find((x) => x.version === Number(v)) ?? current;
  const customer = await db.user.findUnique({ where: { id: contract.customerId }, select: { name: true, email: true, company: { select: { inn: true, kpp: true } } } });
  const sbisReady = !!sbis();
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
              {contract.fileId && contract.versions.length === 1 ? "Файл договора" : `PDF редакции ${shown.version}`}
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
            <DocBody body={shown.body} />
          </div>
          <p className="mt-2 font-mono text-xs text-muted">Контрольная сумма: {shown.checksum.slice(0, 32)}…</p>
        </Card>
        <div className="space-y-6">
          {isOwner && contract.status === "AWAITING_SIGNATURE" && contract.sbisDocumentId && (
            <Alert tone="info" title="Можно подписать в ЭДО СБИС">
              Договор отправлен вам через СБИС. Если ваша организация подключена к ЭДО, подпишите его там — статус обновится автоматически. Без ЭДО подпишите кодом из письма ниже.
            </Alert>
          )}
          {isOwner && contract.status === "AWAITING_SIGNATURE" && (
            <Card title="Подписание">
              <ContractSign contractId={contract.id} version={current.version} back={contract.quickOrder ? `/cabinet/quick-orders/${contract.quickOrder.id}` : undefined} />
            </Card>
          )}
          {accepted && (
            <Alert tone="success" title="Договор подписан">
              {signers[accepted.userId]} · {fmtDateTime(accepted.acceptedAt)} {accepted.ip ? ` · IP ${accepted.ip}` : ""} · редакция {accepted.version.version} · способ: {accepted.method === "EXTERNAL_EDO" ? "КЭП в ЭДО СБИС" : accepted.method === "OFFLINE" ? "на бумаге / вне кабинета (отмечено сотрудником)" : "простая ЭП (код из письма)"}
            </Alert>
          )}
          {/* Счёт можно выставить сразу при формировании договора — заказчики часто платят до подписания или во время */}
          {(contract.status === "SIGNED" || contract.status === "AWAITING_SIGNATURE" || contract.payments.length > 0) && <ContractPayments user={user} contract={contract} payments={contract.payments} />}
          {can(user.role, "contracts.manage") && !contract.quickOrder && (contract.status === "AWAITING_SIGNATURE" || contract.sbisDocumentId) && (
            <Card title="Подписание через ЭДО СБИС">
              {contract.sbisDocumentId ? (
                <div className="space-y-2 text-sm">
                  <p>
                    Состояние в СБИС: <span className="font-medium">{contract.sbisStateName ?? "—"}</span>
                    {contract.sbisSentAt && <span className="text-muted"> · загружен {fmtDateTime(contract.sbisSentAt)}</span>}
                  </p>
                  {contract.status === "AWAITING_SIGNATURE" && <p className="text-muted">Откройте документ в Saby, подпишите своей КЭП и отправьте заказчику. Когда он подпишет, договор здесь станет «Подписан» автоматически (проверка раз в 5 минут).</p>}
                  {contract.sbisLink && (
                    <a href={contract.sbisLink} target="_blank" rel="noopener" className={btnClass("primary", "sm")}>
                      Открыть в Saby
                    </a>
                  )}
                </div>
              ) : !sbisReady ? (
                <p className="text-sm text-muted">СБИС не подключён. Заказчик подписывает договор кодом из письма.</p>
              ) : (
                <ActionForm action={sendSbisAction} className="space-y-3">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <p className="text-xs text-muted">Для заказчиков с ЭДО. Договор загрузится в ваш СБИС как документ «Договор»; подписание кодом из письма остаётся доступным.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-muted">ИНН заказчика *</span>
                      <input name="inn" required inputMode="numeric" defaultValue={customer?.company?.inn ?? ""} className={fieldClass} />
                      <FieldError name="inn" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-muted">КПП (для организаций)</span>
                      <input name="kpp" inputMode="numeric" defaultValue={customer?.company?.kpp ?? ""} className={fieldClass} />
                      <FieldError name="kpp" />
                    </label>
                  </div>
                  <SubmitButton size="sm">Отправить в СБИС</SubmitButton>
                </ActionForm>
              )}
            </Card>
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
          {can(user.role, "contracts.manage") && !contract.quickOrder && (
            <Card title="Учёт">
              <ActionForm action={contractRevisionAction} className="space-y-2">
                <input type="hidden" name="contractId" value={contract.id} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="isRevision" defaultChecked={contract.isRevision} className="mt-0.5" />
                  <span>Редакция ранее выполненного проекта — не входит в бонус менеджера (3%)</span>
                </label>
                <SubmitButton size="sm" variant="secondary">
                  Сохранить
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
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
          {can(user.role, "contracts.manage") && contract.status !== "CANCELLED" && (
            <Card title="Редактирование договора">
              <ActionForm action={contractReviseAction} className="space-y-3">
                {contract.status === "SIGNED" && <Alert tone="warning">Договор подписан. Правка создаст новую редакцию — заказчику придётся подписать её заново. Прежняя подпись сохранится в истории.</Alert>}
                <p className="text-xs text-muted">Разметка: «# » — раздел, «^ » — строка по центру, строки «| … |» — таблица, «===» — новая страница.</p>
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
                  <textarea name="body" rows={18} defaultValue={current.body} className={`${fieldClass} font-mono text-xs`} />
                </label>
                <SubmitButton size="sm">Создать новую редакцию</SubmitButton>
              </ActionForm>
              <ActionForm action={contractCancelAction} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="contractId" value={contract.id} />
                <ConfirmSubmit title="Аннулировать договор?" text="Заказчик не сможет его подписать. Действие записывается в журнал.">
                  Аннулировать
                </ConfirmSubmit>
              </ActionForm>
              {!contract.project && !contract.quickOrder && (contract.status !== "SIGNED" || user.role === "DIRECTOR") && (
                <ActionForm action={deleteContractAction} className="mt-3">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="leadId" value={contract.lead?.id ?? ""} />
                  <ConfirmSubmit title="Удалить договор?" text="Ошибочный договор и все его редакции будут удалены без возможности восстановления. В журнале останется запись.">
                    Удалить договор
                  </ConfirmSubmit>
                </ActionForm>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
