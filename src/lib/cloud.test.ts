import { describe, expect, it, vi, afterEach } from "vitest";
import { mergeActs, mergePulled, isValidId, safeActId, remoteMeta } from "./cloud-shared";
import { CloudConflict, cloudPull, cloudPush, cloudRows, rowStatus, type SyncRecord } from "./cloud";
import { project } from "../test/fixtures";
import type { Act, ProjectState } from "./types";
import type { ProjectMeta } from "./projects";
import type { RemoteMeta } from "./cloud-shared";

const act = (id: string): Act => ({
  id, number: id, date: "2026-09-01", title: "", scope: [], sections: [1], lineWorks: false,
  items: [{ key: "k", section: 1, subSection: "Открытая траншея", name: "Разработка грунта", unit: "м³", qty: 10, calcQty: 10 }],
});

const state = (over: Partial<ProjectState> = {}): ProjectState => ({ ...project({ type: "open" }), ...over });

const local = (over: Partial<ProjectMeta> = {}): ProjectMeta => ({
  id: "p1", name: "Объект", code: "24-07", updatedAt: "2026-09-20T10:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z", segments: 6, acts: 0, hasSmeta: false, size: 1000, ...over,
});

const cloud = (over: Partial<RemoteMeta> = {}): RemoteMeta => ({
  id: "p1", name: "Объект", code: "24-07", updatedAt: "2026-09-20T09:00:00.000Z",
  device: "Компьютер", segments: 6, acts: 0, hasSmeta: false, size: 1000, ...over,
});

const sync = (over: Partial<SyncRecord> = {}): SyncRecord => ({
  remoteUpdatedAt: "2026-09-20T09:00:00.000Z", syncedAt: "2026-09-20T09:00:05.000Z", ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("слияние актов", () => {
  it("акты с обеих сторон сохраняются", () => {
    expect(mergeActs([act("a")], [act("b")]).map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("один и тот же акт не удваивается", () => {
    expect(mergeActs([act("a")], [act("a")]).map((a) => a.id)).toEqual(["a"]);
  });

  it("акт, не успевший уехать в облако, переживает получение оттуда", () => {
    const here = state({ acts: [act("местный")], projectCode: "МЕСТНЫЙ" });
    const there = state({ acts: [act("облачный")], projectCode: "ОБЛАЧНЫЙ" });

    const merged = mergePulled(here, there, [act("облачный")]);

    expect(merged.acts!.map((a) => a.id).sort()).toEqual(["местный", "облачный"]);
    /* Остальное берётся из облачной версии — её и забирали */
    expect(merged.projectCode).toBe("ОБЛАЧНЫЙ");
  });

  it("акты из отдельных файлов подхватываются, даже если в проекте их нет", () => {
    const merged = mergePulled(null, state({ acts: [] }), [act("из-файла")]);
    expect(merged.acts!.map((a) => a.id)).toEqual(["из-файла"]);
  });
});

describe("идентификаторы в путях файлов", () => {
  it("обычный идентификатор принимается", () => {
    expect(isValidId("p1k2j3-ab_c")).toBe(true);
    expect(safeActId("act-12")).toBe(true);
  });

  it("выход за пределы каталога и пустое имя отбрасываются", () => {
    for (const bad of ["../../etc", "a/b", "", "p?1", "p 1", "ключ.json", "a".repeat(65)]) {
      expect(isValidId(bad)).toBe(false);
    }
  });
});

describe("состояние объекта относительно облака", () => {
  it("объект есть только здесь", () => {
    expect(rowStatus(local(), null, null)).toBe("local-only");
  });

  it("объект есть только в облаке", () => {
    expect(rowStatus(null, cloud(), null)).toBe("remote-only");
  });

  it("после сведения без правок — совпадает", () => {
    expect(rowStatus(local({ updatedAt: "2026-09-20T09:00:00.000Z" }), cloud(), sync())).toBe("synced");
  });

  it("правка здесь после сведения", () => {
    expect(rowStatus(local({ updatedAt: "2026-09-20T12:00:00.000Z" }), cloud(), sync())).toBe("local-newer");
  });

  it("правка в облаке после сведения", () => {
    expect(
      rowStatus(local({ updatedAt: "2026-09-20T09:00:00.000Z" }), cloud({ updatedAt: "2026-09-21T09:00:00.000Z" }), sync()),
    ).toBe("remote-newer");
  });

  it("правки с обеих сторон", () => {
    expect(
      rowStatus(local({ updatedAt: "2026-09-21T10:00:00.000Z" }), cloud({ updatedAt: "2026-09-21T09:00:00.000Z" }), sync()),
    ).toBe("both-changed");
  });

  it("без истории сведения версии считаются разошедшимися, а не совпавшими", () => {
    expect(rowStatus(local(), cloud(), null)).toBe("both-changed");
  });

  it("список сводит объекты отсюда и из облака в одну таблицу", () => {
    const rows = cloudRows(
      [local({ id: "a", name: "Альфа" }), local({ id: "b", name: "Бета" })],
      [cloud({ id: "b", name: "Бета" }), cloud({ id: "c", name: "Гамма" })],
      new Map(),
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Альфа", "local-only"],
      ["Бета", "both-changed"],
      ["Гамма", "remote-only"],
    ]);
  });
});

describe("обмен с сервером", () => {
  const ok = (body: unknown) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));

  it("отправка передаёт пароль заголовком, а не в адресе", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ meta: cloud() }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => "Компьютер", setItem: () => {} });

    await cloudPush("секрет", "p1", state(), null);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sync");
    expect(url).not.toContain("секрет");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer секрет");
  });

  it("более свежая версия в облаке — это конфликт с данными о ней, а не молчаливая перезапись", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "conflict", remote: cloud({ device: "Ноутбук" }) }), { status: 409 }),
      ),
    );
    vi.stubGlobal("localStorage", { getItem: () => "Компьютер", setItem: () => {} });

    await expect(cloudPush("секрет", "p1", state(), "старое")).rejects.toBeInstanceOf(CloudConflict);
  });

  it("ошибка сервера доходит текстом, а не кодом", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Неверный пароль" }), { status: 401 })),
    );
    await expect(cloudPull("не тот", "p1")).rejects.toThrow("Неверный пароль");
  });

  it("получение возвращает проект и акты", async () => {
    ok({ state: state(), acts: [act("a")], meta: cloud() });
    const res = await cloudPull("секрет", "p1");
    expect(res.acts).toHaveLength(1);
    expect(res.state.segments.length).toBeGreaterThan(0);
  });
});

describe("сведения об объекте в облаке", () => {
  it("считает участки, акты и смету", () => {
    const m = remoteMeta("p1", state({ acts: [act("a")] }), "Компьютер", 1234);
    expect(m.acts).toBe(1);
    expect(m.segments).toBeGreaterThan(0);
    expect(m.size).toBe(1234);
    expect(m.device).toBe("Компьютер");
  });
});
