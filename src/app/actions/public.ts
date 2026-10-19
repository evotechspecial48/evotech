"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { LeadSource } from "@prisma/client";
import { runAction, str, UserError, type ActionState } from "@/lib/errors";
import { clientInfo } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { createSession, destroySession, getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createLead } from "@/services/leads";
import { acceptInvite, authenticate, registerCustomer, requestPasswordReset, resetPassword, verifyEmail } from "@/services/users";

const SOURCES: LeadSource[] = ["site_form", "site_calculator", "site_contact"];

async function utmFromCookie(): Promise<Record<string, string> | null> {
  try {
    const raw = (await cookies()).get("evo_utm")?.value;
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** Публичная заявка: honeypot, минимальное время заполнения, лимит по IP, согласие на обработку ПДн. */
export async function submitLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ip } = await clientInfo();
    if (str(fd, "website")) return { ok: true, message: "Спасибо! Заявка отправлена." }; // бот — молча игнорируем
    const startedAt = Number(str(fd, "ts"));
    if (startedAt && Date.now() - startedAt < 2500) throw new UserError("Форма отправлена слишком быстро. Попробуйте ещё раз.");
    const limit = await rateLimit(`lead:${ip}`, 5, 600);
    if (!limit.ok) throw new UserError("Слишком много заявок с вашего адреса. Позвоните нам или попробуйте позже.");
    if (fd.get("consent") !== "on") throw new UserError("Нужно согласие на обработку персональных данных", { consent: "Отметьте согласие" });
    const sourceRaw = str(fd, "source") as LeadSource;
    const source = SOURCES.includes(sourceRaw) ? sourceRaw : "site_form";
    const user = await getSessionUser();
    const lead = await createLead(
      {
        title: str(fd, "title", 200) || "Заявка с сайта",
        contactName: str(fd, "contactName", 120),
        email: str(fd, "email", 200),
        phone: str(fd, "phone", 30),
        companyName: str(fd, "companyName", 200),
        objectType: str(fd, "objectType", 100),
        description: str(fd, "description", 4000),
        budget: str(fd, "budget", 100),
        source: user?.role === "CUSTOMER" ? "cabinet" : source,
        utm: await utmFromCookie(),
        referrer: str(fd, "referrer", 500),
      },
      user?.role === "CUSTOMER" ? user : null,
      ip,
    );
    return { ok: true, message: `Заявка №${lead.number} принята. Менеджер свяжется с вами в течение рабочего дня.` };
  });
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const { ip, userAgent } = await clientInfo();
    const user = await authenticate(str(fd, "email"), String(fd.get("password") ?? ""), ip);
    await createSession(user.id, ip, userAgent);
  });
  if (res?.ok) {
    const next = str(fd, "next");
    redirect(next.startsWith("/cabinet") ? next : "/cabinet");
  }
  return res;
}

export async function logoutAction() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ actorId: user.id, action: "auth.logout" });
  redirect("/login");
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const { ip, userAgent } = await clientInfo();
    const user = await registerCustomer(
      {
        name: str(fd, "name", 120),
        email: str(fd, "email", 200),
        phone: str(fd, "phone", 30),
        password: String(fd.get("password") ?? ""),
        company: str(fd, "company", 200),
        consent: fd.get("consent") === "on",
      },
      ip,
    );
    await createSession(user.id, ip, userAgent);
  });
  if (res?.ok) {
    const next = str(fd, "next");
    redirect(next.startsWith("/cabinet") ? next : "/cabinet?welcome=1");
  }
  return res;
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ip } = await clientInfo();
    await requestPasswordReset(str(fd, "email"), ip);
    return { ok: true, message: "Если учётная запись существует, мы отправили письмо со ссылкой для восстановления." };
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    await resetPassword(str(fd, "token"), String(fd.get("password") ?? ""));
  });
  if (res?.ok) redirect("/login?reset=1");
  return res;
}

export async function acceptInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const { ip, userAgent } = await clientInfo();
    const user = await acceptInvite(str(fd, "token"), String(fd.get("password") ?? ""), fd.get("consent") === "on");
    await createSession(user.id, ip, userAgent);
  });
  if (res?.ok) redirect("/cabinet");
  return res;
}

export async function verifyEmailAction(token: string): Promise<ActionState> {
  return runAction(async () => {
    await verifyEmail(token);
    return { ok: true, message: "Адрес электронной почты подтверждён." };
  });
}
