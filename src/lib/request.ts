import { headers } from "next/headers";
import { env } from "./env";

export async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/** CSRF-защита для API-маршрутов: Origin/Referer должен совпадать с хостом запроса. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Абсолютный адрес для редиректа из API-маршрута. Не от req.url: за Caddy внутри контейнера это
 * http://0.0.0.0:3000, и браузер уходил на недоступный https://0.0.0.0:3000/… («Страница недоступна»).
 */
export function appUrl(path: string): URL {
  return new URL(path, env.APP_URL);
}
