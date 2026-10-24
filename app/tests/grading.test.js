import { describe, expect, it } from "vitest";
import { FormulaError, checkFormula, evaluateFormula } from "../src/lib/formula.js";
import { DEFAULT_MODEL, attemptStats, describeModel, gradeAttempt, gradeMany, normalizeModel, raschCalibrate, resolveModel, toScale, xpFactor } from "../src/lib/grading.js";

const questions = [
  ...Array.from({ length: 6 }, (_, i) => ({ key: String(i + 1), section: "Matemáticas" })),
  ...Array.from({ length: 4 }, (_, i) => ({ key: String(i + 7), section: "Inglés" })),
];
const key = new Map(questions.map((q) => [q.key, "A"]));
const answers = (right, wrongKeys = []) => Object.fromEntries(questions.map((q) => [q.key, right.includes(q.key) ? "A" : wrongKeys.includes(q.key) ? "B" : undefined]).filter(([, v]) => v));
const ctx = { questions, key };

describe("formula evaluator", () => {
  it("does arithmetic with precedence and powers", () => {
    expect(evaluateFormula("1 + 2 * 3", {})).toBe(7);
    expect(evaluateFormula("2 ^ 3 ^ 2", {})).toBe(512);
    expect(evaluateFormula("-2 ^ 2", {})).toBe(-4);
    expect(evaluateFormula("(1 + 2) * 3 % 4", {})).toBe(1);
  });
  it("uses variables, functions and if", () => {
    expect(evaluateFormula("max(1, min(5, 1 + pct / 25))", { pct: 80 })).toBeCloseTo(4.2);
    expect(evaluateFormula("if(pct >= 60, 5, 2)", { pct: 61 })).toBe(5);
    expect(evaluateFormula("round(avg(1, 2, 4), 1)", {})).toBe(2.3);
    expect(evaluateFormula('area("mat") * 2', {}, (n) => (n === "mat" ? 40 : 0))).toBe(80);
    expect(evaluateFormula("pct > 50 && hints == 0 || 0", { pct: 70, hints: 0 })).toBe(1);
  });
  it("only runs the chosen branch of if", () => {
    expect(evaluateFormula("if(1, 3, 1 / 0)", {})).toBe(3);
  });
  it("rejects anything that is not arithmetic", () => {
    for (const bad of ["process.exit()", "constructor", "pct.toString()", "1; 2", "a = 1", "`x`", "[1]", "x => x", "pct(1)", "1 +", "sqrt(1, 2)"]) {
      expect(checkFormula(bad, { pct: 1 })).not.toBeNull();
    }
    expect(() => evaluateFormula("__proto__", {})).toThrow(FormulaError);
    expect(() => evaluateFormula("toString", {})).toThrow(FormulaError);
    expect(() => evaluateFormula("1 / 0", {})).toThrow(/finito/);
    expect(() => evaluateFormula("(".repeat(200) + "1" + ")".repeat(200), {})).toThrow(FormulaError);
    expect(() => evaluateFormula("1".repeat(500), {})).toThrow(/larga/);
  });
});

describe("percent, scale and partial credit", () => {
  const item = { answers: answers(["1", "2", "3", "4", "7", "8"], ["5"]), hints: {}, mode: "timed" };
  it("percent counts blanks as wrong in a timed attempt", () => {
    const r = gradeAttempt(item, DEFAULT_MODEL, ctx);
    expect(r.display).toBe("60 %");
  });
  it("practice is out of what was answered", () => {
    const r = gradeAttempt({ ...item, mode: "practice" }, DEFAULT_MODEL, ctx);
    expect(r.value).toBe(86); // 6 right of 7 answered
  });
  it("hint credit and wrong penalty change the credit", () => {
    const m = normalizeModel({ partial: { hintCredit: 0.5, wrongPenalty: 0.25 } });
    const r = gradeAttempt({ ...item, hints: { 1: 1, 2: 1 } }, m, ctx);
    expect(r.value).toBe(48);
  });
  it("curves are applied per area", () => {
    const strict = normalizeModel({ curves: { "Matemáticas": { strict: 2, bonus: 0 } } });
    const a = attemptStats(item, strict, ctx).perArea.find((x) => x.name === "Matemáticas");
    expect(Math.round(a.pct)).toBe(44); // (4/6)^2
    const bonus = normalizeModel({ curves: { "Inglés": { strict: 1, bonus: 10 } } });
    expect(Math.round(attemptStats(item, bonus, ctx).perArea.find((x) => x.name === "Inglés").pct)).toBe(60);
  });
  it("scale puts the pass grade at the pass percentage", () => {
    const s = normalizeModel({ kind: "scale", scale: { min: 1, max: 5, pass: 3, passPct: 60, decimals: 1 } }).scale;
    expect(toScale(0, s)).toBe(1);
    expect(toScale(60, s)).toBe(3);
    expect(toScale(100, s)).toBe(5);
    expect(toScale(80, s)).toBe(4);
    const r = gradeAttempt(item, { kind: "scale" }, ctx);
    expect(r.value).toBe(3);
    expect(r.passed).toBe(true);
  });
  it("works from the stored score when there are no questions", () => {
    const perArea = [{ name: "Matemáticas", total: 10, answered: 10, correct: 8 }];
    const r = gradeAttempt({ perArea, mode: "timed" }, { kind: "percent", partial: { wrongPenalty: 0.5 } }, {});
    expect(r.value).toBe(70);
  });
  it("has no result without a key", () => {
    expect(gradeAttempt({ answers: {}, mode: "timed" }, DEFAULT_MODEL, { questions, key: null }).ok).toBe(false);
  });
});

describe("formula model", () => {
  const item = { answers: answers(["1", "2", "3", "4", "7", "8"], ["5"]), hints: { 1: 1 }, mode: "timed", minutes: 20, attemptNo: 2 };
  it("computes the teacher's expression", () => {
    const r = gradeAttempt(item, { kind: "formula", formula: { expr: "pct / 20 - hints * 0.1 - (attempt - 1) * 0.2", decimals: 2 } }, ctx);
    expect(r.display).toBe("2,70");
    expect(r.value).toBeCloseTo(2.7, 5);
  });
  it("reports the error instead of throwing", () => {
    const r = gradeAttempt(item, { kind: "formula", formula: { expr: "pct / zero" } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/zero/);
  });
});

describe("icfes and irt", () => {
  it("icfes gives a 0-500 estimate with a range", () => {
    const r = gradeAttempt({ answers: answers(questions.map((q) => q.key)), mode: "timed" }, { kind: "icfes" }, ctx);
    expect(r.value).toBeGreaterThan(400);
    expect(r.low).toBeLessThan(r.value);
    expect(r.provisional).toBe(true);
  });
  it("Rasch finds harder items and ranks abler people higher", () => {
    // 30 people, 8 items with growing difficulty; ability grows with person index
    const x = Array.from({ length: 30 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i / 29 > (j + 1) / 10 ? 1 : 0)));
    const fit = raschCalibrate(x);
    expect(fit).not.toBeNull();
    const { b, theta } = fit;
    expect(b[7]).toBeGreaterThan(b[0]);
    expect(theta[29]).toBeGreaterThan(theta[3]);
    expect(Math.abs(b.reduce((n, v) => n + v, 0))).toBeLessThan(1e-6);
  });
  it("refuses to calibrate a tiny group", () => {
    expect(raschCalibrate([[1, 0, 1, 0, 1, 0]])).toBeNull();
  });
  it("irt grades a group and falls back with too few people", () => {
    const qs = Array.from({ length: 10 }, (_, i) => ({ key: String(i + 1), section: "Matemáticas" }));
    const k = new Map(qs.map((q) => [q.key, "A"]));
    const group = Array.from({ length: 20 }, (_, i) => ({ id: i, mode: "timed", hints: {}, answers: Object.fromEntries(qs.filter((_, j) => i / 19 > (j + 1) / 12).map((q) => [q.key, "A"])) }));
    const out = gradeMany(group, { kind: "irt" }, { questions: qs, key: k });
    expect(out[19].value).toBeGreaterThan(out[2].value);
    expect(out[0].provisional).toBe(true);
    const few = gradeMany(group.slice(0, 3), { kind: "irt" }, { questions: qs, key: k });
    expect(few[0].note).toMatch(/Algunas áreas|Sin grupo/);
  });
});

describe("settings plumbing", () => {
  it("picks the nearest model", () => {
    const rows = [
      { scope: "school", scope_id: "s", model: { kind: "icfes" } },
      { scope: "course", scope_id: "c", model: { kind: "scale" } },
      { scope: "assignment", scope_id: "a", model: { kind: "percent" } },
    ];
    expect(resolveModel(rows, { assignmentId: "a", courseId: "c", schoolId: "s" }).source).toBe("assignment");
    expect(resolveModel(rows, { assignmentId: "z", courseId: "c", schoolId: "s" }).model.kind).toBe("scale");
    expect(resolveModel(rows, { courseId: "x", schoolId: "s" }).model.kind).toBe("icfes");
    expect(resolveModel([], { schoolId: "s" }).source).toBe("default");
  });
  it("cleans bad input", () => {
    const m = normalizeModel({ kind: "nope", partial: { wrongPenalty: 9, hintCredit: -1 }, scale: { min: 5, max: 1 }, curves: { X: { strict: 99 } }, xp: { decay: 9 } });
    expect(m.kind).toBe("percent");
    expect(m.partial).toEqual({ hintCredit: 0, wrongPenalty: 1 });
    expect(m.scale.max).toBeGreaterThan(m.scale.min);
    expect(m.curves.X.strict).toBe(2);
    expect(m.xp.decay).toBe(3);
    expect(describeModel(m)).toMatch(/Porcentaje/);
  });
  it("xp falls with a power law and has a floor", () => {
    const m = { xp: { decay: 1, floor: 0.2 } };
    expect(xpFactor(m, 1)).toBe(1);
    expect(xpFactor(m, 2)).toBe(0.5);
    expect(xpFactor(m, 4)).toBe(0.25);
    expect(xpFactor(m, 10)).toBe(0.2);
    expect(xpFactor({}, 5)).toBe(1);
  });
});
