import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { db } from "./db";
import { isProd } from "./env";
import { randomToken, sha256 } from "./crypto";
import { can, ForbiddenError, type Permission, type RoleCode } from "@/domain/rbac";

export const SESSION_COOKIE = "evo_session";
const SESSION_DAYS = 14;
const BCRYPT_ROUNDS = 12;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "status" | "emailVerifiedAt" | "companyId" | "phone"> & {
  role: RoleCode;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function passwordProblems(password: string): string | null {
  if (password.length < 8) return "Пароль должен быть не короче 8 символов";
  if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) return "Пароль должен содержать буквы и цифры";
  return null;
}

export async function createSession(userId: string, ip: string | null, userAgent: string | null): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt, ip, userAgent } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, status: true, emailVerifiedAt: true, companyId: true, phone: true } },
    },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  return session.user as SessionUser;
}

/** Для страниц: без сессии — редирект на вход. */
export async function requireUser(permission?: Permission | Permission[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(user.role, p))) redirect("/cabinet?forbidden=1");
  }
  return user;
}

/** Для серверных действий и API: без прав — исключение. */
export async function actor(permission?: Permission | Permission[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Требуется вход в систему");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(user.role, p))) throw new ForbiddenError();
  }
  return user;
}
