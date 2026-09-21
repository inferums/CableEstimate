import { describe, expect, it } from "vitest";
import { buildVor, LINE_SUBSECTION } from "../lib/calc";
import { VOR_SECTIONS, type VorSectionId } from "../lib/types";
import { TRENCH_META } from "../data/catalogs";
import { project } from "./fixtures";
import type { Segment, TrenchType } from "../lib/types";

/** Трасса, где встречаются все способы прокладки сразу */
const allTypes = () => {
  const types: TrenchType[] = ["open", "gnb", "lotok", "block", "splice"];
  const segments: Segment[] = types.map((type, i) => ({
    id: `s${i}`, from: `ПК${i}`, to: `ПК${i + 1}`,
    type, length: 60, h1: 1.6, h2: 1.6, surfaceId: "lawn",
  }));
  return project({ type: "open", voltage: "110-220", chains: 2, segments });
};

describe("структура разделов ведомости", () => {
  it("разделов не больше четырёх и все они из VOR_SECTIONS", () => {
    const vor = buildVor(allTypes());
    const ids = [...new Set(vor.rows.map((r) => r.section))];
    expect(ids.length).toBeLessThanOrEqual(VOR_SECTIONS.length);
    for (const id of ids) {
      expect(VOR_SECTIONS.some((s) => s.id === id)).toBe(true);
    }
  });

  it("номер раздела не зависит от набора способов прокладки", () => {
    /* Главная причина этой правки: раньше номер присваивался по порядку
       появления, и «Земляные работы» получали разные номера в разных проектах */
    const sectionOf = (state: ReturnType<typeof allTypes>, re: RegExp) =>
      buildVor(state).rows.find((r) => re.test(r.name))?.section;

    const earth = /Разработка сухого грунта экскаватором/;
    expect(sectionOf(project({ type: "open" }), earth)).toBe(1);
    expect(sectionOf(project({ type: "lotok" }), earth)).toBe(1);
    expect(sectionOf(project({ type: "block" }), earth)).toBe(1);
    expect(sectionOf(allTypes(), earth)).toBe(1);
  });

  it("каждая позиция попадает в раздел, отвечающий её смыслу", () => {
    const vor = buildVor(allTypes());
    const section = (re: RegExp): VorSectionId | undefined =>
      vor.rows.find((r) => re.test(r.name))?.section;

    expect(section(/Разработка сухого грунта/)).toBe(1);
    expect(section(/Пилотное бурение/)).toBe(1);
    expect(section(/Монтаж железобетонных лотков/)).toBe(2);
    expect(section(/Труба ПНД/)).toBe(2);
    expect(section(/Прокладка кабеля/)).toBe(3);
    expect(section(/Восстановление покрытия/)).toBe(4);
  });

  it("соединительные и концевые муфты лежат в одном разделе", () => {
    const vor = buildVor(allTypes());
    const joint = vor.rows.find((r) => /Монтаж соединительной муфты/.test(r.name));
    const end = vor.rows.find((r) => /Монтаж концевых муфт/.test(r.name));
    expect(joint).toBeDefined();
    expect(end).toBeDefined();
    expect(joint!.section).toBe(end!.section);
  });

  it("подраздел — это способ прокладки", () => {
    const vor = buildVor(allTypes());
    const known = new Set<string>([
      ...Object.values(TRENCH_META).map((m) => m.label),
      LINE_SUBSECTION,
    ]);
    for (const r of vor.rows) {
      expect(known.has(r.subSection), `${r.subSection} — ${r.name}`).toBe(true);
    }
  });

  it("один и тот же способ прокладки встречается в разделе один раз", () => {
    /* Иначе в ведомости появятся два одинаково названных подраздела подряд */
    const vor = buildVor(allTypes());
    const seen = new Set<string>();
    let prev = "";
    for (const r of vor.rows) {
      const key = `${r.section}|${r.subSection}`;
      if (key === prev) continue;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      prev = key;
    }
  });

  it("строки идут по возрастанию номера раздела", () => {
    /* Ведомость читают сверху вниз: раздел 4 не может стоять перед разделом 1 */
    const vor = buildVor(allTypes());
    for (let i = 1; i < vor.rows.length; i++) {
      expect(vor.rows[i].section).toBeGreaterThanOrEqual(vor.rows[i - 1].section);
    }
  });

  it("заголовок раздела соответствует его номеру", () => {
    const vor = buildVor(allTypes());
    for (const r of vor.rows) {
      const meta = VOR_SECTIONS.find((s) => s.id === r.section)!;
      expect(r.sectionTitle).toBe(meta.title);
    }
  });

  it("позиции одного участка не дробятся между одноимёнными подразделами", () => {
    /* Ключ объединения строк содержит номер раздела: подразделы повторяются
       в разных разделах, и без этого «Труба ПНД» из раздела 2 могла бы
       склеиться с одноимённой позицией из раздела 1 */
    const vor = buildVor(allTypes());
    const keys = vor.rows.map((r) => `${r.section}|${r.subSection}|${r.name}|${r.unit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
