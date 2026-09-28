import { describe, expect, it } from "vitest";
import { add, div, fmtNum, inNumbers, inSymbols, mul, num, rendered, sub, v, value } from "./formula";

/*
 * Смысл этих проверок — в том, что запись в обозначениях, запись в числах и
 * само значение берутся из одного дерева. Разойдись они, ведомость врала бы
 * незаметно: буквы от одного правила, числа от другого.
 */

const B1 = v("B₁", 1.36);
const h1 = v("h₁", 0.1);
const L = v("L", 100);

describe("две записи одного выражения", () => {
  it("произведение читается и буквами, и числами", () => {
    const e = mul(B1, h1, L);
    expect(inSymbols(e)).toBe("B₁ · h₁ · L");
    expect(inNumbers(e)).toBe("1,36 · 0,1 · 100");
    expect(value(e)).toBeCloseTo(13.6, 6);
  });

  it("сумма внутри произведения берётся в скобки", () => {
    const e = mul(add(h1, v("h₂", 0.2)), L);
    expect(inSymbols(e)).toBe("(h₁ + h₂) · L");
    expect(inNumbers(e)).toBe("(0,1 + 0,2) · 100");
    expect(value(e)).toBeCloseTo(30, 6);
  });

  it("произведение внутри суммы скобок не требует", () => {
    const e = add(mul(B1, h1), L);
    expect(inSymbols(e)).toBe("B₁ · h₁ + L");
  });

  it("вычитание считается слева направо", () => {
    expect(value(sub(v("H", 10), v("a", 3), v("b", 2)))).toBe(5);
    expect(inSymbols(sub(v("H", 10), v("a", 3)))).toBe("H − a");
  });

  it("деление на ноль даёт ноль, а не бесконечность", () => {
    expect(value(div(v("V", 5), v("n", 0)))).toBe(0);
  });

  it("коэффициент остаётся числом в обеих записях", () => {
    const e = mul(v("V", 12), num(0.9));
    expect(inSymbols(e)).toBe("V · 0,9");
    expect(inNumbers(e)).toBe("12 · 0,9");
  });
});

describe("готовая позиция ведомости", () => {
  it("даёт величину и обе записи из одного выражения", () => {
    const r = rendered(mul(B1, h1, L));
    expect(r.qty).toBeCloseTo(13.6, 6);
    expect(r.symbols).toBe("B₁ · h₁ · L");
    expect(r.formula).toBe("1,36 · 0,1 · 100 = 13,6");
  });

  it("запись в числах и значение считаются по одному дереву", () => {
    /* Меняем значение обозначения — обязаны поменяться и число, и итог */
    const r = rendered(mul(v("B₁", 2), v("h₁", 0.5), v("L", 10)));
    expect(r.formula).toBe("2 · 0,5 · 10 = 10");
    expect(r.qty).toBe(10);
  });

  it("одиночное значение не удваивается", () => {
    expect(rendered(v("L", 100)).formula).toBe("100");
  });
});

describe("русская запись чисел", () => {
  it("запятая вместо точки, без хвостовых нулей", () => {
    expect(fmtNum(1.36)).toBe("1,36");
    expect(fmtNum(13.6)).toBe("13,6");
    expect(fmtNum(100)).toBe("100");
    expect(fmtNum(0.10000001, 3)).toBe("0,1");
  });

  it("округление до заданного знака", () => {
    expect(fmtNum(2 / 3, 2)).toBe("0,67");
    expect(fmtNum(2 / 3, 4)).toBe("0,6667");
  });
});
