/*
 * Формулы ведомости: одно выражение — две записи.
 *
 * Позиция ведомости должна читаться дважды: сначала в обозначениях с
 * разреза (B₁ · h₁ · L), потом с подставленными числами (1,36 · 0,1 · 100).
 * Проверяющий видит и правило, и подстановку.
 *
 * Обе записи собираются из одного выражения. Хранить два готовых текста
 * нельзя: после первой же правки расчёта буквы остались бы от старой
 * формулы, а числа — от новой, и ведомость врала бы незаметно.
 */

export type Expr =
  /** Число без обозначения: коэффициент, доля, константа расчёта */
  | { kind: "num"; value: number; digits?: number }
  /** Величина с разреза или из справочника: обозначение плюс значение */
  | { kind: "var"; sym: string; value: number; digits?: number }
  | { kind: "op"; op: "+" | "−" | "·" | "/"; args: Expr[] };

export const num = (value: number, digits?: number): Expr => ({ kind: "num", value, digits });
export const v = (sym: string, value: number, digits?: number): Expr => ({ kind: "var", sym, value, digits });
export const mul = (...args: Expr[]): Expr => ({ kind: "op", op: "·", args });
export const add = (...args: Expr[]): Expr => ({ kind: "op", op: "+", args });
export const sub = (...args: Expr[]): Expr => ({ kind: "op", op: "−", args });
export const div = (a: Expr, b: Expr): Expr => ({ kind: "op", op: "/", args: [a, b] });

/** Значение выражения — считается по тому же дереву, из которого печатаются обе записи */
export function value(e: Expr): number {
  if (e.kind === "num" || e.kind === "var") return e.value;
  const [first, ...rest] = e.args.map(value);
  switch (e.op) {
    case "+":
      return e.args.map(value).reduce((a, b) => a + b, 0);
    case "−":
      return rest.reduce((a, b) => a - b, first);
    case "·":
      return e.args.map(value).reduce((a, b) => a * b, 1);
    case "/":
      return rest[0] === 0 ? 0 : first / rest[0];
  }
}

/** Русская запись числа: запятая вместо точки, без хвостовых нулей */
export function fmtNum(n: number, digits = 3): string {
  let s = n.toFixed(digits);
  if (s.includes(".")) {
    while (s.endsWith("0")) s = s.slice(0, -1);
    if (s.endsWith(".")) s = s.slice(0, -1);
  }
  return (s || "0").replace(".", ",");
}

/*
 * Сложение внутри умножения берётся в скобки, иначе запись меняет смысл.
 * Деление скобок не требует: печатаем его как дробь в строку, а порядок
 * действий сохраняется тем же способом, что и в умножении.
 */
const needsParens = (child: Expr, parentOp: string) =>
  child.kind === "op" &&
  (child.op === "+" || child.op === "−") &&
  /* Пустой родитель — это верхний уровень: всё выражение в скобки не берём */
  parentOp !== "" &&
  parentOp !== "+" &&
  parentOp !== "−";

function render(e: Expr, numbers: boolean, parentOp = ""): string {
  if (e.kind === "num") return fmtNum(e.value, e.digits);
  if (e.kind === "var") return numbers ? fmtNum(e.value, e.digits) : e.sym;
  const parts = e.args.map((a) => render(a, numbers, e.op));
  const body = parts.join(` ${e.op} `);
  return needsParens(e, parentOp) ? `(${body})` : body;
}

/** Запись в обозначениях: B₁ · h₁ · L */
export const inSymbols = (e: Expr): string => render(e, false);

/** Запись с подставленными числами: 1,36 · 0,1 · 100 */
export const inNumbers = (e: Expr): string => render(e, true);

export interface Rendered {
  /** Значение — то же дерево, что и в записях */
  qty: number;
  /** «B₁ · h₁ · L» */
  symbols: string;
  /** «1,36 · 0,1 · 100 = 13,6» */
  formula: string;
}

/** Готовит позицию ведомости: величина и обе записи из одного выражения */
export function rendered(e: Expr, digits = 3): Rendered {
  const qty = value(e);
  const numbers = inNumbers(e);
  const result = fmtNum(qty, digits);
  return {
    qty,
    symbols: inSymbols(e),
    /* Одиночное значение не дублируем: «100 = 100» читателю ничего не даёт */
    formula: numbers === result ? result : `${numbers} = ${result}`,
  };
}
