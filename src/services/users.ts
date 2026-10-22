import type { AuthTokenType, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { queueEmail } from "@/lib/mailer";
import { randomToken, sha256 } from "@/lib/crypto";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { NotFoundError, UserError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { ForbiddenError, ROLE_LABELS } from "@/domain/rbac";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

async function issueToken(userId: string, type: AuthTokenType, ttlHours: number): Promise<string> {
  const token = randomToken();
  await db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlHours * 3600_000) } });
  return token;
}

async function consumeToken(token: string, type: AuthTokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  await db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row;
}

export async function sendVerification(userId: string, email: string) {
  const token = await issueToken(userId, "VERIFY_EMAIL", 48);
  await queueEmail(email, "Подтвердите адрес электронной почты", `Здравствуйте!\n\nДля подтверждения адреса перейдите по ссылке:\n${env.APP_URL}/verify-email?token=${token}\n\nСсылка действует 48 часов.`);
}

export async function registerCustomer(input: { name: string; email: string; phone: string; password: string; company?: string; consent: boolean }, ip: string | null) {
  const email = normalizeEmail(input.email);
  const errors: Record<string, string> = {};
  if (input.name.length < 2) errors.name = "Укажите имя";
  if (!isEmail(email)) errors.email = "Некорректный адрес электронной почты";
  const pw = passwordProblems(input.password);
  if (pw) errors.password = pw;
  if (!input.consent) errors.consent = "Необходимо согласие на обработку персональных данных";
  if (Object.keys(errors).length) throw new UserError("Проверьте поля формы", errors);
  const limit = await rateLimit(`register:${ip}`, 10, 3600);
  if (!limit.ok) throw new UserError("Слишком много регистраций с этого адреса. Попробуйте позже.");

  const existing = await db.user.findUnique({ where: { email } });
  // Приглашённый заказчик (созданный менеджером) завершает регистрацию сам
  if (existing && existing.status !== "INVITED") throw new UserError("Пользователь с такой почтой уже зарегистрирован", { email: "Почта уже используется" });
  const passwordHash = await hashPassword(input.password);
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { name: input.name, phone: input.phone || null, passwordHash, status: "ACTIVE" } })
    : await db.user.create({
        data: {
          email,
          name: input.name,
          phone: input.phone || null,
          passwordHash,
          role: "CUSTOMER",
          company: input.company ? { create: { name: input.company } } : undefined,
        },
      });
  // Привязать ранее оставленные с этой почты заявки
  await db.lead.updateMany({ where: { email, customerId: null }, data: { customerId: user.id } });
  await audit({ actorId: user.id, action: "auth.register", entityType: "User", entityId: user.id, ip });
  await sendVerification(user.id, email);
  return user;
}

export async function verifyEmail(token: string) {
  const row = await consumeToken(token, "VERIFY_EMAIL");
  if (!row) throw new UserError("Ссылка недействительна или устарела");
  await db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: row.userId, action: "auth.email_verified", entityType: "User", entityId: row.userId });
}

/** Вход: ограничение частоты по IP и почте, временная блокировка после серии неудачных попыток. */
export async function authenticate(emailRaw: string, password: string, ip: string | null) {
  const email = normalizeEmail(emailRaw);
  const byIp = await rateLimit(`login-ip:${ip}`, 30, 900);
  const byEmail = await rateLimit(`login:${email}`, 10, 900);
  if (!byIp.ok || !byEmail.ok) throw new UserError("Слишком много попыток входа. Попробуйте через несколько минут.");
  const user = await db.user.findUnique({ where: { email } });
  const fail = async () => {
    if (user) {
      const failed = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
    }
    await audit({ actorId: user?.id ?? null, action: "auth.login_failed", ip, meta: { reason: user ? "password" : "unknown_user" } });
    throw new UserError("Неверная почта или пароль");
  };
  if (!user || !user.passwordHash) return fail();
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new UserError("Учётная запись временно заблокирована из-за неудачных попыток входа. Попробуйте позже или восстановите пароль.");
  if (!(await verifyPassword(password, user.passwordHash))) return fail();
  if (user.status === "BLOCKED") throw new UserError("Учётная запись заблокирована. Обратитесь к администратору.");
  if (user.status === "INVITED") throw new UserError("Завершите регистрацию по ссылке из приглашения");
  // Задел 2FA: при twoFactorEnabled здесь возвращается признак второго шага вместо создания сессии
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip });
  return user;
}

export async function requestPasswordReset(emailRaw: string, ip: string | null) {
  const email = normalizeEmail(emailRaw);
  const limit = await rateLimit(`reset:${ip}`, 5, 3600);
  if (!limit.ok) throw new UserError("Слишком много запросов. Попробуйте позже.");
  const user = await db.user.findUnique({ where: { email } });
  // Ответ одинаковый, чтобы не раскрывать наличие учётной записи
  if (!user || user.status === "BLOCKED") return;
  const token = await issueToken(user.id, "RESET_PASSWORD", 2);
  await queueEmail(email, "Восстановление пароля", `Для установки нового пароля перейдите по ссылке:\n${env.APP_URL}/reset-password?token=${token}\n\nСсылка действует 2 часа. Если вы не запрашивали восстановление, проигнорируйте письмо.`);
}

/** Смена пароля из профиля: проверка текущего, завершение остальных сессий. */
export async function changePassword(actor: SessionUser, current: string, next: string, keepSessionId: string | null) {
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new UserError("Текущий пароль указан неверно", { current: "Неверный пароль" });
  const pw = passwordProblems(next);
  if (pw) throw new UserError(pw, { password: pw });
  if (current === next) throw new UserError("Новый пароль совпадает с текущим", { password: "Пароль не изменился" });
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: actor.id, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  await audit({ actorId: actor.id, action: "auth.password_reset", entityType: "User", entityId: actor.id, meta: { via: "profile" } });
}

export async function resetPassword(token: string, password: string) {
  const pw = passwordProblems(password);
  if (pw) throw new UserError(pw, { password: pw });
  const row = await consumeToken(token, "RESET_PASSWORD");
  if (!row) throw new UserError("Ссылка недействительна или устарела");
  await db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, emailVerifiedAt: new Date() } });
  await db.session.deleteMany({ where: { userId: row.userId } });
  await audit({ actorId: row.userId, action: "auth.password_reset", entityType: "User", entityId: row.userId });
}

/** Приглашение сотрудника или заказчика: учётная запись в статусе INVITED, ссылка на установку пароля. */
export async function inviteUser(actor: SessionUser | null, input: { email: string; name: string; role: Role; phone?: string; position?: string }) {
  if (actor && actor.role !== "DIRECTOR" && input.role !== "CUSTOMER") throw new ForbiddenError("Приглашать сотрудников может директор");
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new UserError("Некорректный адрес электронной почты", { email: "Некорректный адрес" });
  let user = await db.user.findUnique({ where: { email } });
  if (user && user.status !== "INVITED") return { user, invited: false };
  if (!user) {
    user = await db.user.create({ data: { email, name: input.name || email, role: input.role, phone: input.phone || null, position: input.position || null, status: "INVITED" } });
  }
  const token = await issueToken(user.id, "INVITE", 24 * 7);
  await queueEmail(
    email,
    "Приглашение в сервис EvoTechnology",
    `Здравствуйте, ${user.name}!\n\nВас пригласили в сервис EvoTechnology (роль: ${ROLE_LABELS[user.role]}).\nЧтобы задать пароль и войти, перейдите по ссылке:\n${env.APP_URL}/invite?token=${token}\n\nСсылка действует 7 дней.`,
  );
  await audit({ actorId: actor?.id ?? null, action: "user.invite", entityType: "User", entityId: user.id, meta: { role: input.role } });
  return { user, invited: true };
}

export async function acceptInvite(token: string, password: string, consent: boolean) {
  if (!consent) throw new UserError("Необходимо согласие на обработку персональных данных");
  const pw = passwordProblems(password);
  if (pw) throw new UserError(pw, { password: pw });
  const row = await consumeToken(token, "INVITE");
  if (!row) throw new UserError("Приглашение недействительно или устарело");
  const user = await db.user.update({
    where: { id: row.userId },
    data: { passwordHash: await hashPassword(password), status: "ACTIVE", emailVerifiedAt: new Date() },
  });
  return user;
}

export async function setUserStatus(actor: SessionUser, userId: string, status: "ACTIVE" | "BLOCKED") {
  if (actor.role !== "DIRECTOR") throw new ForbiddenError();
  if (actor.id === userId) throw new UserError("Нельзя заблокировать собственную учётную запись");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("Пользователь");
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "BLOCKED") await db.session.deleteMany({ where: { userId } });
  await audit({ actorId: actor.id, action: status === "BLOCKED" ? "user.block" : "user.unblock", entityType: "User", entityId: userId });
}

export async function updateUser(actor: SessionUser, userId: string, data: { name: string; role: Role; phone: string; position: string }) {
  if (actor.role !== "DIRECTOR") throw new ForbiddenError();
  if (actor.id === userId && data.role !== "DIRECTOR") throw new UserError("Нельзя снять с себя роль директора");
  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) throw new NotFoundError("Пользователь");
  await db.user.update({ where: { id: userId }, data: { name: data.name, role: data.role, phone: data.phone || null, position: data.position || null } });
  await audit({ actorId: actor.id, action: "user.update", entityType: "User", entityId: userId, meta: { from: { role: before.role }, to: { role: data.role } } });
}

/** Экспорт персональных данных пользователя (по запросу субъекта ПДн). */
export async function exportPersonalData(actor: SessionUser, userId: string) {
  if (actor.id !== userId && actor.role !== "DIRECTOR") throw new ForbiddenError();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, phone: true, position: true, role: true, createdAt: true, lastLoginAt: true,
      company: true,
      customerLeads: { select: { number: true, title: true, contactName: true, email: true, phone: true, createdAt: true } },
      customerProjects: { select: { number: true, title: true, createdAt: true } },
      quickOrders: { select: { number: true, structureType: true, createdAt: true } },
    },
  });
  if (!user) throw new NotFoundError("Пользователь");
  const acceptances = await db.contractAcceptance.findMany({ where: { userId }, select: { acceptedAt: true, ip: true, method: true, contract: { select: { number: true } } } });
  await audit({ actorId: actor.id, action: "user.export", entityType: "User", entityId: userId });
  return { exportedAt: new Date().toISOString(), user, contractAcceptances: acceptances };
}

/**
 * Обезличивание ПДн (вместо физического удаления): договоры, платежи и журнал сохраняются
 * в соответствии с требованиями хранения бухгалтерских документов.
 */
export async function anonymizeUser(actor: SessionUser, userId: string) {
  if (actor.role !== "DIRECTOR") throw new ForbiddenError();
  if (actor.id === userId) throw new UserError("Нельзя обезличить собственную учётную запись");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("Пользователь");
  const stub = `deleted-${user.id}@anonymized.local`;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { email: stub, name: "Пользователь удалён", phone: null, position: null, passwordHash: null, status: "BLOCKED", anonymizedAt: new Date(), twoFactorSecret: null } }),
    db.lead.updateMany({ where: { customerId: userId }, data: { contactName: "Обезличено", email: stub, phone: null } }),
    db.session.deleteMany({ where: { userId } }),
    db.authToken.deleteMany({ where: { userId } }),
  ]);
  await audit({ actorId: actor.id, action: "user.anonymize", entityType: "User", entityId: userId });
}
