import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { areaDrops, groupAlerts, progressAlerts, visibleAlerts } from "../src/lib/progressAlerts.js";
import { createAlertStore } from "../src/lib/alertStore.js";
import AlertInbox from "../src/screens/teacher/AlertInbox.jsx";
import TeacherLive from "../src/screens/TeacherLive.jsx";

afterEach(() => { cleanup(); window.location.hash = ""; });

const DAY = 864e5;
const NOW = Date.parse("2026-11-01T15:00:00Z");
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const course = { id: "c1", name: "Matemáticas 11 A", subject: "Matemáticas", grade: "11", label: "A" };
const score = (pct, area = "Matemáticas") => ({ keyed: true, correct: pct / 10, answered: 10, total: 10, perArea: [{ name: area, correct: pct / 10, answered: 10, total: 10 }] });
const at = (who, assignment, d, pct, area) => ({ profile_id: who, assignment_id: assignment, submitted_at: ago(d), mode: "practice", score: score(pct, area) });
const entry = (key, items, extra = {}) => ({ key, email: key, name: key.split("@")[0], courseIds: ["c1"], joined: true, alerts: [], severity: 0, items, ...extra });
const item = (id, d, pct, area = "Matemáticas") => ({ id, done: true, at: ago(d), pct, attempt: { mode: "practice", score: score(pct, area) } });

describe("progress alerts", () => {
  it("flags a class that dropped against its own previous two weeks", () => {
    const assignments = [{ id: "a1", course_id: "c1", title: "Uno", status: "active" }, { id: "a2", course_id: "c1", title: "Dos", status: "active" }];
    const attempts = [
      ...["p1", "p2", "p3", "p4", "p5"].map((p) => at(p, "a1", 20, 80)),
      ...["p1", "p2", "p3", "p4", "p5"].map((p) => at(p, "a2", 3, 60)),
    ];
    const list = progressAlerts({ courses: [course], assignments, attempts, now: NOW });
    const down = list.find((a) => a.kind === "classDown");
    expect(down.title).toMatch(/bajó 20 puntos/);
    expect(down.severity).toBeGreaterThan(0);
  });

  it("proposes re-teaching an activity most of the class got wrong, with its questions", () => {
    const assignments = [{ id: "a1", course_id: "c1", title: "Funciones", status: "active", exam_slug: "S11-A_1ra", question_keys: ["4", "9"] }];
    const attempts = ["p1", "p2", "p3", "p4", "p5"].map((p) => at(p, "a1", 2, 30));
    const re = progressAlerts({ courses: [course], assignments, attempts, now: NOW }).find((a) => a.kind === "reteach");
    expect(re.title).toBe("«Funciones» quedó en 30 %");
    expect(re.keys).toEqual(["4", "9"]);
    expect(re.route).toEqual({ section: "actividad", id: "a1", tab: "resultados" });
  });

  it("finds a drop in one area against the student's own earlier results there", () => {
    const e = entry("ana@x.co", [item("a1", 30, 80), item("a2", 20, 70), item("a3", 10, 40), item("b1", 5, 90, "Inglés")]);
    expect(areaDrops(e)).toEqual([{ area: "Matemáticas", last: 40, before: 75, id: "a3" }]);
    const list = progressAlerts({ roster: [e], courses: [course], now: NOW });
    expect(list.find((a) => a.kind === "areaDrop").title).toBe("ana bajó en Matemáticas");
  });

  it("flags three low results in a row, and turns the workspace alerts into stable ids", () => {
    const e = entry("beto@x.co", [item("a1", 30, 30), item("a2", 20, 20), item("a3", 10, 30)], { alerts: [{ kind: "late", severity: 3, reason: "2 tareas sin entregar." }] });
    const list = progressAlerts({ roster: [e], courses: [course], now: NOW });
    expect(list.map((a) => a.id)).toEqual(expect.arrayContaining(["s:beto@x.co:racha", "s:beto@x.co:late"]));
    expect(list.every((a) => a.sig)).toBe(true);
  });

  it("puts worrying alerts first and good news last", () => {
    const up = entry("caro@x.co", [], { alerts: [{ kind: "up", severity: 0, reason: "Subió." }] });
    const late = entry("dani@x.co", [], { alerts: [{ kind: "late", severity: 3, reason: "Debe." }] });
    const list = progressAlerts({ roster: [up, late], courses: [course], now: NOW });
    expect(list.map((a) => a.kind)).toEqual(["late", "up"]);
  });

  it("hides what the teacher marked done until it changes, and snoozed alerts until the date", () => {
    const alerts = [{ id: "x", sig: "1" }, { id: "y", sig: "1" }, { id: "z", sig: "1" }];
    const states = new Map([["x", { sig: "1", state: "done" }], ["y", { sig: "1", state: "snoozed", until: "2026-11-05" }], ["z", { sig: "1", state: "seen" }]]);
    expect(visibleAlerts(alerts, states, NOW).map((a) => [a.id, a.fresh])).toEqual([["z", false]]);
    const changed = [{ id: "x", sig: "2" }];
    expect(visibleAlerts(changed, states, NOW)).toEqual([{ id: "x", sig: "2", fresh: true }]);
    expect(visibleAlerts([{ id: "y", sig: "1" }], states, Date.parse("2026-11-06T12:00:00Z"))).toHaveLength(1);
  });
});

describe("grouping for large classes", () => {
  it("folds the same student alert into one row from three students on, keeping each inside", () => {
    const st = (n) => ({ id: `s:${n}:late`, level: "student", kind: "late", severity: 3, name: n });
    const list = groupAlerts([{ id: "c:1:down", level: "class", kind: "classDown", severity: 4 }, st("Ana"), st("Beto"), st("Caro"), st("Dani"), st("Eva"), { ...st("Fer"), kind: "up", id: "s:Fer:up", severity: 0 }]);
    expect(list.map((a) => a.id)).toEqual(["c:1:down", "g:late", "s:Fer:up"]);
    expect(list[1].title).toBe("5 estudiantes tienen tareas sin entregar");
    expect(list[1].detail).toBe("Ana, Beto, Caro, Dani y 1 más.");
    expect(list[1].items).toHaveLength(5);
  });
});

describe("alert store", () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

  it("keeps the answers in this browser when migration 0027 has not run", async () => {
    const api = { wsList: vi.fn().mockRejectedValue(Object.assign(new Error("no table"), { code: "missing" })), wsUpsert: vi.fn() };
    const storage = memory();
    const store = createAlertStore({ api, userId: "t1", storage });
    await store.load();
    expect(store.mode).toBe("local");
    await store.set([{ id: "a", sig: "s" }], "snoozed", { days: 7, now: NOW });
    const again = createAlertStore({ api, userId: "t1", storage });
    const rows = await again.load();
    expect(rows.get("a")).toEqual({ sig: "s", state: "snoozed", until: "2026-11-08" });
    expect(api.wsUpsert).not.toHaveBeenCalled();
  });

  it("writes one row per teacher and alert when the table exists", async () => {
    const api = { wsList: vi.fn().mockResolvedValue([{ alert_id: "b", sig: "1", state: "seen", until: null }]), wsUpsert: vi.fn().mockResolvedValue([]) };
    const store = createAlertStore({ api, userId: "t1", storage: memory() });
    expect((await store.load()).get("b").state).toBe("seen");
    await store.set([{ id: "c", sig: "9" }], "done");
    expect(api.wsUpsert).toHaveBeenCalledWith("teacher_alert_states", [{ teacher_id: "t1", alert_id: "c", sig: "9", state: "done", until: null }], "teacher_id,alert_id");
  });
});

describe("alert inbox", () => {
  const alerts = [
    { id: "s:ana:late", sig: "1", level: "student", kind: "late", severity: 3, email: "ana@x.co", title: "Ana: tareas sin entregar", detail: "2 tareas.", action: "Recordarle.", route: { student: "ana@x.co" }, cta: "Ver perfil", fresh: true },
    { id: "a:a1:repaso", sig: "1", level: "activity", kind: "reteach", severity: 3, title: "«Funciones» quedó en 30 %", detail: "5 entregas.", action: "Repasar.", route: { section: "actividad", id: "a1" }, cta: "Ver preguntas", keys: ["4"], slug: "S11-A_1ra", fresh: false },
  ];

  it("leads to the detail and records Listo, Posponer and the follow-up", async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    const onOpenStudent = vi.fn();
    const onConvert = vi.fn();
    const onFollowUp = vi.fn().mockResolvedValue();
    render(<AlertInbox attention={[]} alerts={alerts} hidden={0} contextName="todo" go={vi.fn()} onOpenStudent={onOpenStudent} onConvert={onConvert} onAnswer={onAnswer} onFollowUp={onFollowUp} />);
    expect(screen.getByText("Nueva")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver perfil" }));
    expect(onOpenStudent).toHaveBeenCalledWith("ana@x.co");
    fireEvent.click(screen.getByRole("button", { name: /Repaso/ }));
    expect(onConvert).toHaveBeenCalledWith({ target: "clase", slug: "S11-A_1ra", keys: ["4"], title: "Repaso · Funciones" });
    fireEvent.click(screen.getByRole("button", { name: "Posponer una semana: «Funciones» quedó en 30 %" }));
    expect(onAnswer).toHaveBeenCalledWith([alerts[1]], "snoozed", { days: 7 });
    fireEvent.click(screen.getByRole("button", { name: "A seguimiento" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith([alerts[0]], "done"));
    expect(onFollowUp).toHaveBeenCalledWith(alerts[0]);
  });

  it("filters by level", () => {
    render(<AlertInbox attention={[]} alerts={alerts} hidden={2} contextName="todo" go={vi.fn()} onOpenStudent={vi.fn()} onAnswer={vi.fn()} onRestore={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Actividades · 1" }));
    expect(screen.queryByText("Ana: tareas sin entregar")).toBeNull();
    expect(screen.getByText(/2 resueltas o pospuestas/)).toBeTruthy();
  });
});

describe("question bank into teaching material", () => {
  const qs = [1, 2, 3].map((n) => ({ key: String(n), number: n, section: "Matemáticas", stem_md: `<p>Pregunta ${n}</p>`, group: null }));
  const bundle = { exam: { title: "S11-A", questions: qs, sections: [{ name: "Matemáticas", questions: qs }] }, key: new Map(qs.map((q) => [q.key, "A"])), enrich: null, figures: null };
  const api = {
    getProfile: vi.fn().mockResolvedValue({ id: "t1" }),
    listCourses: vi.fn().mockResolvedValue([{ id: "c1", name: "11-A", grade: "11" }]),
    listAssignments: vi.fn().mockResolvedValue([]), listMembers: vi.fn().mockResolvedValue([]), allMembers: vi.fn().mockResolvedValue([]),
    allAttempts: vi.fn().mockResolvedValue([]), examAttempts: vi.fn().mockResolvedValue([]), questionOverrides: vi.fn().mockResolvedValue([]),
    saveLesson: vi.fn().mockImplementation(async (row) => ({ ...row, id: "l1", updated_at: "2026-11-01T00:00:00Z" })),
    lessons: vi.fn().mockResolvedValue([]), activityFormats: vi.fn().mockResolvedValue([]),
  };
  const exams = [{ slug: "S11-A_1ra", title: "S11-A", status: "ready", sections: ["Matemáticas"] }];
  const auth = { api, profile: { id: "t1", school_id: "s1", role: "teacher", full_name: "Ana", email: "ana@c.co" } };

  it("turns chosen questions into a quiz, already picked in booklet order with the quiz rules", async () => {
    window.location.hash = "#docente/biblioteca/banco";
    render(<TeacherLive auth={auth} exams={exams} fetchExam={vi.fn().mockResolvedValue(bundle)} onExit={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Elegir la pregunta 3"));
    fireEvent.click(screen.getByLabelText("Elegir la pregunta 1"));
    expect(screen.getByText("2 elegidas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Quiz/ }));
    expect(await screen.findByRole("tab", { name: /Preguntas \(2\)/ })).toBeTruthy();
    expect(window.location.hash).toBe("#docente/actividades/nueva/quiz");
    expect(screen.getByLabelText(/Permitir pistas/).checked).toBe(false);
    expect(screen.getAllByRole("button", { name: /^1\. Pregunta 1/ })[0]).toBeTruthy();
  });

  it("turns chosen questions into slides: a class saved and opened in Clases para proyectar", async () => {
    window.location.hash = "#docente/biblioteca/banco";
    render(<TeacherLive auth={auth} exams={exams} fetchExam={vi.fn().mockResolvedValue(bundle)} onExit={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Elegir la pregunta 2"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Diapositivas/ })); });
    await waitFor(() => expect(api.saveLesson).toHaveBeenCalledWith(expect.objectContaining({ exam_slug: "S11-A_1ra", items: [{ type: "q", key: "2" }] })));
    expect(window.location.hash).toBe("#docente/biblioteca/clases");
  });
});
