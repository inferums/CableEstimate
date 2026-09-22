import { describe, expect, it } from "vitest";
import { buildVor } from "./calc";
import {
  ALL_SECTIONS,
  actItems,
  coverage,
  newActId,
  progressReport,
  remainingLength,
  rowKey,
} from "./progress";
import { project } from "../test/fixtures";
import type { Act, ProjectState, Segment, VorSectionId } from "./types";

/** Трасса: переход ГНБ, затем две траншеи — как на реальной линии */
function line(): ProjectState {
  const segments: Segment[] = [
    { id: "s1", from: "ПК0", to: "ПК1", type: "gnb", length: 60, h1: 3, h2: 3, surfaceId: "lawn" },
    { id: "s2", from: "ПК1", to: "ПК2", type: "open", length: 200, h1: 1.4, h2: 1.4, surfaceId: "lawn" },
    { id: "s3", from: "ПК2", to: "ПК3", type: "lotok", length: 150, h1: 1.5, h2: 1.5, surfaceId: "lawn" },
  ];
  return project({ type: "open", voltage: "110-220", chains: 2, segments });
}

const act = (over: Partial<Act>): Act => ({
  id: newActId(),
  number: "1",
  date: "2026-01-15",
  title: "",
  scope: [],
  sections: ALL_SECTIONS,
  lineWorks: false,
  items: [],
  ...over,
});

/** Акт, собранный приложением по части трассы */
function closeWork(
  state: ProjectState,
  scope: { segmentId: string; length: number }[],
  sections: VorSectionId[],
  over: Partial<Act> = {},
): Act {
  const draft = { scope, sections, lineWorks: over.lineWorks ?? false };
  return act({ ...over, scope, sections, items: actItems(state, draft) });
}

describe("закрытие части работ", () => {
  it("закрывается один вид работ на одном участке", () => {
    /* Сначала закрыт только переход ГНБ — траншеи ещё не тронуты */
    const state = line();
    const a = closeWork(state, [{ segmentId: "s1", length: 60 }], ALL_SECTIONS);
    expect(a.items.length).toBeGreaterThan(0);
    for (const item of a.items) {
      expect(item.subSection).toBe("ГНБ");
    }
  });

  it("закрываются только выбранные разделы", () => {
    const state = line();
    /* Земляные работы сданы, а конструкции ещё нет */
    const a = closeWork(state, [{ segmentId: "s2", length: 200 }], [1]);
    expect(a.items.length).toBeGreaterThan(0);
    for (const item of a.items) expect(item.section).toBe(1);
  });

  it("закрывается часть длины участка", () => {
    const state = line();
    const half = closeWork(state, [{ segmentId: "s2", length: 100 }], [1]);
    const full = closeWork(state, [{ segmentId: "s2", length: 200 }], [1]);
    const qty = (a: Act, re: RegExp) => a.items.find((i) => re.test(i.name))?.qty ?? 0;
    const dig = /Разработка сухого грунта экскаватором/;
    expect(qty(half, dig)).toBeGreaterThan(0);
    expect(qty(half, dig)).toBeCloseTo(qty(full, dig) / 2, 2);
  });

  it("две части одного участка в сумме дают целое", () => {
    const state = line();
    const a1 = closeWork(state, [{ segmentId: "s3", length: 90 }], [1]);
    const a2 = closeWork(state, [{ segmentId: "s3", length: 60 }], [1]);
    const whole = closeWork(state, [{ segmentId: "s3", length: 150 }], [1]);
    const sum = (a: Act, key: string) => a.items.filter((i) => i.key === key).reduce((s, i) => s + i.qty, 0);
    for (const item of whole.items) {
      /* Объём земляных работ линеен по длине */
      expect(sum(a1, item.key) + sum(a2, item.key), item.name).toBeCloseTo(item.qty, 1);
    }
  });

  it("работы по линии целиком попадают в акт только по требованию", () => {
    const state = line();
    const without = closeWork(state, [{ segmentId: "s2", length: 200 }], ALL_SECTIONS);
    expect(without.items.some((i) => /концевых муфт/.test(i.name))).toBe(false);
    const with_ = closeWork(state, [{ segmentId: "s2", length: 200 }], ALL_SECTIONS, { lineWorks: true });
    expect(with_.items.some((i) => /концевых муфт/.test(i.name))).toBe(true);
  });

  it("пустая или нулевая захватка даёт пустой акт", () => {
    const state = line();
    expect(actItems(state, { scope: [], sections: ALL_SECTIONS, lineWorks: false })).toEqual([]);
    expect(actItems(state, { scope: [{ segmentId: "s1", length: 0 }], sections: ALL_SECTIONS, lineWorks: false })).toEqual([]);
    expect(actItems(state, { scope: [{ segmentId: "нет", length: 10 }], sections: ALL_SECTIONS, lineWorks: false })).toEqual([]);
  });
});

describe("накопительная ведомость", () => {
  it("остаток уменьшается по мере закрытия", () => {
    const state = line();
    const plan = buildVor(state).rows;
    const dig = plan.find((r) => /Разработка сухого грунта экскаватором/.test(r.name))!;

    const empty = progressReport(state, plan);
    expect(empty.rows.find((r) => r.key === rowKey(dig))!.remaining).toBeCloseTo(dig.qty, 2);

    const withAct = { ...state, acts: [closeWork(state, [{ segmentId: "s2", length: 100 }], [1])] };
    const rep = progressReport(withAct, plan);
    const row = rep.rows.find((r) => r.key === rowKey(dig))!;
    expect(row.done).toBeGreaterThan(0);
    expect(row.done + row.remaining).toBeCloseTo(dig.qty, 2);
    expect(row.over).toBe(false);
  });

  it("выполнение по каждому акту показано отдельной колонкой", () => {
    const state = line();
    const plan = buildVor(state).rows;
    const acts = [
      closeWork(state, [{ segmentId: "s1", length: 60 }], ALL_SECTIONS, { number: "1", date: "2026-01-10" }),
      closeWork(state, [{ segmentId: "s2", length: 200 }], [1], { number: "2", date: "2026-02-10" }),
    ];
    const rep = progressReport({ ...state, acts }, plan);
    expect(rep.acts.map((a) => a.number)).toEqual(["1", "2"]);
    const pilot = rep.rows.find((r) => /Пилотное бурение/.test(r.name))!;
    expect(pilot.byAct[0]).toBeGreaterThan(0);
    expect(pilot.byAct[1]).toBe(0);
  });

  it("акты идут по дате, а не по порядку добавления", () => {
    const state = line();
    const acts = [
      closeWork(state, [{ segmentId: "s1", length: 60 }], ALL_SECTIONS, { number: "2", date: "2026-03-01" }),
      closeWork(state, [{ segmentId: "s2", length: 50 }], [1], { number: "1", date: "2026-01-01" }),
    ];
    const rep = progressReport({ ...state, acts }, buildVor(state).rows);
    expect(rep.acts.map((a) => a.number)).toEqual(["1", "2"]);
  });

  it("перерасход виден и не обнуляется", () => {
    const state = line();
    const plan = buildVor(state).rows;
    const a = closeWork(state, [{ segmentId: "s2", length: 200 }], [1]);
    /* Фактический объём оказался больше проектного — так бывает */
    a.items = a.items.map((i) => ({ ...i, qty: i.qty * 1.3 }));
    const rep = progressReport({ ...state, acts: [a] }, plan);
    const over = rep.rows.filter((r) => r.over);
    expect(over.length).toBeGreaterThan(0);
    expect(rep.overruns).toBe(over.length);
    for (const r of over) {
      expect(r.done).toBeGreaterThan(r.plan);
      expect(r.remaining).toBe(0);
    }
  });
});

describe("выполненные объёмы не теряются", () => {
  it("правка проекта не меняет принятые объёмы", () => {
    const state = line();
    const a = closeWork(state, [{ segmentId: "s2", length: 200 }], [1]);
    const before = a.items.map((i) => i.qty);

    /* Трассу перемерили: участок стал короче, глубина другая */
    const changed: ProjectState = {
      ...state,
      acts: [a],
      segments: state.segments.map((s) => (s.id === "s2" ? { ...s, length: 120, h1: 1.2, h2: 1.2 } : s)),
    };
    const rep = progressReport(changed, buildVor(changed).rows);
    expect(changed.acts![0].items.map((i) => i.qty)).toEqual(before);
    const done = rep.rows.filter((r) => r.done > 0);
    expect(done.length).toBe(a.items.length);
  });

  it("удаление участка не стирает то, что по нему принято", () => {
    const state = line();
    const a = closeWork(state, [{ segmentId: "s1", length: 60 }], ALL_SECTIONS);
    const pilot = a.items.find((i) => /Пилотное бурение/.test(i.name))!;

    /* Участок ГНБ удалён из проекта — в ведомости его позиций больше нет */
    const changed: ProjectState = {
      ...state,
      acts: [a],
      segments: state.segments.filter((s) => s.id !== "s1"),
    };
    const rep = progressReport(changed, buildVor(changed).rows);
    const row = rep.rows.find((r) => r.key === pilot.key);
    expect(row, "позиция должна остаться в накопительной ведомости").toBeDefined();
    expect(row!.done).toBeCloseTo(pilot.qty, 3);
    expect(row!.orphan).toBe(true);
    expect(row!.plan).toBe(0);
    expect(rep.orphans).toBeGreaterThan(0);
  });

  it("сводка акта переживает удаление участка", () => {
    const state = line();
    const a = closeWork(state, [{ segmentId: "s1", length: 60 }], ALL_SECTIONS);
    const changed = { ...state, acts: [a], segments: state.segments.filter((s) => s.id !== "s1") };
    const rep = progressReport(changed, buildVor(changed).rows);
    expect(rep.acts[0].items.length).toBe(a.items.length);
  });
});

describe("сколько закрыто по участкам", () => {
  it("закрытая длина складывается по разделам", () => {
    const state = line();
    const acts = [
      closeWork(state, [{ segmentId: "s2", length: 80 }], [1]),
      closeWork(state, [{ segmentId: "s2", length: 50 }], [1, 2]),
    ];
    const cov = coverage({ ...state, acts }).find((c) => c.segmentId === "s2")!;
    expect(cov.closed[1]).toBe(130);
    expect(cov.closed[2]).toBe(50);
    expect(cov.maxClosed).toBe(130);
  });

  it("остаток к закрытию считается по самому продвинутому разделу", () => {
    const state = line();
    const acts = [closeWork(state, [{ segmentId: "s2", length: 80 }], [1])];
    const withActs = { ...state, acts };
    expect(remainingLength(withActs, "s2", [1])).toBe(120);
    expect(remainingLength(withActs, "s2", [2])).toBe(200);
    expect(remainingLength(withActs, "s2", [1, 2])).toBe(120);
    expect(remainingLength(withActs, "s1", [1])).toBe(60);
  });

  it("остаток не уходит в минус при перезакрытии", () => {
    const state = line();
    const acts = [closeWork(state, [{ segmentId: "s2", length: 250 }], [1])];
    expect(remainingLength({ ...state, acts }, "s2", [1])).toBe(0);
  });
});
