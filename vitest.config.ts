import { defineConfig } from "vitest/config";

/*
 * Отдельный конфиг, а не секция test в vite.config.js: тесты проверяют чистую
 * расчётную логику, им не нужны ни React, ни Tailwind, а их плагины под
 * тест-раннером не поднимаются.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
