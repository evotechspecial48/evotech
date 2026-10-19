import { ForbiddenError } from "@/domain/rbac";
import { logger } from "./logger";

/** Ошибка, текст которой безопасно показать пользователю. */
export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export class NotFoundError extends UserError {
  constructor(what = "Объект") {
    super(`${what} не найден`);
    this.name = "NotFoundError";
  }
}

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
} | null;

/** Единая обработка ошибок серверных действий: пользователь видит понятный текст, детали — в логе. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const res = await fn();
    return res ?? { ok: true };
  } catch (err) {
    // Редирект Next.js реализован через исключение — пробрасываем
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    if (err instanceof UserError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    logger.error("action.failed", { err });
    return { ok: false, error: "Не удалось выполнить действие. Попробуйте ещё раз или обратитесь в поддержку." };
  }
}

export function str(fd: FormData, key: string, max = 5000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
