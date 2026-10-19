import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup-env.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Интеграционные тесты работают с одной БД — последовательно
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
