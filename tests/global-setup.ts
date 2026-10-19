import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";
import "./setup-env";

declare module "vitest" {
  export interface ProvidedContext {
    integrationDb: boolean;
  }
}

/**
 * Готовит отдельную тестовую БД (имя оканчивается на _test): создаёт её при необходимости
 * и применяет миграции (неразрушающий migrate deploy). Данные очищаются в самих тестах.
 * Если PostgreSQL недоступен — интеграционные тесты пропускаются.
 */
export default function setup(project: TestProject) {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(new URL(url).pathname + "?")) {
    project.provide("integrationDb", false);
    return;
  }
  try {
    execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env, timeout: 120_000 });
    project.provide("integrationDb", true);
  } catch (err) {
    console.warn("[tests] PostgreSQL недоступен — интеграционные тесты будут пропущены:", (err as Error).message.split("\n")[0]);
    project.provide("integrationDb", false);
  }
}
