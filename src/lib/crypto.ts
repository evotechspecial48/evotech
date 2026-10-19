import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export function hmac(value: string): string {
  return createHmac("sha256", env.APP_SECRET).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Подписанная временная ссылка: payload.exp.sig */
export function signPayload(payload: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${Buffer.from(payload).toString("base64url")}.${exp}`;
  return `${body}.${hmac(body)}`;
}

export function verifyPayload(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [b64, exp, sig] = parts;
  if (!safeEqual(hmac(`${b64}.${exp}`), sig)) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return Buffer.from(b64, "base64url").toString();
}
