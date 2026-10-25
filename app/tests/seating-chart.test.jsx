import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SeatingChart from "../src/components/SeatingChart.jsx";
import PrintBooklet from "../src/components/PrintBooklet.jsx";
import { generatePlan } from "../src/lib/seating.js";

describe("seating chart", () => {
  it("shows version and name per seat and marks empty spots", () => {
    const plan = generatePlan({ rows: 2, cols: 3, blocked: ["0,2"], studentIds: ["a", "b", "c", "d"], seed: 5 });
    const { container } = render(<SeatingChart rows={2} cols={3} blocked={plan.blocked} seatVersion={plan.seatVersion} seats={plan.seats} names={{ a: "Ana", b: "Beto", c: "Cami", d: "Dani" }} title="Simulacro" course="11-A" counts={[1, 1, 1, 1]} />);
    expect(container.querySelectorAll(".seat")).toHaveLength(6);
    expect(container.querySelectorAll(".seat.is-blocked")).toHaveLength(1);
    expect(container.textContent).toMatch(/Ana|Beto/);
    expect(container.textContent).toMatch(/Versión A: 1/);
  });
  it("labels the booklet cover with its version", () => {
    const opts = ["A", "B", "C", "D"].map((letter) => ({ letter, text_md: letter }));
    const { container } = render(<PrintBooklet questions={[{ key: "k", section: "L", group: null, stem_md: "<p>x</p>", stimulus_md: "", options: opts }]} figures={new Map()} title="T" course="C" version="B" />);
    expect(container.querySelector(".pb-version").textContent).toMatch(/Versión B/);
  });
});
