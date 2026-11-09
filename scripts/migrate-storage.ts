// Перенос файлов с диска сервера в WebDAV-хранилище (Облако Mail.ru) по путям из базы (FileAsset.storageKey).
// Безопасно запускать повторно: файл, который уже есть в облаке с той же контрольной суммой, пропускается.
// Локальные копии не удаляются — их можно убрать вручную после проверки скачивания.
// Запуск в контейнере воркера: npx tsx scripts/migrate-storage.ts [--dry]

import path from "node:path";
import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { sha256 } from "../src/lib/crypto";
import { LocalStorage, WebDavStorage } from "../src/lib/storage";

const dry = process.argv.includes("--dry");

async function main() {
  if (!env.WEBDAV_URL || !env.WEBDAV_USER || !env.WEBDAV_PASSWORD) throw new Error("Не заданы WEBDAV_URL / WEBDAV_USER / WEBDAV_PASSWORD");
  const local = new LocalStorage(path.resolve(env.STORAGE_DIR));
  const cloud = new WebDavStorage(env.WEBDAV_URL, env.WEBDAV_USER, env.WEBDAV_PASSWORD, env.WEBDAV_ROOT);
  const check = await cloud.check();
  if (!check.ok) throw new Error(`Облако недоступно: ${check.message}`);

  const files = await db.fileAsset.findMany({ where: { deletedAt: null }, select: { id: true, storageKey: true, checksum: true, mimeType: true, size: true }, orderBy: { createdAt: "asc" } });
  let copied = 0, skipped = 0, missing = 0, failed = 0;
  for (const f of files) {
    try {
      const already = await cloud.get(f.storageKey).catch(() => null);
      if (already && sha256(already) === f.checksum) {
        skipped++;
        continue;
      }
      const data = await local.get(f.storageKey).catch(() => null);
      if (!data) {
        missing++;
        console.warn(`нет на диске: ${f.storageKey}`);
        continue;
      }
      if (sha256(data) !== f.checksum) console.warn(`контрольная сумма на диске не совпадает с базой: ${f.storageKey}`);
      if (!dry) {
        await cloud.put(f.storageKey, data, f.mimeType);
        const back = await cloud.get(f.storageKey);
        if (sha256(back) !== sha256(data)) throw new Error("файл в облаке повреждён при передаче");
      }
      copied++;
      console.log(`${dry ? "[проверка] " : ""}перенесён: ${f.storageKey} (${(f.size / 1024 / 1024).toFixed(1)} МБ)`);
    } catch (err) {
      failed++;
      console.error(`ошибка: ${f.storageKey}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Итого файлов: ${files.length}. Перенесено: ${copied}, уже в облаке: ${skipped}, нет на диске: ${missing}, ошибок: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
