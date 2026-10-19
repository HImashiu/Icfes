import { describe, expect, it } from "vitest";
import { applyOverrides, draftFromBank, overrideRow } from "../src/lib/overrides.js";
import { activityCsv, activityRows, summaryOf } from "../src/lib/activityReport.js";
import { awayNow, summarizeProctor } from "../src/lib/proctor.js";
import { gradeLabel, spaceName } from "../src/lib/spaces.js";

const q = (n) => ({ key: String(n), number: n, section: "Inglés", stem_md: `stem ${n}`, stimulus_md: "", options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `opt ${l}` })), traced: [] });
const bundle = () => {
  const questions = [q(1), q(2)];
  return { exam: { questions, sections: [{ name: "Inglés", questions }] }, key: new Map([["1", "A"], ["2", "B"]]), enrich: { 1: { explicacion: "x", hidden: false } } };
};

describe("school versions of bank questions", () => {
  it("replaces only the edited question and its key", () => {
    const rows = [{ qkey: "2", answer: "C", explanation: null, question_json: { stem_md: "nuevo", options: [{ letter: "A", text_md: "a" }, { letter: "B", text_md: "b" }, { letter: "C", text_md: "c" }, { letter: "D", text_md: "d" }] } }];
    const out = applyOverrides(bundle(), rows);
    expect(out.exam.questions[0].stem_md).toBe("stem 1");
    expect(out.exam.questions[1].stem_md).toBe("nuevo");
    expect(out.exam.sections[0].questions[1]).toBe(out.exam.questions[1]);
    expect(out.key.get("2")).toBe("C");
    expect(out.key.get("1")).toBe("A");
    expect(out.exam.questions[1].adapted).toBe(true);
  });
  it("hides the AI explanation of an edited question", () => {
    const out = applyOverrides(bundle(), [{ qkey: "1", answer: "A", question_json: { stem_md: "x", options: [] } }]);
    expect(out.enrich["1"].hidden).toBe(true);
  });
  it("does nothing without versions", () => {
    const b = bundle();
    expect(applyOverrides(b, [])).toBe(b);
  });
  it("round-trips a draft", () => {
    const d = draftFromBank(q(1), "A");
    expect(d.stem).toBe("stem 1");
    const row = overrideRow({ ...d, stem: "editado" }, { schoolId: "s", userId: "u", slug: "e", qkey: "1" });
    expect(row).toMatchObject({ school_id: "s", exam_slug: "e", qkey: "1", answer: "A", edited_by: "u" });
    expect(row.question_json.stem_md).toBe("editado");
  });
});

describe("monitoring", () => {
  it("summarizes the log", () => {
    const log = [{ kind: "leave" }, { kind: "return", secs: 12 }, { kind: "leave" }, { kind: "return", secs: 8 }, { kind: "pointer_out" }, { kind: "idle", secs: 90 }];
    expect(summarizeProctor(log)).toEqual({ leaves: 2, awaySec: 20, pointerOuts: 1, idleSec: 90 });
  });
  it("finds who is away now", () => {
    const now = Date.parse("2026-10-19T12:10:00Z");
    const rows = [
      { profile_id: "a", kind: "leave", at: "2026-10-19T12:08:00Z" },
      { profile_id: "b", kind: "leave", at: "2026-10-19T12:01:00Z" }, { profile_id: "b", kind: "return", at: "2026-10-19T12:02:00Z" },
    ];
    expect(awayNow(rows, now).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("class spaces", () => {
  it("names a space", () => {
    expect(spaceName({ subject: "Inglés", grade: "9", group: "A" })).toBe("Inglés 9no A");
    expect(spaceName({ subject: "Todas las áreas", grade: "11", group: "02" })).toBe("11 02");
    expect(gradeLabel("10")).toBe("10mo");
  });
});

describe("activity report", () => {
  const members = [{ id: "m1", course_id: "c1", profile_id: "p1", email: "a@x.co", full_name: "Ana", role: "student" }, { id: "m2", course_id: "c1", profile_id: null, email: "b@x.co", full_name: "Beto", role: "student" }];
  const assignments = [
    { id: "t1", course_id: "c1", title: "Tarea 1", kind: "task", status: "active", due_at: "2020-01-01T00:00:00Z" },
    { id: "t2", course_id: "c1", title: "Examen", kind: "exam", status: "active", due_at: "2099-01-01T00:00:00Z" },
  ];
  const attempts = [{ profile_id: "p1", assignment_id: "t1", submitted_at: "2026-10-01T10:00:00Z", mode: "practice", score: { keyed: true, correct: 8, answered: 10, total: 10 }, duration_sec: 300, proctor: { leaves: 2, awaySec: 40 } }];
  it("counts deliveries, late work and leaves", () => {
    const rows = activityRows({ members, assignments, attempts });
    const ana = rows.find((r) => r.name === "Ana");
    expect(ana).toMatchObject({ assigned: 2, done: 1, late: 0, avgPct: 80, leaves: 2 });
    const beto = rows.find((r) => r.name === "Beto");
    expect(beto).toMatchObject({ done: 0, late: 1 });
    const sum = summaryOf(rows);
    expect(sum).toMatchObject({ students: 2, assigned: 4, done: 1, late: 1, inactive: 1 });
  });
  it("exports one line per student and assignment", () => {
    const csv = activityCsv(activityRows({ members, assignments, attempts }), () => "Inglés 9no A");
    expect(csv.split("\n")).toHaveLength(5);
    expect(csv).toContain("Ana,a@x.co,Inglés 9no A,Tarea 1,Entregado,80");
  });
});
