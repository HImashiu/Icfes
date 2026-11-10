// A print refused by the server (bank_export, migration 0036) shows why instead of the pages; an accepted one prints
// the school, the date and the reference.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("../src/lib/supabase.js", () => ({ supabase: { rpc: (...a) => rpc(...a) }, backendConfigured: true }));

const { default: PrintBooklet } = await import("../src/components/PrintBooklet.jsx");
const { resetExportMarks } = await import("../src/lib/protect.js");

const questions = [{ key: "1", number: 1, section: "Matemáticas", stem_md: "¿Cuánto es 2 + 2?", options: [{ letter: "A", text_md: "3" }, { letter: "B", text_md: "4" }] }];

beforeEach(() => { cleanup(); resetExportMarks(); rpc.mockReset(); });

describe("print marks from the server", () => {
  it("prints the reference the server gives", async () => {
    rpc.mockResolvedValue({ data: { ok: true, ref: "7F3A2C", school: "Colegio Prueba", name: "Ana" }, error: null });
    render(<PrintBooklet questions={questions} figures={new Map()} examLabel="S11-A · Sesión 1" title="Guía" course="11 A" variant="worksheet" />);
    expect((await screen.findAllByText(/ref\. 7F3A2C/)).length).toBeGreaterThan(0);
    expect(rpc).toHaveBeenCalledWith("bank_export", { p_kind: "hoja", p_slug: "S11-A · Sesión 1", p_questions: 1 });
  });

  it("shows why instead of the questions when the school reached its limit", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "trial_export_limit" }, error: null });
    render(<PrintBooklet questions={questions} figures={new Map()} examLabel="S11-B" title="Guía" course="" variant="worksheet" />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("versión de prueba"));
    expect(screen.queryByText(/Cuánto es/)).toBeNull();
  });

  it("still prints when the server cannot be reached", async () => {
    rpc.mockRejectedValue(new Error("offline"));
    render(<PrintBooklet questions={questions} figures={new Map()} examLabel="S11-C" title="Guía" course="" variant="worksheet" />);
    expect((await screen.findAllByText(/uso exclusivo del colegio/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cuánto es/)).toBeTruthy();
  });
});
