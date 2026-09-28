import { describe, expect, it } from "vitest";
import { markerPoints, MARKER_TURN_ANGLE } from "./route-geometry";
import { buildVor } from "./calc";
import { project } from "../test/fixtures";
import type { Segment, TrenchType } from "./types";

/*
 * Электронные маркеры ставятся в точках трассы: на углах поворота, на входах
 * и выходах ГНБ и на муфтовых полях. Шага у них нет — считать их «через
 * каждые N метров» значит выдумывать количество.
 */

let uid = 0;
const seg = (over: Partial<Segment> & { type?: TrenchType } = {}): Segment => ({
  id: `s${++uid}`,
  from: "1",
  to: "2",
  type: over.type ?? "lotok",
  length: 100,
  h1: 1.8,
  h2: 1.8,
  surfaceId: "lawn",
  ...over,
});

/** Участок по координатам: X — север, Y — восток */
const line = (x1: number, y1: number, x2: number, y2: number, type: TrenchType = "lotok"): Segment =>
  seg({ type, planX1: x1, planY1: y1, planX2: x2, planY2: y2, length: Math.hypot(x2 - x1, y2 - y1) });

describe("точки установки маркеров", () => {
  it("прямая трасса без ГНБ и муфт маркеров не требует", () => {
    const m = markerPoints([line(0, 0, 0, 100), line(0, 100, 0, 200)]);
    expect(m.turns).toBe(0);
    expect(m.total).toBe(0);
  });

  it("поворот трассы даёт маркер", () => {
    const m = markerPoints([line(0, 0, 0, 100), line(0, 100, 100, 100)]);
    expect(m.turns).toBe(1);
    expect(m.total).toBe(1);
  });

  it("излом мельче допуска поворотом не считается", () => {
    /* Отклонение около 1° — это погрешность съёмки, а не угол поворота */
    const small = Math.tan((1 * Math.PI) / 180) * 100;
    expect(markerPoints([line(0, 0, 0, 100), line(0, 100, small, 200)]).turns).toBe(0);
    /* А отклонение чуть больше допуска — уже угол */
    const big = Math.tan(((MARKER_TURN_ANGLE + 1) * Math.PI) / 180) * 100;
    expect(markerPoints([line(0, 0, 0, 100), line(0, 100, big, 200)]).turns).toBe(1);
  });

  it("переход ГНБ даёт два маркера — на входе и на выходе", () => {
    const m = markerPoints([seg({ type: "lotok" }), seg({ type: "gnb" }), seg({ type: "lotok" })]);
    expect(m.gnb).toBe(2);
    expect(m.total).toBe(2);
  });

  it("муфтовое поле даёт один маркер", () => {
    expect(markerPoints([seg({ type: "splice" })]).splices).toBe(1);
  });

  it("без координат съёмки углы не выдумываются", () => {
    const m = markerPoints([seg(), seg(), seg({ type: "gnb" })]);
    expect(m.surveyed).toBe(false);
    expect(m.turns).toBe(0);
    /* ГНБ и муфты видны и без съёмки — они не зависят от геометрии плана */
    expect(m.total).toBe(2);
  });

  it("разрыв трассы поворотом не считается", () => {
    /* Второй участок идёт поперёк первого, но начинается в стороне: угол
       между ними есть, а поворота трассы в этом месте нет — есть пропуск */
    const m = markerPoints([line(0, 0, 0, 100), line(500, 500, 600, 500)]);
    expect(m.turns).toBe(0);
    /* Для сравнения: те же направления встык дают поворот */
    expect(markerPoints([line(0, 0, 0, 100), line(0, 100, 100, 100)]).turns).toBe(1);
  });

  it("слагаемые складываются в общее число", () => {
    const m = markerPoints([
      line(0, 0, 0, 100),
      line(0, 100, 100, 100),
      seg({ type: "gnb", planX1: 100, planY1: 100, planX2: 200, planY2: 100 }),
      seg({ type: "splice", planX1: 200, planY1: 100, planX2: 210, planY2: 100 }),
    ]);
    expect(m.total).toBe(m.turns + m.gnb + m.splices);
    expect(m.gnb).toBe(2);
    expect(m.splices).toBe(1);
  });
});

describe("маркеры в ведомости", () => {
  it("позиция одна на линию, а не на каждый участок", () => {
    const state = project({
      type: "lotok",
      voltage: "110-220",
      segments: [seg({ type: "lotok" }), seg({ type: "gnb" }), seg({ type: "lotok" })],
    });
    const rows = buildVor(state).rows.filter((r) => r.name.includes("Электронный маркер"));
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(2);
    expect(rows[0].subSection).toBe("Линия целиком");
  });

  it("на трассе без углов, ГНБ и муфт позиции нет вовсе", () => {
    const state = project({ type: "lotok", voltage: "110-220", segments: [seg({ type: "lotok" })] });
    expect(buildVor(state).rows.some((r) => r.name.includes("Электронный маркер"))).toBe(false);
  });
});
