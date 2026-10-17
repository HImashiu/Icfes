import { describe, expect, it } from "vitest";
import { autoPick, bankItems, EMPTY_FILTER, filterItems, moveKey, summarize, withGroupMates } from "../src/lib/bank.js";

const g = { id: "g1", stimulus_md: "<p>Texto largo</p>" };
const q = (n, section, group = null) => ({ key: String(n), number: n, section, stem_md: `<p>Enunciado ${n}</p>`, group });
const exam = { questions: [q(1, "Matemáticas"), q(2, "Matemáticas"), q(3, "Inglés", g), q(4, "Inglés", g), q(5, "Lectura crítica"), q(6, "Matemáticas")] };
const enrich = { 1: { competencia: "Razonamiento", dificultad: 2 }, 2: { competencia: "Razonamiento", dificultad: 4 }, 3: { competencia: "Gramática", dificultad: 3 } };
const key = new Map([["1", "A"], ["2", "B"], ["3", "C"]]);
const items = bankItems(exam, { enrich, key });

describe("bank", () => {
  it("builds flat items with tags, key flags and group sizes", () => {
    expect(items[0]).toMatchObject({ key: "1", competencia: "Razonamiento", dificultad: 2, hasKey: true, groupSize: 1 });
    expect(items[2]).toMatchObject({ groupId: "g1", groupSize: 2 });
    expect(items[4].hasKey).toBe(false);
  });
  it("filters by area, competency, difficulty, text and key", () => {
    const f = (o) => filterItems(items, { ...EMPTY_FILTER, ...o }).map((i) => i.key);
    expect(f({ areas: ["Inglés"] })).toEqual(["3", "4"]);
    expect(f({ competencias: ["Razonamiento"], difficulty: [4] })).toEqual(["2"]);
    expect(f({ text: "enunciado 5" })).toEqual(["5"]);
    expect(f({ onlyKeyed: true })).toEqual(["1", "2", "3"]);
    expect(f({ onlyTagged: true })).toEqual(["1", "2", "3"]);
  });
  it("auto-picks evenly and balances areas", () => {
    expect(autoPick(items, 2, { balance: false })).toEqual(["1", "4"]);
    const balanced = autoPick(items, 3);
    expect(new Set(balanced.map((k) => items.find((i) => i.key === k).section)).size).toBe(3);
    expect(autoPick(items, 99)).toHaveLength(6);
    expect(autoPick([], 3)).toEqual([]);
  });
  it("brings the rest of a reading text and moves keys", () => {
    expect(withGroupMates(["3"], items)).toEqual(["3", "4"]);
    expect(moveKey(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveKey(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
  it("summarizes areas, difficulty and missing keys", () => {
    expect(summarize(["1", "2", "5"], items)).toMatchObject({ total: 3, avgDifficulty: 3, noKey: 1, areas: [{ name: "Matemáticas", n: 2 }, { name: "Lectura crítica", n: 1 }] });
  });
});

import { autopsy } from "../src/lib/analytics.js";
describe("autopsy", () => {
  const row = { tema: "Tablas", competencia: "Interpretación", pista: "Lee la tabla por filas", distractores: { A: "Confunde costo con precio", C: "Mira la columna equivocada" } };
  it("names the most chosen wrong option with the AI note and a re-teach idea", () => {
    const a = autopsy({ A: 2, B: 5, C: 9, D: 1 }, ["B"], row);
    expect(a).toMatchObject({ answered: 17, rightPct: 29, topWrong: { letter: "C", n: 9, pct: 53, note: "Mira la columna equivocada" }, idea: "Lee la tabla por filas", tema: "Tablas" });
  });
  it("hides the notes when the key is not settled, and handles no answers or no wrong ones", () => {
    expect(autopsy({ A: 0, B: 4, C: 4 }, ["B"], { ...row, hidden: true }).topWrong.note).toBeNull();
    expect(autopsy({ A: 0, B: 4 }, ["B"], row).topWrong).toBeNull();
    expect(autopsy({ A: 0, B: 0 }, ["B"], null).rightPct).toBeNull();
  });
});
