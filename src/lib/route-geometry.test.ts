import { describe, expect, it } from "vitest";
import { niceLength, planGeometry, profileGeometry } from "./route-geometry";
import { generateDxf, encodeCp1251 } from "./dxf-export";
import { project } from "../test/fixtures";
import type { Segment } from "./types";

const seg = (over: Partial<Segment> & { id: string }): Segment => ({
  from: over.id,
  to: `${over.id}'`,
  type: "open",
  length: 10,
  h1: 1.2,
  h2: 1.2,
  surfaceId: "lawn",
  ...over,
});

/** Две ступени трассы по съёмке: на север 30 м, затем на восток 40 м */
const surveyed = (): Segment[] => [
  seg({ id: "a", from: "ПК0", to: "ПК1", length: 30, planX1: 1000, planY1: 500, planX2: 1030, planY2: 500, groundElev1: 5, groundElev2: 6 }),
  seg({ id: "b", from: "ПК1", to: "ПК2", length: 40, planX1: 1030, planY1: 500, planX2: 1030, planY2: 540, groundElev1: 6, groundElev2: 4, h1: 1.5 }),
];

describe("план трассы", () => {
  it("по съёмке: север вверх, восток вправо", () => {
    const g = planGeometry(surveyed());
    expect(g.surveyed).toBe(true);
    /* Первый участок идёт на север: меняется n, e постоянна */
    expect(g.lines[0].a).toEqual({ e: 500, n: 1000 });
    expect(g.lines[0].b).toEqual({ e: 500, n: 1030 });
    /* Второй — на восток */
    expect(g.lines[1].b).toEqual({ e: 540, n: 1030 });
    expect(g.nodes.map((n) => n.label)).toEqual(["ПК0", "ПК1", "ПК2"]);
    expect(g.breaks).toBe(0);
  });

  it("без координат — условная схема в линию, а не «веер»", () => {
    const g = planGeometry([seg({ id: "a", length: 30 }), seg({ id: "b", length: 40 })]);
    expect(g.surveyed).toBe(false);
    expect(g.missing).toBe(2);
    for (const l of g.lines) {
      expect(l.a.n).toBe(0);
      expect(l.b.n).toBe(0);
    }
    expect(g.lines[1].b.e).toBe(70);
  });

  it("съёмка и ручные участки не смешиваются", () => {
    /* Участок без координат не может «висеть» в произвольной точке плана */
    const g = planGeometry([...surveyed(), seg({ id: "c", length: 25 })]);
    expect(g.surveyed).toBe(false);
    expect(g.missing).toBe(1);
  });

  it("разрыв трассы обнаруживается", () => {
    const [a, b] = surveyed();
    const g = planGeometry([b, a]);
    expect(g.breaks).toBe(1);
  });
});

describe("продольный профиль", () => {
  it("по съёмке берёт отметки участков", () => {
    const g = profileGeometry(surveyed());
    expect(g.absolute).toBe(true);
    expect(g.nodes[0]).toMatchObject({ dist: 0, ground: 5, label: "ПК0" });
    expect(g.nodes[g.nodes.length - 1]).toMatchObject({ dist: 70, ground: 4, label: "ПК2" });
    expect(g.total).toBe(70);
  });

  it("ступенька глубины на стыке участков не сглаживается", () => {
    /* Конец первого — 1,2 м, начало второго — 1,5 м: в точке ПК1 два узла */
    const g = profileGeometry(surveyed());
    const atPk1 = g.nodes.filter((n) => n.dist === 30);
    expect(atPk1).toHaveLength(2);
    expect(atPk1.map((n) => +(n.ground - n.bottom).toFixed(2))).toEqual([1.2, 1.5]);
    /* подпись пикета одна, у промежуточного узла её нет */
    expect(atPk1.filter((n) => n.label).length).toBe(1);
  });

  it("без отметок — от поверхности, а не от условных 100 м", () => {
    const g = profileGeometry([seg({ id: "a", length: 30 }), seg({ id: "b", length: 40 })]);
    expect(g.absolute).toBe(false);
    for (const n of g.nodes) {
      expect(n.ground).toBe(0);
      expect(n.bottom).toBeCloseTo(-1.2);
    }
  });
});

describe("длина масштабной линейки", () => {
  it("круглая: 1, 2 или 5 × 10ⁿ", () => {
    expect(niceLength(7)).toBe(5);
    expect(niceLength(180)).toBe(100);
    expect(niceLength(260)).toBe(200);
    expect(niceLength(0.3)).toBeCloseTo(0.2);
  });
});

describe("выгрузка в DXF", () => {
  const dxf = () => generateDxf({ ...project({ type: "open" }), segments: surveyed() });

  it("содержит только примитивы R12", () => {
    const s = dxf();
    expect(s).toContain("AC1009");
    /* LWPOLYLINE — примитив R14: в файле R12 его быть не должно */
    expect(s).not.toContain("LWPOLYLINE");
    expect(s).toMatch(/POLYLINE[\s\S]*VERTEX[\s\S]*SEQEND/);
  });

  it("объявляет кодовую страницу для кириллицы", () => {
    expect(dxf()).toMatch(/\$DWGCODEPAGE\s+3\s+ANSI_1251/);
  });

  it("группы кодов и значений идут парами, файл завершён", () => {
    const lines = dxf().split("\r\n");
    expect(lines[lines.length - 1]).toBe("");
    const body = lines.slice(0, -1);
    expect(body.length % 2).toBe(0);
    for (let i = 0; i < body.length; i += 2) {
      expect(body[i].trim(), `строка ${i + 1}`).toMatch(/^\d+$/);
    }
    expect(body.slice(-2).map((l) => l.trim())).toEqual(["0", "EOF"]);
  });

  it("секции сбалансированы", () => {
    const s = dxf();
    const opened = (s.match(/\s0\r\nSECTION\r\n/g) || []).length;
    const closed = (s.match(/\s0\r\nENDSEC\r\n/g) || []).length;
    expect(opened).toBe(closed);
    expect(opened).toBe(3);
  });

  it("план пишется в координатах съёмки: X чертежа — восток", () => {
    /* ПК2: восток 540, север 1030 */
    expect(dxf()).toMatch(/ 10\r\n540\r\n 20\r\n1030\r\n/);
  });

  it("кириллица кодируется в 1251", () => {
    const bytes = encodeCp1251("ТРАССА ё №");
    expect(Array.from(bytes)).toEqual([0xd2, 0xd0, 0xc0, 0xd1, 0xd1, 0xc0, 0x20, 0xb8, 0x20, 0xb9]);
    /* и после кодирования ни одного «?» от кириллицы в реальном файле */
    const src = dxf();
    const qBefore = (src.match(/\?/g) || []).length;
    const qAfter = Array.from(encodeCp1251(src)).filter((b) => b === 0x3f).length;
    expect(qAfter).toBe(qBefore);
  });

  it("без участков файл всё равно корректен", () => {
    const s = generateDxf({ ...project({ type: "open" }), segments: [] });
    expect(s.trim().endsWith("EOF")).toBe(true);
    expect(s).toContain("ENTITIES");
  });
});
