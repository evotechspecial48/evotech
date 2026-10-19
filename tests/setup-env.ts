// Окружение тестов: отдельная БД evotech_test, письма — в лог, демо-AI без задержки.
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const base = process.env.DATABASE_URL ?? "postgresql://evotech:evotech@localhost:5432/evotech?schema=public";
// Идемпотентно: файл выполняется и в globalSetup, и в каждом воркере
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? (/_test(\?|$)/.test(base) ? base : base.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2"));
process.env.MAIL_TRANSPORT = "console";
process.env.MOCK_AI_DELAY_MS = "0";
process.env.AI_PROVIDER = "mock";
process.env.PAYMENT_PROVIDER = "mock";
process.env.STORAGE_DIR = "./storage/test";
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret";
