import { describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, applyFilters, buildRoster, followUpQueue, rosterCsv, weeklyActivity, weeklySummary, weekStart } from "../src/lib/workspace.js";
import { createWorkspaceStore } from "../src/lib/workspaceStore.js";

const NOW = new Date("2026-10-22T15:00:00").getTime(); // a Thursday
const day = (n) => new Date(NOW - n * 864e5).toISOString();
const member = (id, course, over = {}) => ({ id: `${id}-${course}`, course_id: course, profile_id: id, email: `${id}@c.co`, full_name: id[0].toUpperCase() + id.slice(1), role: "student", ...over });
const asg = (id, course, dueDays, over = {}) => ({ id, course_id: course, title: `Tarea ${id}`, kind: "task", status: "active", due_at: day(-dueDays), opens_at: day(30), ...over });
const att = (pid, aid, d, correct, total = 10, over = {}) => ({ profile_id: pid, assignment_id: aid, submitted_at: day(d), mode: "practice", duration_sec: 600, score: { keyed: true, correct, total, answered: total, perArea: [{ name: "Matemáticas", correct, total }] }, ...over });

const members = [member("ana", "c1"), member("ana", "c2", { full_name: "" }), member("beto", "c1"), member("caro", "c2"), member("dani", "c1", { profile_id: null })];
const assignments = [asg("a1", "c1", -10), asg("a2", "c1", -3), asg("a3", "c1", 2), asg("b1", "c2", -5), asg("b2", "c2", 1)];
const attempts = [
  att("ana", "a1", 12, 5), att("ana", "a2", 4, 6), att("ana", "b1", 6, 9), att("ana", "a3", 1, 9),
  att("beto", "a1", 11, 8),
  att("caro", "b1", 6, 2), att("caro", "b2", 0.2, 3),
];
const ws = { flags: new Map([["beto@c.co", { email: "beto@c.co", status_id: "s1", follow_up: true, follow_up_due: "2026-10-20", follow_up_reason: "Tareas" }]]), statuses: [{ id: "s1", label: "En observación", color: "#FFB547" }], groups: [{ id: "g1", name: "Refuerzo" }], groupMembers: [{ group_id: "g1", email: "caro@c.co" }] };
const roster = buildRoster({ members, assignments, attempts, ws, now: NOW });
const byKey = Object.fromEntries(roster.map((e) => [e.key, e]));

describe("roster across class spaces", () => {
  it("merges one student in two spaces into one entry", () => {
    expect(roster).toHaveLength(4);
    expect(byKey["ana@c.co"].courseIds.sort()).toEqual(["c1", "c2"]);
    expect(byKey["ana@c.co"].assigned).toBe(5);
    expect(byKey["ana@c.co"].done).toBe(4);
    expect(byKey["ana@c.co"].name).toBe("Ana");
  });
  it("adds status, groups, follow-up and alerts", () => {
    expect(byKey["beto@c.co"].status.label).toBe("En observación");
    expect(byKey["beto@c.co"].followUp).toEqual({ due: "2026-10-20", reason: "Tareas" });
    expect(byKey["caro@c.co"].groups).toEqual(["g1"]);
    expect(byKey["beto@c.co"].late).toBe(1);
    expect(byKey["dani@c.co"].alerts.map((a) => a.kind)).toEqual(["late", "never"]);
    expect(byKey["ana@c.co"].alerts.map((a) => a.kind)).toContain("up");
    expect(byKey["ana@c.co"].severity).toBe(0);
  });
});

describe("search and filters", () => {
  const ctx = { courseName: (id) => ({ c1: "Matemáticas 11 A", c2: "Inglés 11 B" })[id], groupName: (id) => (id === "g1" ? "Refuerzo" : ""), now: NOW };
  const run = (f) => applyFilters(roster, { ...EMPTY_FILTERS, ...f }, ctx).map((e) => e.key);
  it("searches names, emails, spaces and groups without accents", () => {
    expect(run({ q: "ingles" }).sort()).toEqual(["ana@c.co", "caro@c.co"]);
    expect(run({ q: "refuerzo" })).toEqual(["caro@c.co"]);
    expect(run({ q: "beto@" })).toEqual(["beto@c.co"]);
  });
  it("filters by space, status, follow-up, alerts and work", () => {
    expect(run({ course: "c2" }).sort()).toEqual(["ana@c.co", "caro@c.co"]);
    expect(run({ status: "s1" })).toEqual(["beto@c.co"]);
    expect(run({ status: "none" })).not.toContain("beto@c.co");
    expect(run({ followUp: "due" })).toEqual(["beto@c.co"]);
    expect(run({ alert: "never" })).toEqual(["dani@c.co"]);
    expect(run({ alert: "none" })).toEqual(["ana@c.co", "beto@c.co"]);
    expect(run({ alert: "late" })).toEqual(["dani@c.co"]);
    expect(run({ work: "late" })).toContain("beto@c.co");
    expect(run({ joined: "no" })).toEqual(["dani@c.co"]);
    expect(run({ minAvg: "60" })).toEqual(["ana@c.co", "beto@c.co"]);
  });
  it("never sorts by score", () => {
    expect(run({})).toEqual(["ana@c.co", "beto@c.co", "caro@c.co", "dani@c.co"]);
    expect(run({ sort: "attention" })[0]).not.toBe("ana@c.co");
  });
});

describe("follow-up and weekly summary", () => {
  it("lists the queue overdue first and suggests students with alerts", () => {
    const q = followUpQueue(roster, NOW);
    expect(q.queue.map((e) => [e.key, e.overdue])).toEqual([["beto@c.co", true]]);
    expect(q.suggested.map((e) => e.key)).toContain("caro@c.co");
  });
  it("counts this week's work against last week's", () => {
    expect(new Date(weekStart(NOW)).getDay()).toBe(1);
    const w = weeklySummary(roster, assignments, NOW);
    expect(w.deliveries).toBe(2); // ana a3, caro b2
    expect(w.prevDeliveries).toBe(3); // ana a2 (Sunday), ana b1 and caro b1 (Friday)
    expect(w.due.map((d) => d.id).sort()).toEqual(["a2", "a3", "b2"]); // a2 was due on Monday
    expect(w.due.find((d) => d.id === "a3")).toMatchObject({ expected: 3, done: 1 });
    expect(w.quiet.map((e) => e.key)).toContain("beto@c.co");
  });
  it("draws eight weeks of activity", () => {
    const weeks = weeklyActivity(byKey["ana@c.co"], NOW);
    expect(weeks).toHaveLength(8);
    expect(weeks.reduce((n, w) => n + w.deliveries, 0)).toBe(4);
  });
  it("exports the roster", () => {
    const csv = rosterCsv(roster, { courseName: (id) => id });
    expect(csv.split("\n")).toHaveLength(5);
    expect(csv).toMatch(/beto@c\.co,c1,En observación/);
  });
});

describe("workspace store", () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it("falls back to this browser when the migration has not run", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "missing" });
    const api = { wsList: vi.fn().mockRejectedValue(missing) };
    const storage = memory();
    const store = createWorkspaceStore({ api, schoolId: "s", userId: "u", storage });
    expect((await store.load()).mode).toBe("local");
    await store.saveStatus({ label: "Al día", color: "#5ED3B4" });
    const st = store.state.statuses[0];
    await store.setFlags(["Ana@C.co"], { status_id: st.id, follow_up: true });
    await store.saveGroup({ name: "Monitores", color: "#8AB4FF" });
    await store.addToGroup(store.state.groups[0].id, ["ana@c.co", "ana@c.co"]);
    await store.addNote("ana@c.co", "Habló con acudiente");
    await store.saveView("Pendientes", { work: "late" });
    const again = createWorkspaceStore({ api, schoolId: "s", userId: "u", storage });
    const s = await again.load();
    expect(s.flags.get("ana@c.co")).toMatchObject({ status_id: st.id, follow_up: true });
    expect(s.groupMembers).toHaveLength(1);
    expect(s.views[0].name).toBe("Pendientes");
    expect((await again.notes("ana@c.co"))[0].body).toBe("Habló con acudiente");
    await again.deleteStatus(st.id);
    expect(again.state.flags.get("ana@c.co").status_id).toBeNull();
  });
  it("writes to the database once the tables exist", async () => {
    const api = {
      wsList: vi.fn().mockResolvedValue([]),
      wsUpsert: vi.fn().mockImplementation(async (t, rows) => rows),
      wsInsert: vi.fn().mockImplementation(async (t, row) => ({ ...row, id: "x1" })),
    };
    const store = createWorkspaceStore({ api, schoolId: "s", userId: "u" });
    expect((await store.load()).mode).toBe("db");
    await store.setFlags(["A@c.co", "b@c.co"], { follow_up: true, follow_up_due: "2026-10-29" });
    expect(api.wsUpsert).toHaveBeenCalledWith("student_flags", [
      { school_id: "s", email: "a@c.co", follow_up: true, follow_up_due: "2026-10-29" },
      { school_id: "s", email: "b@c.co", follow_up: true, follow_up_due: "2026-10-29" },
    ], "school_id,email");
    await store.saveGroup({ name: " Grupo ", color: "#8AB4FF" });
    expect(api.wsInsert).toHaveBeenCalledWith("student_groups", { name: "Grupo", color: "#8AB4FF", course_id: null, school_id: "s", created_by: "u" });
    expect(store.state.groups[0].id).toBe("x1");
  });
});
