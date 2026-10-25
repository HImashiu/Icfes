import { describe, expect, it } from "vitest";
import {
  bookletMap, checkKey, filterMap, hiddenFor, holdFromRow, mapTotals, normalizeRules, useFromRow, useIndex, usesFromLists, verdict, visibleKeys, withoutHidden,
} from "../src/lib/questionUse.js";
import { holdRows } from "../src/lib/questionControl.js";

const q = (n, section) => ({ key: String(n), number: n, section });
const exam = {
  questions: [q(1, "Matemáticas"), q(2, "Matemáticas"), q(3, "Inglés"), q(4, "Inglés")],
  sections: [{ name: "Matemáticas", questions: [q(1, "Matemáticas"), q(2, "Matemáticas")] }, { name: "Inglés", questions: [q(3, "Inglés"), q(4, "Inglés")] }],
};
const c11aMat = { id: "c1", name: "Matemáticas 11A", grade: "11", group_label: "A", subject: "Matemáticas" };
const c11aIng = { id: "c2", name: "Inglés 11A", grade: "11", group_label: "A", subject: "Inglés" };
const c11b = { id: "c3", name: "Matemáticas 11B", grade: "11", group_label: "B", subject: "Matemáticas" };
const use = (over) => useFromRow({ source: "assignment", id: "a", kind: "homework", exam_slug: "S", scope: "all", question_keys: ["1"], title: "Tarea", course_id: "c1", course_name: "Matemáticas 11A", grade: "11", group_label: "A", at: "2026-10-01", ...over });

describe("question uses", () => {
  it("expands a whole-scope use to every question of that scope", () => {
    const idx = useIndex([use({ question_keys: null, scope: "Inglés" })], "S", exam);
    expect([...idx.keys()]).toEqual(["3", "4"]);
  });

  it("blocks a homework question from a simulacro for the same group, in any subject", () => {
    const index = useIndex([use()], "S", exam);
    const r = checkKey("1", { kind: "exam", courses: [c11aIng], index, holds: [], slug: "S" });
    expect(r.level).toBe("block");
    expect(r.reasons[0]).toMatch(/ya la vieron/);
  });

  it("goes both ways: a simulacro question cannot become homework", () => {
    const index = useIndex([use({ kind: "exam", title: "Simulacro" })], "S", exam);
    expect(checkKey("1", { kind: "homework", courses: [c11aMat], index, holds: [], slug: "S" }).level).toBe("block");
    expect(checkKey("1", { kind: "live", courses: [c11aMat], index, holds: [], slug: "S" }).level).toBe("block");
  });

  it("warns on a repeat of the same kind and only informs for other groups", () => {
    const index = useIndex([use()], "S", exam);
    expect(checkKey("1", { kind: "task", courses: [c11aMat], index, holds: [], slug: "S" }).level).toBe("warn");
    const other = checkKey("1", { kind: "exam", courses: [c11b], index, holds: [], slug: "S" });
    expect(other.level).toBe("info");
    expect(checkKey("2", { kind: "exam", courses: [c11b], index, holds: [], slug: "S" }).level).toBe(null);
  });

  it("follows the school's rules", () => {
    const index = useIndex([use()], "S", exam);
    expect(checkKey("1", { kind: "exam", courses: [c11b], index, holds: [], slug: "S", rules: { reach: "school" } }).level).toBe("block");
    expect(checkKey("1", { kind: "exam", courses: [c11aMat], index, holds: [], slug: "S", rules: { cross: "warn" } }).level).toBe("warn");
    expect(checkKey("1", { kind: "task", courses: [c11aMat], index, holds: [], slug: "S", rules: { repeat: "off" } }).level).toBe(null);
    expect(normalizeRules({ cross: "nope", reach: "school" })).toEqual({ cross: "block", repeat: "warn", reach: "school", reserved: "block" });
  });

  it("keeps reserved questions for simulacros only, including whole-booklet holds", () => {
    const holds = [holdFromRow({ id: "h", exam_slug: "S", qkey: "*", reserve: true, hide_from_students: true, label: "Noviembre" })];
    expect(checkKey("3", { kind: "homework", courses: [c11aMat], index: new Map(), holds, slug: "S" }).level).toBe("block");
    expect(checkKey("3", { kind: "exam", courses: [c11aMat], index: new Map(), holds, slug: "S" }).level).toBe("info");
    expect(checkKey("3", { kind: "homework", courses: [c11aMat], index: new Map(), holds, slug: "OTRO" }).level).toBe(null);
  });

  it("splits a selection into blocked and warned keys", () => {
    const index = useIndex([use(), use({ id: "b", kind: "exam", question_keys: ["2"] })], "S", exam);
    const ctx = { kind: "task", courses: [c11aMat], index, holds: [], slug: "S" };
    const checks = new Map(["1", "2", "3"].map((k) => [k, checkKey(k, ctx)]));
    expect(verdict(["1", "2", "3"], checks)).toEqual({ blocked: ["2"], warned: ["1"], ok: false });
  });

  it("rebuilds uses from the teacher's own lists before the migration", () => {
    const uses = usesFromLists({
      assignments: [{ id: "a1", course_id: "c1", kind: "exam", exam_slug: "S", scope: "all", question_keys: ["1"], title: "Sim", created_by: "t1" }],
      lessons: [{ id: "l1", exam_slug: "S", title: "Clase", items: [{ type: "q", key: "2" }, { type: "text" }], owner_id: "t1" }],
      live: [{ id: "v1", exam_slug: "S", question_keys: ["3"], title: "Juego", host_id: "t1", course_id: "c3" }],
      courses: [c11aMat, c11b], staff: [{ id: "t1", full_name: "Ana Ruiz" }],
    });
    expect(uses.map((u) => [u.kind, u.keys, u.groupKey, u.teacherName])).toEqual([
      ["exam", ["1"], "11|A", "Ana Ruiz"], ["lesson", ["2"], null, "Ana Ruiz"], ["live", ["3"], "11|B", "Ana Ruiz"],
    ]);
  });
});

describe("booklet map", () => {
  it("colours questions by where they were used and counts repeats", () => {
    const index = useIndex([use(), use({ id: "b", kind: "exam", question_keys: ["1", "2"] })], "S", exam);
    const holds = [holdFromRow({ id: "h", exam_slug: "S", qkey: "4", reserve: false, hide_from_students: true })];
    const rows = bookletMap(exam, index, holds, "S");
    expect(rows.map((r) => r.state)).toEqual(["both", "exam", "free", "free"]);
    expect(rows[0].repeated).toBe(true);
    expect(mapTotals(rows)).toMatchObject({ free: 2, used: 2, both: 1, repeated: 1, hidden: 1, reserved: 0 });
    expect(filterMap(rows, "hidden").map((r) => r.key)).toEqual(["4"]);
  });
});

describe("hiding from students", () => {
  it("removes held questions and whole booklets from free practice", () => {
    const hidden = hiddenFor([{ exam_slug: "S", qkey: "2" }, { exam_slug: "T", qkey: null }]);
    const free = withoutHidden(exam, hidden, "S");
    expect(free.questions.map((x) => x.key)).toEqual(["1", "3", "4"]);
    expect(free.sections[0].questions.map((x) => x.key)).toEqual(["1"]);
    expect(withoutHidden(exam, hidden, "T").questions).toEqual([]);
    expect(withoutHidden(exam, hidden, "U")).toBe(exam);
    expect(visibleKeys(hidden, "S", exam.questions)).toEqual(["1", "3", "4"]);
  });

  it("stores a whole-booklet hold under the key *", () => {
    const [row] = holdRows({ schoolId: "s", userId: "u", slug: "S", keys: [null], reserve: true, hide: true, label: "x" });
    expect(row).toMatchObject({ qkey: "*", reserve: true, hide_from_students: true });
    expect(holdFromRow(row).key).toBe(null);
  });
});
