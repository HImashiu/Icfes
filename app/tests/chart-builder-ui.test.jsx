import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChartBuilder from "../src/screens/ChartBuilder.jsx";

const q = (n, section) => ({ key: String(n), number: n, section, stem_md: `s${n}`, options: [], traced: [] });
const bundle = { exam: { questions: [q(1, "Matemáticas"), q(2, "Inglés")] }, key: new Map([["1", "A"], ["2", "B"]]), enrich: { 1: { tema: "Álgebra" }, 2: { tema: "Lectura" } } };
const api = {
  allMembers: async () => [{ id: "m1", profile_id: "p1", full_name: "Ana", email: "a@x", course_id: "c1", role: "student" }],
  chartAttempts: async () => [{ profile_id: "p1", assignment_id: "a1", submitted_at: "2026-10-12T15:00:00Z", answers: { 1: "A", 2: "C" }, times: { 1: 30, 2: 50 } }],
  savedCharts: async () => null,
};
const assignments = [{ id: "a1", course_id: "c1", kind: "task", title: "T", exam_slug: "s", courses: { name: "Mate 9A" } }];

describe("ChartBuilder", () => {
  it("draws a chart from delivered work, switches views and saves in the browser", async () => {
    const guard = vi.fn((fn) => fn());
    render(<ChartBuilder api={api} profile={{ school_id: "x" }} courses={[{ id: "c1", name: "Mate 9A" }]} assignments={assignments} fetchExam={async () => bundle} guard={guard} />);
    await waitFor(() => expect(screen.getByText("Respuestas en la gráfica")).toBeInTheDocument());
    expect(screen.getByRole("img", { name: /aciertos por área/i })).toBeInTheDocument();
    expect(screen.getByText(/valor más bajo es/i)).toHaveTextContent("Inglés");
    fireEvent.click(screen.getByRole("button", { name: "Tabla" }));
    expect(screen.getByRole("table", { name: /aciertos por área/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mapa de calor" }));
    expect(screen.getByText(/necesita un campo en Columnas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Área por espacio de clase" }));
    expect(screen.getByRole("table", { name: /por área y espacio/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre de la gráfica"), { target: { value: "Mi gráfica" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mi gráfica" })).toBeInTheDocument());
  });
});
