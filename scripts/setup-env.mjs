// Создаёт .env из .env.example со случайным APP_SECRET. Существующий .env не трогает.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) {
  console.log(".env уже существует — оставлен без изменений.");
  process.exit(0);
}
const secret = randomBytes(32).toString("hex");
const env = readFileSync(".env.example", "utf8").replace(/^APP_SECRET=.*$/m, `APP_SECRET=${secret}`);
writeFileSync(".env", env);
console.log("Создан .env со случайным APP_SECRET.");
