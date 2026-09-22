import { describe, expect, it } from "vitest";
import { isSupportedVersion, migrateProject, SCHEMA_VERSION } from "./migrate";
import { buildVor } from "./calc";
import { PLATES, TRAYS } from "../data/catalogs";
import type { ProjectState } from "./types";

/*
 * Проект в формате версии 1: справочник тогда содержал марки плит П6-8 и П7-8,
 * которых в серии 3.006.1-2.87 нет, а у параметров лотка ещё не было толщин
 * слоёв. Такой проект лежит в localStorage у любого, кто открывал приложение
 * до перехода на серию, поэтому он обязан открываться без потерь.
 */
function legacyProject(over: Partial<ProjectState> = {}): ProjectState {
  /* soil в версиях 1–2 не было — поэтому приведение типа */
  return {
    projectName: "Старый проект",
    projectCode: "24-07-КЛ",
    voltage: "0.4-10",
    types: ["lotok", "open"],
    chains: 2,
    params: {
      gnb: { boreDiameter: 300, pipes: [{ id: "p1", diameter: 110, count: 4 }] },
      block: { width: 0.8, bedding: 0.1, beddingType: "sand", pipes: [{ id: "p2", diameter: 160, count: 2 }] },
      // без topFill / tapeWidth / pgs* — в версии 1 их не было
      lotok: { width: 1.0, bedding: 0.1, beddingType: "sand", trayMark: "Л6-8", plateMark: "П6-8" } as never,
      open: { width: 0.7, bedding: 0.1, beddingType: "sand", cover: "plates", plateMark: "П7д-8" },
      splice: { width: 1.5, bedding: 0.1, beddingType: "sand" },
    },
    segments: [
      { id: "a", from: "1", to: "2", type: "lotok", length: 50, h1: 1.5, h2: 1.5, surfaceId: "lawn" },
    ],
    surfaces: [{ id: "lawn", name: "Газон", layers: [{ name: "Грунт", thickness: 20 }] }],
    ...over,
  } as ProjectState;
}

describe("поддерживаемые версии", () => {
  it("текущая и первая версии открываются, посторонние — нет", () => {
    expect(isSupportedVersion(1)).toBe(true);
    expect(isSupportedVersion(SCHEMA_VERSION)).toBe(true);
    expect(isSupportedVersion(99)).toBe(false);
    expect(isSupportedVersion(undefined)).toBe(false);
  });
});

describe("миграция проекта версии 1", () => {
  it("заменяет исчезнувшую марку плиты и объясняет замену", () => {
    const { state, notes } = migrateProject(legacyProject(), 1);
    expect(PLATES.some((p) => p.mark === state.params.lotok.plateMark)).toBe(true);
    expect(notes.some((n) => n.includes("П6-8"))).toBe(true);
  });

  it("подбирает плиту той же ширины, что у лотка", () => {
    const { state } = migrateProject(legacyProject(), 1);
    const tray = TRAYS.find((t) => t.mark === state.params.lotok.trayMark)!;
    const plate = PLATES.find((p) => p.mark === state.params.lotok.plateMark)!;
    expect(plate.width).toBe(tray.width);
  });

  it("восстанавливает толщины слоёв лотка", () => {
    const { state } = migrateProject(legacyProject(), 1);
    for (const key of ["topFill", "tapeWidth", "pgsAbove", "pgsTop", "pgsInside"] as const) {
      expect(Number.isFinite(state.params.lotok[key]), key).toBe(true);
    }
  });

  it("чинит марку плиты открытой траншеи", () => {
    const { state, notes } = migrateProject(legacyProject(), 1);
    expect(PLATES.some((p) => p.mark === state.params.open.plateMark)).toBe(true);
    expect(notes.some((n) => n.includes("П7д-8"))).toBe(true);
  });

  it("предупреждает, что габариты лотка изменились", () => {
    const { notes } = migrateProject(legacyProject(), 1);
    expect(notes.some((n) => n.includes("3.006.1-2.87"))).toBe(true);
  });

  it("после миграции ведомость считается без нечисловых величин", () => {
    const { state } = migrateProject(legacyProject(), 1);
    const vor = buildVor(state);
    expect(vor.rows.length).toBeGreaterThan(0);
    for (const r of vor.rows) {
      expect(Number.isFinite(r.qty), r.name).toBe(true);
    }
    expect(vor.warnings.some((w) => w.code === "qty-not-finite")).toBe(false);
  });

  it("не трогает исходный объект", () => {
    const original = legacyProject();
    migrateProject(original, 1);
    expect(original.params.lotok.plateMark).toBe("П6-8");
  });
});

describe("ремонт повреждённых данных", () => {
  it("восстанавливает пустой список покрытий", () => {
    const { state, notes } = migrateProject(legacyProject({ surfaces: [] }), 2);
    expect(state.surfaces.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.includes("покрыт"))).toBe(true);
  });

  it("переназначает участки на существующее покрытие", () => {
    const broken = legacyProject();
    broken.segments[0].surfaceId = "нет-такого";
    const { state, notes } = migrateProject(broken, 2);
    expect(state.segments[0].surfaceId).toBe(state.surfaces[0].id);
    expect(notes.some((n) => n.includes("покрытие"))).toBe(true);
  });

  it("выправляет недопустимое число цепей", () => {
    const { state, notes } = migrateProject(legacyProject({ chains: 0 }), 2);
    expect(state.chains).toBe(1);
    expect(notes.some((n) => n.includes("цеп"))).toBe(true);
  });

  it("заменяет неизвестную марку лотка", () => {
    const broken = legacyProject();
    broken.params.lotok.trayMark = "Л99-8";
    const { state, notes } = migrateProject(broken, 2);
    expect(TRAYS.some((t) => t.mark === state.params.lotok.trayMark)).toBe(true);
    expect(notes.some((n) => n.includes("Л99-8"))).toBe(true);
  });
});

describe("проект текущей версии", () => {
  it("не трогается без причины", () => {
    const current = legacyProject();
    current.params.lotok = {
      width: 4.2, bedding: 0.1, beddingType: "sand",
      trayMark: "Л4-8", plateMark: "П5-8",
      topFill: 300, tapeWidth: 950, pgsAbove: 100, pgsTop: 70, pgsInside: 70,
    };
    current.params.open.plateMark = "П5д-8";
    const { notes } = migrateProject(current, SCHEMA_VERSION);
    expect(notes).toEqual([]);
  });
});
