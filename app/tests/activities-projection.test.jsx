import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Presenter from "../src/screens/Presenter.jsx";
import { ActivityList } from "../src/screens/teacher/Activities.jsx";
import PaperGuide from "../src/screens/teacher/PaperGuide.jsx";
import { SeatingCard, SeatingWizard } from "../src/screens/teacher/SeatingPlanner.jsx";
import { buildDeck, cleanItems, cleanSettings, introOf } from "../src/lib/lesson.js";
import { normalize, parseRoute, routeHash } from "../src/lib/teacherRoutes.js";
import { studentTasks } from "../src/lib/student.js";
import { liveRpc, liveScope } from "../src/demo/live.js";
import { createDemoClient } from "../src/demo/client.js";
import { createApi } from "../src/lib/api.js";

afterEach(cleanup);

const mkq = (n) => ({
  key: String(n), number: n, section: "Matemáticas", group: null, stimulus_md: "", stem_md: `<p>Enunciado ${n}</p>`,
  options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `<p>Opción ${l}${n}</p>` })),
});
const bundle = () => ({ exam: { title: "S11-A", questions: [1, 2].map(mkq) }, key: new Map([["1", "B"], ["2", "C"]]), enrich: {}, figures: new Map() });

describe("lesson cover and slides", () => {
  it("keeps the teacher's cover, closing, notes and slide kinds, and drops bad values", () => {
    const s = cleanSettings({ intro: { layout: "split", title: "Hola", color: "red", image: "javascript:x" }, outro: { title: "Chao" }, autoTimer: true, progress: false, courseId: "c1" });
    expect(s.intro).toMatchObject({ layout: "split", title: "Hola", color: "#1F4E79", image: "" });
    expect(s.outro).toEqual({ title: "Chao", body: "" });
    expect(s).toMatchObject({ autoTimer: true, progress: false, courseId: "c1" });
    expect(cleanSettings({})).toEqual({ hideOptions: false, seconds: 60, titleSlide: true });
    expect(cleanItems([{ type: "q", key: "1", note: " recordar " }, { type: "text", title: "¿Por qué?", kind: "discuss" }, { type: "text", title: "x", kind: "rara" }]))
      .toEqual([{ type: "q", key: "1", note: "recordar" }, { type: "text", title: "¿Por qué?", body: "", kind: "discuss" }, { type: "text", title: "x", body: "" }]);
  });
  it("uses the lesson name when the cover has no title, and puts the closing on the last slide", () => {
    expect(introOf({ title: "Repaso", settings: {} })).toMatchObject({ layout: "classic", title: "Repaso" });
    const deck = buildDeck({ title: "Repaso", settings: { outro: { title: "Gracias", body: "- Tarea" } }, items: [{ type: "q", key: "1" }] }, bundle());
    expect(deck[0].intro.title).toBe("Repaso");
    expect(deck.at(-1).outro.title).toBe("Gracias");
  });
});

describe("projection", () => {
  const lesson = { id: "l1", title: "Repaso", settings: { intro: { layout: "band", title: "Mi portada", by: "Prof. Ana" } }, items: [{ type: "q", key: "1", note: "Preguntar por la tabla" }, { type: "q", key: "2" }] };

  it("shows the teacher's cover without the mascot", () => {
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={() => {}} />);
    expect(screen.getByRole("heading", { name: "Mi portada" })).toBeTruthy();
    expect(screen.getByText("Prof. Ana")).toBeTruthy();
    expect(document.querySelector(".mascot")).toBeNull();
  });
  it("leaves with the X button and pauses with its own button", () => {
    const onExit = vi.fn();
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={onExit} start={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausa: pantalla negra" }));
    expect(screen.getByRole("button", { name: "Quitar pantalla en blanco" })).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar pantalla en blanco" }));
    fireEvent.click(screen.getByRole("button", { name: "Salir de la presentación" }));
    expect(onExit).toHaveBeenCalled();
  });
  it("counts hands per letter, shows the teacher's notes and picks a name without repeating", () => {
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={() => {}} start={1} names={["Ana", "Beto"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Contar manos" }));
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "2" });
    const panel = screen.getByLabelText("Conteo de manos");
    expect(within(panel).getByText("B").parentElement.textContent).toMatch(/2/);
    fireEvent.click(screen.getByRole("button", { name: "Tus notas" }));
    expect(screen.getByText("Preguntar por la tabla")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sortear quién responde" }));
    const first = document.querySelector(".tp-pick-name").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Otro nombre" }));
    expect(document.querySelector(".tp-pick-name").textContent).not.toBe(first);
  });
  it("lists every slide and jumps to one", () => {
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={() => {}} />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.click(screen.getByRole("button", { name: /Pregunta 2/ }));
    expect(screen.getByText("Enunciado 2")).toBeTruthy();
  });
});

describe("activities", () => {
  const courses = [
    { id: "m", name: "Matemáticas 11A", subject: "Matemáticas", grade: "11", group_label: "A" },
    { id: "i", name: "Inglés 11A", subject: "Inglés", grade: "11", group_label: "A" },
  ];
  const soon = new Date(Date.now() + 5 * 864e5).toISOString();
  const past = new Date(Date.now() - 864e5).toISOString();
  const rows = [
    { id: "1", course_id: "m", kind: "homework", title: "Tarea de funciones", opens_at: past, due_at: soon, status: "active" },
    { id: "2", course_id: "i", kind: "exam", title: "Simulacro inglés", opens_at: past, due_at: soon, status: "active", delivery: "paper" },
    { id: "3", course_id: "m", kind: "task", title: "Práctica en clase", opens_at: past, due_at: soon, status: "active" },
  ];
  it("groups by subject and filters by kind", () => {
    const go = vi.fn();
    render(<ActivityList courses={courses} assignments={rows} contextName="Todo" go={go} loaded />);
    expect(screen.getByRole("heading", { name: /Matemáticas/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Inglés/ })).toBeTruthy();
    expect(screen.getByText(/Simulacro en papel/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Inglés/ }));
    expect(screen.queryByText("Tarea de funciones")).toBeNull();
    cleanup();
    render(<ActivityList kind="homework" courses={courses} assignments={rows} contextName="Todo" go={go} loaded />);
    expect(screen.getByText("Tarea de funciones")).toBeTruthy();
    expect(screen.queryByText("Simulacro inglés")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarea" }));
    expect(go).toHaveBeenCalledWith({ section: "actividades", tab: "nueva", preset: "tarea" });
  });
  it("carries the kind of a new activity in its address", () => {
    expect(parseRoute("#docente/actividades/nueva/papel")).toEqual({ section: "actividades", tab: "nueva", id: null, preset: "papel" });
    expect(routeHash(normalize({ section: "actividades", tab: "nueva", preset: "tarea" }))).toBe("#docente/actividades/nueva/tarea");
    expect(parseRoute("#docente/actividades/nueva/otra")).toEqual({ section: "actividades", tab: "nueva", id: null });
  });
  it("shows a paper activity to students without letting it start", () => {
    const [t] = studentTasks({ subjects: [], assignments: [rows[1]], attempts: [] });
    expect(t.status).toBe("paper");
  });
  it("explains paper and moves an online activity to paper", async () => {
    const api = { setAssignmentDelivery: vi.fn().mockResolvedValue() };
    const onChanged = vi.fn();
    render(<PaperGuide api={api} assignment={rows[0]} guard={(fn) => fn()} onChanged={onChanged} />);
    expect(screen.getByText(/Simulacros que se parezcan al ICFES real/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hacerla solo en papel" }));
    await vi.waitFor(() => expect(api.setAssignmentDelivery).toHaveBeenCalledWith("1", "paper"));
  });
});

describe("seating plan", () => {
  const roster = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, email: `e${i}@c.co`, full_name: `Estudiante ${i}`, role: "student" }));
  it("is a short card until the teacher opens it", () => {
    const onOpen = vi.fn();
    render(<SeatingCard plan={null} roster={roster} onOpen={onOpen} onPrint={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Armar plano" }));
    expect(onOpen).toHaveBeenCalled();
  });
  it("walks through room, versions and seats", () => {
    let saved = null;
    const { rerender } = render(<SeatingWizard api={{}} roster={roster} plan={null} savePlan={(p) => { saved = p; }} onClose={() => {}} onPrint={() => {}} siblings={[]} loadSibling={async () => null} />);
    fireEvent.click(screen.getByRole("button", { name: "Más filas" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente: versiones" }));
    fireEvent.click(screen.getByRole("radio", { name: "5 versiones" }));
    fireEvent.click(screen.getByRole("button", { name: "Repartir puestos" }));
    expect(saved).toMatchObject({ rows: 6, versions: 5 });
    expect(Object.keys(saved.seats)).toHaveLength(10);
    rerender(<SeatingWizard api={{}} roster={roster} plan={saved} savePlan={(p) => { saved = p; }} onClose={() => {}} onPrint={() => {}} siblings={[]} loadSibling={async () => null} />);
    expect(screen.getByText(/ningún puesto vecino comparte versión/)).toBeTruthy();
  });
});

describe("live game in the demo", () => {
  it("opens a room with players, plays a question and ends whenever the teacher wants", async () => {
    const tables = { live_sessions: [], live_players: [], live_answers: [] };
    const profile = { id: "t", school_id: "s" };
    const api = createApi(createDemoClient({ tables, profile, scope: liveScope, extraRpc: liveRpc({ tables, profile, keyOf: () => "B" }) }));
    const room = await api.liveCreate({ title: "Prueba", exam: "S11-A_1ra", keys: ["1", "2"], seconds: 30, course: null });
    expect(room.state).toBe("lobby");
    expect(tables.live_players.length).toBeGreaterThan(10);
    const next = await api.liveNext(room.id, 0);
    expect(next.state).toBe("question");
    const ended = await api.liveEnd(room.id);
    expect(ended.state).toBe("ended");
    expect(await api.myLiveSessions()).toHaveLength(0);
  });
});
