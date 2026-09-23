import { describe, expect, it } from "vitest";
import { __internals as server } from "../../api/sync";
import * as client from "./cloud-shared";
import { project } from "../test/fixtures";

/*
 * Серверная функция не может импортировать код из src: функции на Vercel не
 * собираются в один файл, и любой такой импорт роняет функцию на старте.
 * Поэтому правила раскладки файлов и кодирования пароля описаны дважды — в
 * api/sync.ts и в lib/cloud-shared.ts.
 *
 * Эта проверка следит за тем, чтобы копии не разошлись: разойдясь, они дадут
 * не ошибку, а тихо разные пути к файлам и неработающий пароль.
 */

const IDS = ["p1", "pmf3k2-ab_c", "A".repeat(64)];
const BAD_IDS = ["../../etc", "a/b", "", "p 1", "ключ", "a".repeat(65)];
const PASSWORDS = ["простой", "with spaces", "Ё-моё-2026", "", "a".repeat(200), "±§!@#$%^&*()"];

describe("серверная и браузерная копии правил совпадают", () => {
  it("приставка хранилища одна и та же", () => {
    expect(server.PREFIX).toBe(client.PREFIX);
  });

  it("пути к файлам объекта совпадают", () => {
    for (const id of IDS) {
      expect(server.metaPath(id)).toBe(client.metaPath(id));
      expect(server.projectPath(id)).toBe(client.projectPath(id));
      expect(server.actsPrefix(id)).toBe(client.actsPrefix(id));
      expect(server.actPath(id, "act-7")).toBe(client.actPath(id, "act-7"));
    }
  });

  it("проверка идентификаторов одинаково строга", () => {
    for (const id of [...IDS, ...BAD_IDS]) {
      expect(server.isValidId(id)).toBe(client.isValidId(id));
      expect(server.safeActId(id)).toBe(client.safeActId(id));
    }
  });

  it("пароль кодируется одинаково — иначе ни один не подойдёт", () => {
    for (const p of PASSWORDS) {
      expect(server.encodeToken(p)).toBe(client.encodeToken(p));
    }
  });

  it("сведения об объекте считаются одинаково", () => {
    const state = project({ type: "open" });
    const a = server.remoteMeta("p1", state, "Компьютер", 100);
    const b = client.remoteMeta("p1", state, "Компьютер", 100);
    /* Время записи у копий своё — сравниваем всё остальное */
    expect({ ...a, updatedAt: "" }).toEqual({ ...b, updatedAt: "" });
  });
});

describe("функция не тянет за собой код из src", () => {
  it("в api/sync.ts нет импортов значений извне", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("api/sync.ts", "utf8");
    const imports = [...source.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+"([^"]+)"/gm)];

    for (const [, isType, specifier] of imports) {
      /* Импорт типа исчезает при компиляции, остальное обязано быть встроенным */
      if (isType) continue;
      expect(specifier.startsWith("node:")).toBe(true);
    }
  });
});
