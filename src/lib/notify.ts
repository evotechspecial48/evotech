import { db } from "./db";
import { env } from "./env";
import { queueEmail } from "./mailer";
import { logger } from "./logger";

export type NotificationType =
  | "project.assigned"
  | "status.changed"
  | "comment.new"
  | "request.new"
  | "request.answered"
  | "approval.pending"
  | "approval.changes"
  | "approval.approved"
  | "timer.paused"
  | "timer.resumed"
  | "deadline.warning"
  | "payment.completed"
  | "payment.failed"
  | "archive.ready"
  | "lead.new";

/**
 * Внутреннее уведомление + письмо. Ошибки доставки не прерывают основную операцию.
 * Каналы Telegram/SMS подключаются здесь же (см. docs/ARCHITECTURE.md).
 */
export async function notify(
  userIds: (string | null | undefined)[],
  type: NotificationType,
  title: string,
  body?: string,
  link?: string,
  opts: { email?: boolean; exceptUserId?: string } = {},
): Promise<void> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== opts.exceptUserId))];
  if (!ids.length) return;
  try {
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, type, title, body, link })) });
    if (opts.email !== false) {
      const users = await db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { email: true } });
      const url = link ? `${env.APP_URL}${link}` : env.APP_URL;
      for (const u of users) {
        await queueEmail(u.email, `EvoTechnology: ${title}`, `${title}\n\n${body ?? ""}\n\nОткрыть: ${url}\n\n— Сервис EvoTechnology`);
      }
    }
  } catch (err) {
    logger.error("notify.failed", { type, err });
  }
}

export async function staffWithRole(role: "DIRECTOR" | "PROJECT_MANAGER" | "SALES_MANAGER"): Promise<string[]> {
  const users = await db.user.findMany({ where: { role, status: "ACTIVE" }, select: { id: true } });
  return users.map((u) => u.id);
}
