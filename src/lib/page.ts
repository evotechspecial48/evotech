import { notFound } from "next/navigation";
import { ForbiddenError } from "@/domain/rbac";
import { NotFoundError } from "./errors";

/** Для страниц: чужой или несуществующий объект → 404 (не раскрываем факт существования). */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound();
    throw e;
  }
}

export function pageParam(v: string | string[] | undefined, fallback = 1): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
