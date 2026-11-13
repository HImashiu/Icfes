import { describe, expect, it } from "vitest";
import { areaNeeds, bookletsFor, condorDay, condorKeys, condorTaskRows, dueByBooklet, levelBand, mergeTasks, reviewQueue, seedOf, shareFor } from "../src/lib/condorTeacher.js";

const DAY = 864e5;
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).getTime();
const EXAMS = [
  { slug: "S11-A_1ra", status: "ready", questions: 120, sections: ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales"] },
  { slug: "S11-A_2da", status: "ready", questions: 124, sections: ["Matemáticas", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"] },
  { slug: "S11-Z", status: "proximamente", questions: 0, sections: ["Inglés"] },
];
// A practice entry as Results.jsx records it.
const entry = ({ at: t, slug = "S11-A_1ra", missed = [], right = [], area = "Matemáticas", custom = null, mode = "practice" }) => {
  const answers = Object.fromEntries([...missed, ...right].map((k) => [k, "A"]));
  return {
    id: String(t), at: t, mode, keyed: true, answered: missed.length + right.length, total: missed.length + right.length, correct: right.length, xp: right.length * 10,
    perArea: [{ name: area, correct: right.length, answered: missed.length + right.length, total: missed.length + right.length }],
    missed, right, snapshot: { slug, scope: "all", answers, ...(custom ? { custom, keys: Object.keys(answers) } : {}) },
  };
};

describe("spaced review (Leitner)", () => {
  it("a miss comes back after 1, 3, 7 and 14 days and is learned after four rights on different days", () => {
    const h = [entry({ at: at(2026, 11, 1), missed: ["5"] })];
    let q = reviewQueue(h);
    expect(q[0]).toMatchObject({ key: "5", box: 1 });
    expect(q[0].due).toBe(new Date(2026, 10, 2).getTime());
    h.push(entry({ at: at(2026, 11, 2), right: ["5"] }));
    q = reviewQueue(h);
    expect(q[0].box).toBe(2);
    expect(q[0].due).toBe(new Date(2026, 10, 5).getTime());
    // Right again the same day does not jump a box.
    h.push(entry({ at: at(2026, 11, 2, 18), right: ["5"] }));
    expect(reviewQueue(h)[0].box).toBe(2);
    h.push(entry({ at: at(2026, 11, 5), right: ["5"] }), entry({ at: at(2026, 11, 12), right: ["5"] }));
    expect(reviewQueue(h)[0]).toMatchObject({ box: 4 });
    h.push(entry({ at: at(2026, 11, 26), right: ["5"] }));
    expect(reviewQueue(h)[0]).toMatchObject({ box: 5, due: null });
  });
  it("a new miss sends the question back to the first box; questions right on the first try never enter", () => {
    const h = [entry({ at: at(2026, 11, 1), missed: ["5"], right: ["6"] }), entry({ at: at(2026, 11, 2), right: ["5"] }), entry({ at: at(2026, 11, 5), missed: ["5"] })];
    const q = reviewQueue(h);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ key: "5", box: 1, lapses: 2 });
  });
  it("groups due questions by booklet, biggest first", () => {
    const h = [entry({ at: at(2026, 11, 1), missed: ["1", "2"] }), entry({ at: at(2026, 11, 1), slug: "S11-A_2da", missed: ["9", "8", "7"] })];
    const g = dueByBooklet(reviewQueue(h), at(2026, 11, 3));
    expect(g.map((x) => x.slug)).toEqual(["S11-A_2da", "S11-A_1ra"]);
    expect(dueByBooklet(reviewQueue(h), at(2026, 11, 1))).toEqual([]);
  });
});

describe("area needs and level", () => {
  it("turns the target score into a share right per area, higher for a higher target", () => {
    const lo = shareFor("Matemáticas", 50);
    const hi = shareFor("Matemáticas", 70);
    expect(lo).toBeGreaterThan(20);
    expect(hi).toBeGreaterThan(lo);
    const n = areaNeeds({ areas: [{ name: "Matemáticas", pct: 30, answered: 40 }] }, 300, ["Matemáticas", "Inglés"]);
    expect(n[0]).toMatchObject({ name: "Matemáticas", pct: 30, diagnostic: false });
    expect(n[0].gap).toBeGreaterThan(0);
    expect(n[1]).toMatchObject({ name: "Inglés", pct: null, diagnostic: true });
  });
  it("picks easier questions for low accuracy and harder ones for high", () => {
    expect(levelBand(30)).toEqual([1, 2, 3]);
    expect(levelBand(55)).toEqual([2, 3, 4]);
    expect(levelBand(80)).toEqual([3, 4, 5]);
  });
});

describe("a day of tasks", () => {
  const goal = { examDate: "", dailyXp: 100, target: 300 };
  it("is the same every time for the same history and day (deterministic)", () => {
    const h = [entry({ at: at(2026, 11, 10), missed: ["1", "2", "3", "4"], right: ["5"] })];
    const a = condorDay({ goal, history: h, exams: EXAMS, now: at(2026, 11, 13, 9) });
    const b = condorDay({ goal, history: h, exams: EXAMS, now: at(2026, 11, 13, 20) });
    expect(a.tasks).toEqual(b.tasks);
    expect(seedOf("x")).toBe(seedOf("x"));
  });
  it("starts with a diagnostic for areas with too few answers, and adds due reviews", () => {
    const h = [entry({ at: at(2026, 11, 10), missed: ["1", "2", "3", "4"], right: ["5"] })];
    const d = condorDay({ goal, history: h, exams: EXAMS, now: at(2026, 11, 13) }); // a Friday: an area day
    const area = d.tasks.find((t) => t.slot === "area");
    expect(area.diagnostic).toBe(true);
    expect(area.count).toBeGreaterThanOrEqual(10);
    const rev = d.tasks.find((t) => t.slot === "repaso");
    expect(rev).toMatchObject({ kind: "review", slug: "S11-A_1ra" });
    expect(rev.keys).toEqual(["1", "2", "3", "4"]);
  });
  it("ignores today's practice so the plan does not move while the student works", () => {
    const h = [entry({ at: at(2026, 11, 10), missed: ["1", "2", "3"] })];
    const before = condorDay({ goal, history: h, exams: EXAMS, now: at(2026, 11, 13, 8) });
    const after = condorDay({ goal, history: [...h, entry({ at: at(2026, 11, 13, 9), right: ["1", "2", "3"] })], exams: EXAMS, now: at(2026, 11, 13, 12) });
    expect(after.tasks).toEqual(before.tasks);
  });
  it("sizes tasks from the daily XP goal and gives a simulacro on Saturday when the exam is 1-3 months away", () => {
    const sat = at(2026, 11, 14);
    const d = condorDay({ goal: { ...goal, dailyXp: 200 }, history: [], exams: EXAMS, now: sat, daysLeft: 60 });
    expect(d.perDay).toBe(20);
    expect(d.tasks[0]).toMatchObject({ kind: "simulacro", mode: "timed" });
  });
  it("rests on Sunday in the final month", () => {
    const d = condorDay({ goal, history: [], exams: EXAMS, now: at(2026, 11, 15), daysLeft: 10 });
    expect(d.rest).toBe(true);
    expect(d.tasks).toEqual([]);
  });
  it("only plans areas the student's booklets have", () => {
    const d = condorDay({ goal, history: [], exams: EXAMS.slice(0, 1), now: at(2026, 11, 13) });
    expect(d.needs.map((n) => n.name)).not.toContain("Inglés");
  });
});

describe("rows and completion", () => {
  it("a task is delivered when an attempt started from it is in the history", () => {
    const now = at(2026, 11, 13, 9);
    const d = condorDay({ goal: { dailyXp: 100, target: 300 }, history: [], exams: EXAMS, now });
    const t = d.tasks[0];
    expect(condorTaskRows(d, [], now)[0]).toMatchObject({ status: "pending" });
    const done = entry({ at: at(2026, 11, 13, 10), right: ["1", "2"], missed: ["3"], custom: { label: t.title, condor: t.id, kind: t.kind, area: t.area } });
    const rows = condorTaskRows(d, [done], at(2026, 11, 13, 11));
    expect(rows[0]).toMatchObject({ status: "delivered", pct: 67 });
    expect(rows[0].a.historyId).toBe(done.id);
  });
  it("lists earlier Cóndor tasks of the week that were done, and tomorrow's as upcoming", () => {
    const now = at(2026, 11, 13, 9);
    const old = entry({ at: at(2026, 11, 11), right: ["1"], custom: { label: "Práctica de Matemáticas", condor: "condor-2026-11-11-area", kind: "area", area: "Matemáticas" } });
    const d = condorDay({ goal: {}, history: [old], exams: EXAMS, now });
    const rows = condorTaskRows(d, [old], now);
    expect(rows.some((r) => r.a.id === "condor-2026-11-11-area" && r.status === "delivered")).toBe(true);
    expect(rows.some((r) => r.status === "scheduled")).toBe(true);
    const merged = mergeTasks([], rows);
    expect(merged[0].status).toBe("pending");
  });
});

describe("choosing questions", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({
    key: String(i + 1), number: i + 1, section: i < 20 ? "Matemáticas" : "Inglés", groupId: null, dificultad: (i % 5) + 1, hasKey: false, keyDoubt: false,
  }));
  const task = { id: "condor-2026-11-13-area", kind: "area", area: "Matemáticas", count: 5, band: [1, 2, 3] };
  it("draws new questions of the area at the student's level, the same ones every time", () => {
    const h = [entry({ at: at(2026, 11, 10), right: ["1"] })];
    const k = condorKeys(task, items, h, "S11-A_1ra", { graded: true });
    expect(k).toHaveLength(5);
    expect(k).not.toContain("1");
    for (const key of k) { expect(Number(key)).toBeLessThanOrEqual(20); expect([1, 2, 3]).toContain(items[Number(key) - 1].dificultad); }
    expect(condorKeys(task, items, h, "S11-A_1ra", { graded: true })).toEqual(k);
  });
  it("needs keyed questions unless the server grades the booklet", () => {
    expect(condorKeys(task, items, [], "S11-A_1ra", { graded: false })).toEqual([]);
  });
  it("prefers the open booklet, but not one the student has nearly used up", () => {
    expect(bookletsFor({ area: "Inglés" }, EXAMS, [], "S11-A_1ra")).toEqual(["S11-A_2da"]);
    expect(bookletsFor({ area: "Matemáticas" }, EXAMS, [], "S11-A_2da")[0]).toBe("S11-A_2da");
    const many = Array.from({ length: 100 }, (_, i) => String(i));
    const used = [entry({ at: at(2026, 11, 1), slug: "S11-A_2da", right: many })];
    expect(bookletsFor({ area: "Matemáticas" }, EXAMS, used, "S11-A_2da")[0]).toBe("S11-A_1ra");
  });
});
