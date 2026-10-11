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
