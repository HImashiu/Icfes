import { describe, expect, it } from "vitest";
import { renderRich } from "../src/lib/render.js";

describe("editor markup blocks", () => {
  it("keeps quote, poem and empty spacer divs with their classes", () => {
    const html = renderRich('<div class="cita">Línea uno<br>Línea dos</div>\n\n<div class="poema">  Verso<br><br>Estrofa</div>\n\n<div class="espacio"></div>');
    expect(html).toContain('class="cita"');
    expect(html).toContain('class="poema"');
    expect(html).toContain('class="espacio"');
    expect(html).toContain("  Verso");
  });

  it("keeps small and the source line", () => {
    const html = renderRich('<p class="fuente">Tomado de: <small>Autor</small></p>');
    expect(html).toContain('class="fuente"');
    expect(html).toContain("<small>Autor</small>");
  });
});

describe("chemistry in math", () => {
  it("renders mhchem equations with their arrows", () => {
    const html = renderRich("<p>Reacción: $\\ce{N2 (g) + 3H2 (g) <=> 2NH3 (g)}$</p>");
    expect(html).toContain("katex");
    expect(html).toContain("NH");
    expect(html).toContain("\u21cc");
    expect(html).not.toContain("$\\ce");
  });
});

describe("structural formulas", () => {
  it("draws a molecule with its hydrogens above and below", () => {
    const html = renderRich("<p>Ácido: $\\mol{H-C(H,H)-C(=O)-OH}$</p>");
    expect(html).toContain("katex");
    expect(html).not.toContain("\\mol{");
  });

  it("lays out a reaction in a wrapping row, one piece per molecule", () => {
    const html = renderRich('<p>$\\mol{H-C(=O)-OH "Ácido" ->[H^+] H-C(=O)-O-CH3 "Éster" + H2O "Agua"}$</p>');
    expect(html).toContain('class="mol-row"');
  });
});

describe("fill-in gaps", () => {
  it("draws a numbered blank and the worked example filled in", () => {
    const html = renderRich("<p>She [[hueco:97]] there and [[hueco:0|covers]] it.</p>");
    expect(html).toContain('data-gap="97"');
    expect(html).toContain('class="gap-n"');
    expect(html).toContain('class="gap-fill"');
    expect(html).toContain("covers");
    expect(html).not.toContain("[[hueco");
  });
});

describe("worked example block", () => {
  it("draws the example with its answer marked, as a block", () => {
    const html = renderRich("[[ejemplo:B|Where can you see this sign?|in a playground|in a street|in a garden]]\n\nQuestion text");
    expect(html).toContain('class="ejemplo"');
    expect(html).toContain("Where can you see this sign?");
    expect(html).toContain("ej-right");
    expect(html).not.toContain("[[ejemplo");
  });
});
