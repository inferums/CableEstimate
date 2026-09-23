import { describe, expect, it } from "vitest";
import { VOLTAGE_META } from "../data/catalogs";
import type { VoltageClass } from "../lib/types";

/*
 * Проработанность классов напряжения.
 *
 * На 0,4–10 и 35 кВ траншеи другие, и кабель укладывается не в лотках, а
 * расчёт пока ведётся по конструкциям 110–220 кВ. Пока это так, классы
 * помечены как «в разработке» и выбрать их нельзя. Снимать пометку следует
 * вместе с правилами расчёта для них, а не раньше — иначе приложение начнёт
 * молча выдавать ведомость, которой нельзя пользоваться.
 */

describe("классы напряжения", () => {
  it("110–220 кВ проработан", () => {
    expect(VOLTAGE_META["110-220"].inDevelopment).toBeFalsy();
  });

  it("0,4–10 и 35 кВ помечены как в разработке", () => {
    for (const v of ["0.4-10", "35"] as VoltageClass[]) {
      expect(VOLTAGE_META[v].inDevelopment).toBe(true);
    }
  });

  it("проработан хотя бы один класс — иначе приложением нельзя пользоваться", () => {
    const ready = (Object.keys(VOLTAGE_META) as VoltageClass[]).filter(
      (v) => !VOLTAGE_META[v].inDevelopment,
    );
    expect(ready.length).toBeGreaterThan(0);
  });
});
