import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { markNotificationsReadAction, openNotificationAction } from "@/app/actions/cabinet";
import { btnClass, Card, cx, EmptyState, fmtDateTime, PageHeader } from "@/components/ui";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Уведомления"
        subtitle={unread ? `Непрочитанных: ${unread}` : "Все уведомления прочитаны"}
        actions={
          unread > 0 && (
            <form action={markNotificationsReadAction}>
              <button className={btnClass("secondary", "sm")}>Отметить все прочитанными</button>
            </form>
          )
        }
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="Уведомлений нет" text="Здесь появятся назначения, запросы, согласования и события по оплате." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className={cx("flex w-full items-start gap-3 py-3 text-left hover:bg-steel-50", !n.readAt && "font-medium")}>
                    <span aria-hidden="true" className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-steel-200" : "bg-signal-500")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        {!n.readAt && <span className="sr-only">Новое: </span>}
                        {n.title}
                      </span>
                      {n.body && <span className="block truncate text-sm font-normal text-muted">{n.body}</span>}
                    </span>
                    <time className="shrink-0 text-xs font-normal text-muted">{fmtDateTime(n.createdAt)}</time>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
