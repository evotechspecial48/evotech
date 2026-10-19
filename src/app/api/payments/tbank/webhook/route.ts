import { logger } from "@/lib/logger";
import { handlePaymentNotification } from "@/services/payments";

/**
 * Уведомления Т-Банка (NotificationURL). Подлинность проверяется по Token, повторные
 * уведомления обрабатываются идемпотентно. Банк ожидает ответ «OK» с кодом 200.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    const res = await handlePaymentNotification(body);
    if (!res.ok && res.reason === "signature") return new Response("invalid token", { status: 403 });
    // Неизвестный заказ / сумма — подтверждаем приём, чтобы банк не повторял, и пишем в лог
    return new Response("OK", { status: 200 });
  } catch (err) {
    logger.error("payment.webhook_failed", { err });
    // 500 — банк повторит уведомление позже
    return new Response("error", { status: 500 });
  }
}
