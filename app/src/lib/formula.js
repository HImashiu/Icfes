// A small, safe expression language for teacher-defined scores, e.g.  max(1, min(5, 1 + pct / 25))
// Hand-written tokenizer and parser; nothing is ever passed to eval or Function, there is no property access,
// and the number of steps is capped. Numbers, names given by the caller, + - * / % ^, comparisons, && || !, and a fixed
// list of functions.

export class FormulaError extends Error {}

const MAX_LEN = 400;
const MAX_STEPS = 5000;

const FUNCS = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  avg: (...a) => a.reduce((x, y) => x + y, 0) / a.length,
  abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, log: Math.log, exp: Math.exp,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  pow: Math.pow,
  clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
};
const ARITY = { sqrt: [1, 1], abs: [1, 1], floor: [1, 1], ceil: [1, 1], log: [1, 1], exp: [1, 1], round: [1, 2], pow: [2, 2], clamp: [3, 3], if: [3, 3], min: [1, 12], max: [1, 12], avg: [1, 12], area: [1, 1] };

export const FORMULA_FUNCTIONS = ["min", "max", "avg", "abs", "sqrt", "floor", "ceil", "log", "exp", "round", "pow", "clamp", "if", "area"];

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const num = /^(\d+(\.\d*)?|\.\d+)/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new FormulaError("Falta cerrar unas comillas.");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/%^()<>,!".includes(c)) { out.push({ t: "op", v: c }); i += 1; continue; }
    throw new FormulaError(`Carácter no permitido: «${c}».`);
  }
  return out;
}

// Precedence climbing. Returns a tree of plain objects.
export function parseFormula(src) {
  if (typeof src !== "string" || !src.trim()) throw new FormulaError("Escribe una fórmula.");
  if (src.length > MAX_LEN) throw new FormulaError(`La fórmula es demasiado larga (máximo ${MAX_LEN} caracteres).`);
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek()?.t === "op" && peek().v === v;
  const eat = (v) => { if (!isOp(v)) throw new FormulaError(`Se esperaba «${v}».`); p += 1; };

  const BIN = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
  function expr(min = 1, depth = 0) {
    if (depth > 40) throw new FormulaError("La fórmula está demasiado anidada.");
    let left = unary(depth);
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" || !(t.v in BIN) || BIN[t.v] < min) break;
      p += 1;
      const right = expr(BIN[t.v] + 1, depth + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }
  function unary(depth) {
    if (isOp("-")) { p += 1; return { k: "neg", a: unary(depth + 1) }; }
    if (isOp("+")) { p += 1; return unary(depth + 1); }
    if (isOp("!")) { p += 1; return { k: "not", a: unary(depth + 1) }; }
    return power(depth);
  }
  function power(depth) {
    const base = primary(depth);
    if (isOp("^")) { p += 1; return { k: "bin", op: "^", a: base, b: unary(depth + 1) }; } // right associative
    return base;
  }
  function primary(depth) {
    const t = peek();
    if (!t) throw new FormulaError("La fórmula termina antes de tiempo.");
    p += 1;
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "id") {
      if (isOp("(")) {
        p += 1;
        const args = [];
        if (!isOp(")")) { do { args.push(expr(1, depth + 1)); if (isOp(",")) p += 1; else break; } while (true); }
        eat(")");
        const ar = ARITY[t.v];
        if (!ar) throw new FormulaError(`La función «${t.v}» no existe. Disponibles: ${FORMULA_FUNCTIONS.join(", ")}.`);
        if (args.length < ar[0] || args.length > ar[1]) throw new FormulaError(`«${t.v}» recibe ${ar[0] === ar[1] ? ar[0] : `${ar[0]} a ${ar[1]}`} valores.`);
        return { k: "call", name: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    if (t.v === "(") { const e = expr(1, depth + 1); eat(")"); return e; }
    throw new FormulaError(`No se esperaba «${t.v}».`);
  }
  const tree = expr();
  if (p < toks.length) throw new FormulaError(`No se esperaba «${toks[p].v ?? toks[p].t}».`);
  return tree;
}

// vars: { name: number }; areaOf(name) -> number is used by area("matematicas").
export function evalTree(tree, vars = {}, areaOf = () => 0) {
  let steps = 0;
  const num = (v) => {
    if (typeof v !== "number" || Number.isNaN(v)) throw new FormulaError("El resultado no es un número.");
    return v;
  };
  function ev(n) {
    steps += 1;
    if (steps > MAX_STEPS) throw new FormulaError("La fórmula es demasiado larga para calcularla.");
    switch (n.k) {
      case "num": return n.v;
      case "str": return n.v;
      case "var":
        if (!Object.prototype.hasOwnProperty.call(vars, n.name)) throw new FormulaError(`No conozco «${n.name}». Variables: ${Object.keys(vars).join(", ")}.`);
        return vars[n.name];
      case "neg": return -num(ev(n.a));
      case "not": return num(ev(n.a)) ? 0 : 1;
      case "call": {
        if (n.name === "if") return num(ev(n.args[0])) ? ev(n.args[1]) : ev(n.args[2]); // only the chosen branch runs
        if (n.name === "area") return areaOf(String(ev(n.args[0])));
        return FUNCS[n.name](...n.args.map((a) => num(ev(a))));
      }
      case "bin": {
        const a = num(ev(n.a));
        if (n.op === "&&") return a ? (num(ev(n.b)) ? 1 : 0) : 0;
        if (n.op === "||") return a ? 1 : num(ev(n.b)) ? 1 : 0;
        const b = num(ev(n.b));
        switch (n.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return a / b;
          case "%": return a % b;
          case "^": return Math.pow(a, b);
          case "<": return a < b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case ">": return a > b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
          case "==": return a === b ? 1 : 0;
          case "!=": return a !== b ? 1 : 0;
          default: throw new FormulaError("Operador desconocido.");
        }
      }
      default: throw new FormulaError("Fórmula no válida.");
    }
  }
  const out = ev(tree);
  if (typeof out !== "number" || !Number.isFinite(out)) throw new FormulaError("El resultado no es un número finito (¿división por cero?).");
  return out;
}

export function evaluateFormula(src, vars, areaOf) {
  return evalTree(parseFormula(src), vars, areaOf);
}

// For the editor: null when valid, otherwise the message.
export function checkFormula(src, vars, areaOf) {
  try { evaluateFormula(src, vars, areaOf); return null; } catch (e) { return e instanceof FormulaError ? e.message : "Fórmula no válida."; }
}
