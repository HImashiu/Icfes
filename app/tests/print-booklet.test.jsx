import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrintBooklet from "../src/components/PrintBooklet.jsx";

const opts = ["A", "B", "C", "D"].map((letter) => ({ letter, text_md: `opción ${letter}` }));
const g = { id: "g1", from: 5, to: 8, stimulus_md: "<p>Texto compartido</p>", directions: "Responda las preguntas 5 a 8" };
const q = (key, section, group) => ({ key, section, group, stem_md: `<p>Enunciado ${key}</p>`, stimulus_md: group ? group.stimulus_md : "", options: opts });

describe("printed booklet", () => {
  it("prints a shared text once, renumbers the questions and groups the areas", () => {
    const qs = [q("k1", "Lectura", null), q("k2", "Lectura", g), q("k3", "Lectura", g), q("k4", "Ciencias", null)];
    const { container } = render(<PrintBooklet questions={qs} figures={new Map()} examLabel="S11-A" title="Simulacro" course="11-A" />);
    expect(container.querySelectorAll(".pb-passage")).toHaveLength(1);
    expect(container.querySelector(".pb-range").textContent).toMatch(/preguntas 2 a 3/);
    expect(container.textContent).not.toMatch(/5 a 8/);
    expect([...container.querySelectorAll(".pb-num")].map((n) => n.textContent)).toEqual(["1.", "2.", "3.", "4."]);
    expect(container.querySelectorAll(".pb-section")).toHaveLength(2);
    expect(container.querySelectorAll(".pb-options li")).toHaveLength(16);
  });
});
