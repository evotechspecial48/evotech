import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/domain/rbac";
import { AI_JOB_STATUS, PAYMENT_STATUS, QUICK_ORDER_STATUS, STRUCTURE_TYPE } from "@/domain/labels";
import { canDownloadResult, canPay } from "@/domain/access";
import { COVERINGS, FOUNDATIONS, FRAMES, quickOrderPrice, ROOF_TYPES, type QuickOrderParams } from "@/domain/quick-order";
import { cancelQuickOrderAction, payQuickOrderAction, retryJobAction, selectVariantAction } from "@/app/actions/cabinet";
import { ActionForm, AutoRefresh, ConfirmSubmit, SubmitButton } from "@/components/client";
import { ContractSign } from "@/components/cabinet/contract-sign";
import { FileList } from "@/components/cabinet/shared";
import { Alert, Badge, btnClass, Card, cx, DefList, fmtDateTime, PageHeader, rub, StatusBadge, Table } from "@/components/ui";

const FLOW = [
  { key: "GENERATING", label: "Генерация вариантов" },
  { key: "AWAITING_SELECTION", label: "Выбор варианта" },
  { key: "CONTRACT", label: "Договор" },
  { key: "AWAITING_PAYMENT", label: "Оплата" },
  { key: "PROCESSING", label: "Документация" },
  { key: "COMPLETED", label: "Готово" },
];
const ORDER = ["DRAFT", "GENERATING", "AWAITING_SELECTION", "CONTRACT", "AWAITING_PAYMENT", "PAID", "PROCESSING", "COMPLETED"];

export default async function QuickOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment: paymentResult } = await searchParams;
  const user = await requireUser(["quick_orders.create", "quick_orders.view_all"]);
  const qo = await db.quickOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, email: true } },
      variants: { orderBy: { priceDelta: "asc" } },
      aiJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      contract: { include: { versions: { orderBy: { version: "desc" }, take: 1 }, acceptances: { include: { version: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
      files: { where: { deletedAt: null, category: "PHOTO" } },
    },
  });
  if (!qo) notFound();
  const isOwner = qo.customerId === user.id;
  if (!isOwner && !can(user.role, "quick_orders.view_all")) notFound();
  const p = qo.params as unknown as QuickOrderParams;
  const job = qo.aiJobs[0];
  const busy = job && ["queued", "processing", "generating_package"].includes(job.status);
  const paid = qo.payments.find((x) => x.status === "paid");
  const accepted = qo.contract?.acceptances.map((a) => a.version.version).sort((a, b) => b - a)[0] ?? null;
  const payGate = canPay({ contractStatus: qo.contract?.status ?? null, acceptedVersion: accepted, currentVersion: qo.contract?.currentVersion ?? null, alreadyPaid: !!paid });
  const archiveGate = canDownloadResult({ isOwner, isStaff: can(user.role, "quick_orders.view_all"), contractStatus: qo.contract?.status ?? null, paymentRequired: true, paymentStatus: paid ? "paid" : null, resultStatus: job?.status ?? null });
  const currentIdx = ORDER.indexOf(qo.status === "PAID" ? "PROCESSING" : qo.status);

  return (
    <>
      <AutoRefresh active={!!busy} />
      <PageHeader
        back={{ href: "/cabinet/quick-orders", label: "К заказам" }}
        title={`Быстрый заказ №${qo.number}`}
        subtitle={`${STRUCTURE_TYPE[qo.structureType]} ${p.length}×${p.width}×${p.height} м · ${qo.customer.name}`}
        actions={<StatusBadge map={QUICK_ORDER_STATUS} value={qo.status} />}
      />
      {job?.demo !== false && (
        <div className="mb-5">
          <Alert tone="warning" title="Демонстрационный режим">
            Варианты эскиза и пакет документации формирует тестовый генератор. Результат не предназначен для строительства.
          </Alert>
        </div>
      )}
      {paymentResult === "success" && !paid && (
        <div className="mb-5">
          <Alert tone="info">Ожидаем подтверждение оплаты от банка…</Alert>
        </div>
      )}
      {paymentResult === "fail" && (
        <div className="mb-5">
          <Alert tone="danger" title="Оплата не прошла">
            Попробуйте ещё раз или используйте другую карту. Заказ сохранён.
          </Alert>
        </div>
      )}

      {qo.status !== "CANCELLED" && (
        <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Этапы заказа">
          {FLOW.map((f) => {
            const idx = ORDER.indexOf(f.key);
            const done = currentIdx > idx || qo.status === "COMPLETED";
            const active = currentIdx === idx && qo.status !== "COMPLETED";
            return (
              <li key={f.key} aria-current={active ? "step" : undefined} className={cx("rounded-lg border px-3 py-2 text-xs", done ? "border-[#bfe3cf] bg-success-50 text-success-700" : active ? "border-accent-600 bg-accent-50 font-medium text-accent-700" : "border-line text-muted")}>
                {done ? "✓ " : active ? "● " : "○ "}
                {f.label}
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          {job && (busy || job.status === "failed") && (
            <Card title="AI-задача" actions={<StatusBadge map={AI_JOB_STATUS} value={job.status} />}>
              {busy && (
                <div className="flex items-center gap-3 text-sm" role="status">
                  <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-accent-600 border-r-transparent" />
                  {job.status === "generating_package" ? "Формируем пакет документации…" : "Генерируем варианты эскиза…"} Страница обновится автоматически.
                </div>
              )}
              {job.status === "failed" && (
                <div className="space-y-3">
                  <Alert tone="danger" title="Не удалось выполнить задачу">
                    {job.error}
                  </Alert>
                  <ActionForm action={retryJobAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <SubmitButton size="sm">Повторить запуск</SubmitButton>
                  </ActionForm>
                  <p className="text-xs text-muted">Попыток: {job.attempts}</p>
                </div>
              )}
            </Card>
          )}

          {qo.variants.length > 0 && (
            <Card title="Варианты эскиза">
              <div className="grid gap-4 lg:grid-cols-3">
                {qo.variants.map((v) => {
                  const price = quickOrderPrice(qo.structureType, p, v.priceDelta);
                  return (
                    <article key={v.id} className={cx("flex flex-col rounded-lg border p-3", v.status === "SELECTED" ? "border-success-700 ring-2 ring-[#bfe3cf]" : v.status === "REJECTED" ? "border-line opacity-70" : "border-line")}>
                      <a href={`data:image/svg+xml;utf8,${encodeURIComponent(v.imageSvg)}`} target="_blank" rel="noopener" aria-label={`Открыть эскиз «${v.title}» крупно`} className="block overflow-hidden rounded border border-line bg-white">
                        <span dangerouslySetInnerHTML={{ __html: v.imageSvg }} />
                      </a>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <h3 className="font-semibold">{v.title}</h3>
                        {v.status === "SELECTED" && <Badge tone="success">Выбран</Badge>}
                      </div>
                      <p className="mt-1 flex-1 text-sm text-muted">{v.description}</p>
                      <p className="mt-2 text-lg font-semibold">{rub(price)}</p>
                      {isOwner && qo.status === "AWAITING_SELECTION" && (
                        <ActionForm action={selectVariantAction} className="mt-2">
                          <input type="hidden" name="quickOrderId" value={qo.id} />
                          <input type="hidden" name="variantId" value={v.id} />
                          <SubmitButton size="sm" className="w-full">
                            Выбрать
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </article>
                  );
                })}
              </div>
            </Card>
          )}

          {qo.contract && (
            <Card title={`Договор ${qo.contract.number}`} actions={<Link href={`/cabinet/contracts/${qo.contract.id}`} className={btnClass("ghost", "sm")}>Открыть</Link>}>
              {qo.contract.status === "SIGNED" ? (
                <Alert tone="success">Договор подтверждён (редакция {accepted}).</Alert>
              ) : (
                <>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-steel-50 p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm">{qo.contract.versions[0]?.body}</pre>
                  </div>
                  {isOwner && qo.contract.status === "AWAITING_SIGNATURE" && (
                    <div className="mt-4">
                      <ContractSign contractId={qo.contract.id} version={qo.contract.currentVersion} back={`/cabinet/quick-orders/${qo.id}`} />
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {qo.contract && !["COMPLETED", "CANCELLED"].includes(qo.status) && (
            <Card title="Оплата">
              {paid ? (
                <Alert tone="success">Оплачено {fmtDateTime(paid.paidAt)}.</Alert>
              ) : payGate.ok ? (
                isOwner ? (
                  <ActionForm action={payQuickOrderAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="quickOrderId" value={qo.id} />
                    <SubmitButton variant="signal" size="lg" pendingText="Переходим к оплате…">
                      Оплатить {rub(qo.price)}
                    </SubmitButton>
                    <span className="text-xs text-muted">Защищённая платёжная форма Т-Банка{qo.payments[0]?.testMode !== false ? " (тестовый режим)" : ""}</span>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-muted">Ожидается оплата заказчиком.</p>
                )
              ) : (
                <div className="space-y-2">
                  <button disabled className={btnClass("signal", "lg")} aria-describedby="pay-reason">
                    Оплатить {rub(qo.price)}
                  </button>
                  <p id="pay-reason" className="text-sm text-muted">
                    Оплата недоступна: {payGate.reasons.join("; ").toLowerCase()}.
                  </p>
                </div>
              )}
            </Card>
          )}

          <Card title="Итоговый архив">
            {archiveGate.ok && qo.archiveFileId ? (
              <div className="space-y-3">
                <a href={`/api/quick-orders/${qo.id}/archive`} className={btnClass("primary", "lg")}>
                  ⤓ Скачать архив документации
                </a>
                <p className="text-sm text-muted">Эскизы, визуализации, 3D-модель (IFC), рабочие чертежи, спецификации, ведомости, пояснительная записка. Ссылка на файл действует 5 минут.</p>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-muted">Архив станет доступен при выполнении условий:</p>
                <ul className="space-y-1">
                  {[
                    ["Договор подтверждён", qo.contract?.status === "SIGNED"],
                    ["Оплата завершена", !!paid],
                    ["Документация сформирована", job?.status === "completed"],
                  ].map(([l, ok]) => (
                    <li key={l as string} className={ok ? "text-success-700" : "text-muted"}>
                      {ok ? "✓" : "○"} {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Параметры">
            <DefList
              items={[
                ["Конструкция", STRUCTURE_TYPE[qo.structureType]],
                ["Габариты", `${p.length} × ${p.width} м, H ${p.height} м`],
                ["Кровля", `${ROOF_TYPES[p.roofType]}, ${COVERINGS[p.covering].toLowerCase()}`],
                ["Каркас", FRAMES[p.frame]],
                ["Фундамент", FOUNDATIONS[p.foundation]],
                ["Регион", `${p.region}, снеговой район ${p.snowDistrict}`],
                ["Цвет", p.color],
                ["Пожелания", p.notes],
                ["Стоимость", rub(qo.price)],
                ["Создан", fmtDateTime(qo.createdAt)],
              ]}
            />
          </Card>
          <Card title="Фото участка">
            <FileList files={qo.files} emptyText="Фото не загружены" />
          </Card>
          {qo.payments.length > 0 && (
            <Card title="История оплат">
              <Table head={["Дата", "Сумма", "Статус"]}>
                {qo.payments.map((x) => (
                  <tr key={x.id}>
                    <td>{fmtDateTime(x.createdAt)}</td>
                    <td>{rub(x.amount / 100)}</td>
                    <td>
                      <StatusBadge map={PAYMENT_STATUS} value={x.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          {isOwner && !paid && !["CANCELLED", "COMPLETED"].includes(qo.status) && (
            <ActionForm action={cancelQuickOrderAction}>
              <input type="hidden" name="quickOrderId" value={qo.id} />
              <ConfirmSubmit title="Отменить заказ?" text="Неоплаченный заказ будет отменён.">
                Отменить заказ
              </ConfirmSubmit>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
