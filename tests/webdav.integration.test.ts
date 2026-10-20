// Проверка WebDAV-драйвера (Облако Mail.ru) на любом WebDAV-сервере.
// Запуск: WEBDAV_TEST_URL=http://localhost:8088 WEBDAV_TEST_USER=tester WEBDAV_TEST_PASSWORD=... npm test
// Локальный сервер для проверки: docker run -p 8088:8080 rclone/rclone serve webdav /data --addr :8080 --user tester --pass ...
import { describe, expect, it } from "vitest";
import { WebDavStorage } from "@/lib/storage";

const url = process.env.WEBDAV_TEST_URL;

describe.skipIf(!url)("WebDAV-хранилище", () => {
  const store = new WebDavStorage(url!, process.env.WEBDAV_TEST_USER ?? "", process.env.WEBDAV_TEST_PASSWORD ?? "", "/EvoTech-test");
  const key = `Проекты/12 НОРЛАБ — МАФ/03 3D-модель/${Date.now()}_модель v2.ifc`;
  const payload = Buffer.from("ISO-10303-21; тестовая модель ".repeat(5000));

  it("сохраняет файл во вложенные папки с кириллицей", async () => {
    await store.put(key, payload, "application/x-step");
    expect((await store.get(key)).equals(payload)).toBe(true);
  });

  it("отдаёт файл потоком", async () => {
    const chunks: Uint8Array[] = [];
    const reader = (await store.stream(key)).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(Buffer.concat(chunks).length).toBe(payload.length);
  });

  it("удаляет файл; повторное удаление не падает", async () => {
    await store.remove(key);
    await store.remove(key);
    await expect(store.get(key)).rejects.toThrow();
  });

  it("сообщает о неверном пароле", async () => {
    const bad = new WebDavStorage(url!, "tester", "wrong", "/EvoTech-test");
    await expect(bad.put("x/y.txt", Buffer.from("1"), "text/plain")).rejects.toThrow(/неверный логин/);
  });

  it("не принимает выход за пределы корня", async () => {
    await expect(store.put("../etc/passwd", Buffer.from("1"), "text/plain")).rejects.toThrow(/Недопустимый путь/);
  });
});
