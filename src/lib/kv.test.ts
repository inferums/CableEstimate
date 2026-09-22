import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { localStorageKv, openKv, type Kv } from "./kv";
import { createProject, listProjects, loadProject, openWorkspace, PROJECT_PREFIX, saveProject } from "./projects";
import { project } from "../test/fixtures";
import type { ProjectState } from "./types";

/*
 * Хранилище проверяется на настоящей IndexedDB (в тестах — её реализация
 * fake-indexeddb): это единственное место, где работа пользователя переживает
 * закрытие вкладки, и ошибка здесь стоит дороже любой ошибки расчёта.
 */

const named = (name: string): ProjectState => ({ ...project({ type: "open" }), projectName: name });

const both = (): [string, () => Promise<Kv>][] => [
  ["IndexedDB", () => openKv()],
  ["localStorage", () => Promise.resolve(localStorageKv())],
];

/* Минимальный localStorage: в node его нет, а запасной путь проверить надо */
const store = new Map<string, string>();
globalThis.localStorage = {
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
} as Storage;

describe.each(both())("хранилище %s", (_name, make) => {
  it("записанное читается обратно", async () => {
    const kv = await make();
    await kv.set("k", { a: 1, s: "текст" });
    expect(await kv.get("k")).toEqual({ a: 1, s: "текст" });
  });

  it("чтение несуществующего ключа — undefined, а не ошибка", async () => {
    const kv = await make();
    expect(await kv.get("нет-такого")).toBeUndefined();
  });

  it("ключи отбираются по началу имени", async () => {
    const kv = await make();
    await kv.set(PROJECT_PREFIX + "one", 1);
    await kv.set(PROJECT_PREFIX + "two", 2);
    await kv.set("index", []);
    const keys = await kv.keys(PROJECT_PREFIX);
    expect(keys.sort()).toEqual([PROJECT_PREFIX + "one", PROJECT_PREFIX + "two"]);
  });

  it("удаление убирает значение", async () => {
    const kv = await make();
    await kv.set("k", 1);
    await kv.delete("k");
    expect(await kv.get("k")).toBeUndefined();
  });

  it("проект переживает повторное открытие хранилища", async () => {
    const kv = await make();
    const m = await createProject(kv, { ...named("Живучий"), acts: [] });
    await saveProject(kv, m.id, { ...named("Живучий"), projectCode: "ПОСЛЕ-ПРАВКИ" });

    const again = await make();
    const loaded = await loadProject(again, m.id);
    expect(loaded!.state.projectCode).toBe("ПОСЛЕ-ПРАВКИ");
    expect((await listProjects(again)).some((x) => x.id === m.id)).toBe(true);
  });

  it("рабочее место поднимается на пустом хранилище", async () => {
    const kv = await make();
    for (const k of await kv.keys()) await kv.delete(k);
    const ws = await openWorkspace(kv, () => named("Первый запуск"), null);
    expect(ws.state.projectName).toBe("Первый запуск");
    expect(ws.kv.kind).toBeDefined();
  });
});

describe("выбор хранилища", () => {
  it("при доступной IndexedDB берётся она", async () => {
    expect((await openKv()).kind).toBe("indexeddb");
  });
});
