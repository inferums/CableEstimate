import { describe, expect, it, vi } from "vitest";
import { memoryKv } from "./kv";
import {
  adoptLegacy,
  createProject,
  deleteProject,
  duplicateProject,
  getCurrentId,
  listProjects,
  loadProject,
  openWorkspace,
  PROJECT_PREFIX,
  saveProject,
  setCurrentId,
} from "./projects";
import { SCHEMA_VERSION } from "./migrate";
import { project } from "../test/fixtures";
import type { Act, ProjectState } from "./types";

const named = (name: string, code = "ШИФР"): ProjectState => ({
  ...project({ type: "open" }),
  projectName: name,
  projectCode: code,
});

const act = (number: string): Act => ({
  id: `a-${number}`,
  number,
  date: "2026-09-01",
  title: "",
  scope: [],
  sections: [1],
  lineWorks: false,
  items: [
    {
      key: "1|Открытая траншея|Разработка грунта|м³",
      section: 1,
      subSection: "Открытая траншея",
      name: "Разработка грунта",
      unit: "м³",
      qty: 12,
      calcQty: 12,
    },
  ],
});

describe("реестр объектов", () => {
  it("хранит несколько объектов и открывает каждый по отдельности", async () => {
    const kv = memoryKv();
    const a = await createProject(kv, named("Первый"));
    const b = await createProject(kv, named("Второй"));

    const list = await listProjects(kv);
    expect(list.map((m) => m.name).sort()).toEqual(["Второй", "Первый"]);
    expect((await loadProject(kv, a.id))!.state.projectName).toBe("Первый");
    expect((await loadProject(kv, b.id))!.state.projectName).toBe("Второй");
  });

  it("правка одного объекта не трогает другой", async () => {
    const kv = memoryKv();
    const a = await createProject(kv, named("Первый"));
    const b = await createProject(kv, named("Второй"));

    await saveProject(kv, a.id, { ...named("Первый"), acts: [act("1")] });

    expect((await loadProject(kv, a.id))!.state.acts).toHaveLength(1);
    expect((await loadProject(kv, b.id))!.state.acts ?? []).toHaveLength(0);
  });

  it("в списке видно, сколько у объекта актов и есть ли смета", async () => {
    const kv = memoryKv();
    const m = await createProject(kv, { ...named("С актами"), acts: [act("1"), act("2")] });
    expect(m.acts).toBe(2);
    expect(m.hasSmeta).toBe(false);
    expect(m.segments).toBeGreaterThan(0);
    expect(m.size).toBeGreaterThan(0);
  });

  it("удаление убирает и запись, и строку списка", async () => {
    const kv = memoryKv();
    const a = await createProject(kv, named("Первый"));
    const b = await createProject(kv, named("Второй"));

    await deleteProject(kv, a.id);

    expect((await listProjects(kv)).map((m) => m.id)).toEqual([b.id]);
    expect(await loadProject(kv, a.id)).toBeNull();
    expect(await kv.get(PROJECT_PREFIX + a.id)).toBeUndefined();
  });

  it("копия не наследует акты и смету — принятые объёмы относятся к своему объекту", async () => {
    const kv = memoryKv();
    const src = await createProject(kv, {
      ...named("Исходный"),
      acts: [act("1")],
      smeta: { fileName: "с.xlsx", importedAt: "2026-09-01", positions: [], links: [] },
    });

    const copy = await duplicateProject(kv, src.id);
    const state = (await loadProject(kv, copy!.id))!.state;

    expect(state.projectName).toBe("Исходный (копия)");
    expect(state.acts ?? []).toHaveLength(0);
    expect(state.smeta).toBeUndefined();
    expect((await loadProject(kv, src.id))!.state.acts).toHaveLength(1);
  });

  it("список восстанавливается по записям, если он потерялся", async () => {
    const kv = memoryKv();
    const a = await createProject(kv, named("Первый"));
    await createProject(kv, named("Второй"));

    await kv.delete("index");

    const list = await listProjects(kv);
    expect(list).toHaveLength(2);
    expect(list.some((m) => m.id === a.id)).toBe(true);
  });

  it("строка списка без записи не показывается", async () => {
    const kv = memoryKv();
    const a = await createProject(kv, named("Первый"));
    await kv.delete(PROJECT_PREFIX + a.id);

    expect(await listProjects(kv)).toHaveLength(0);
  });

  it("сохранение помнит дату создания объекта", async () => {
    const kv = memoryKv();
    const first = await createProject(kv, named("Первый"));
    const again = await saveProject(kv, first.id, named("Первый переименованный"));

    expect(again.createdAt).toBe(first.createdAt);
    expect(again.name).toBe("Первый переименованный");
  });
});

describe("переход со старого хранилища", () => {
  const legacy = (state: ProjectState, version = SCHEMA_VERSION) =>
    JSON.stringify({ version, savedAt: "2026-09-01T00:00:00.000Z", state });

  it("проект из старого ключа становится первым объектом", async () => {
    const kv = memoryKv();
    const ws = await openWorkspace(kv, () => named("Новый пустой"), legacy(named("Старый")));

    expect(ws.state.projectName).toBe("Старый");
    expect(ws.projects).toHaveLength(1);
  });

  it("повторный запуск не плодит копии старого проекта", async () => {
    const kv = memoryKv();
    const raw = legacy(named("Старый"));
    await openWorkspace(kv, () => named("Новый"), raw);
    const ws = await openWorkspace(kv, () => named("Новый"), raw);

    expect(ws.projects).toHaveLength(1);
    expect(ws.state.projectName).toBe("Старый");
  });

  it("старый проект прежней версии формата мигрируется, а не отбрасывается", async () => {
    const kv = memoryKv();
    const old = named("Старый");
    const ws = await openWorkspace(kv, () => named("Новый"), legacy(old, 1));

    expect(ws.state.projectName).toBe("Старый");
    expect(ws.state.soil).toBeDefined();
  });

  it("испорченный старый ключ не мешает запуску", async () => {
    const kv = memoryKv();
    const ws = await openWorkspace(kv, () => named("Новый"), "{не json");

    expect(ws.state.projectName).toBe("Новый");
    expect(ws.projects).toHaveLength(1);
  });
});

describe("выбранный объект", () => {
  it("запуск открывает тот объект, на котором закончили", async () => {
    const kv = memoryKv();
    /* Выбран объект, изменённый раньше остальных: иначе проверка совпала бы с
       «открываем самый свежий» и ничего бы не проверяла. Время задаём явно —
       два объекта, созданные в одну миллисекунду, неразличимы по дате. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
    const a = await createProject(kv, named("Первый"));
    vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
    await createProject(kv, named("Второй"));
    vi.useRealTimers();
    await setCurrentId(kv, a.id);

    const ws = await openWorkspace(kv, () => named("Новый"), null);

    expect(ws.current.id).toBe(a.id);
    expect(ws.state.projectName).toBe("Первый");
  });

  it("если выбранный объект удалён, открывается другой, а не пустой", async () => {
    const kv = memoryKv();
    const a = await createProject(kv, named("Первый"));
    await createProject(kv, named("Второй"));
    await setCurrentId(kv, a.id);
    await deleteProject(kv, a.id);

    const ws = await openWorkspace(kv, () => named("Новый"), null);

    expect(ws.state.projectName).toBe("Второй");
    expect(await getCurrentId(kv)).toBe(ws.current.id);
  });

  it("пустое хранилище даёт один объект по умолчанию", async () => {
    const kv = memoryKv();
    const ws = await openWorkspace(kv, () => named("Новый"), null);

    expect(ws.projects).toHaveLength(1);
    expect(ws.state.projectName).toBe("Новый");
    expect(await loadProject(kv, ws.current.id)).not.toBeNull();
  });
});

describe("старый ключ не трогаем", () => {
  it("adoptLegacy не удаляет исходные данные", async () => {
    const kv = memoryKv();
    const raw = JSON.stringify({ version: SCHEMA_VERSION, savedAt: "2026-09-01", state: named("Старый") });
    await adoptLegacy(kv, raw);
    expect(JSON.parse(raw).state.projectName).toBe("Старый");
  });
});
