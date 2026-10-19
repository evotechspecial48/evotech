import nodemailer from "nodemailer";
import { db } from "./db";
import { env } from "./env";
import { logger } from "./logger";

// Письма сначала сохраняются в очередь OutboundEmail, затем отправляются.
// Сбой SMTP не теряет письмо: воркер повторит отправку (до 5 попыток).

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
}

export async function queueEmail(to: string, subject: string, text: string): Promise<void> {
  const mail = await db.outboundEmail.create({ data: { to, subject, text } });
  // Отправляем сразу, не блокируя основной запрос
  void deliverEmail(mail.id);
}

export async function deliverEmail(id: string): Promise<void> {
  const mail = await db.outboundEmail.findUnique({ where: { id } });
  if (!mail || mail.status === "SENT") return;
  try {
    if (env.MAIL_TRANSPORT === "smtp") {
      await getTransport().sendMail({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
    } else {
      logger.info("mail.console", { subject: mail.subject, body: mail.text });
    }
    await db.outboundEmail.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null },
    });
  } catch (err) {
    logger.warn("mail.failed", { id, err });
    await db.outboundEmail.update({
      where: { id },
      data: { status: "FAILED", attempts: { increment: 1 }, error: err instanceof Error ? err.message.slice(0, 500) : "error" },
    });
  }
}

export async function retryFailedEmails(): Promise<number> {
  const pending = await db.outboundEmail.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 }, createdAt: { lt: new Date(Date.now() - 30_000) } },
    take: 20,
  });
  for (const m of pending) await deliverEmail(m.id);
  return pending.length;
}
