import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RichText from "../src/components/RichText.jsx";

describe("RichText figure tokens", () => {
  it("draws the resolved figure where the token line sits", () => {
    const html = '<p>Antes</p><p>[[figura:imán]]</p><p>Después</p>';
    const out = renderToStaticMarkup(<RichText html={html} resolve={(id) => <b className="fig">{id}</b>} />);
    expect(out).toContain('<b class="fig">imán</b>');
    expect(out.indexOf("Antes")).toBeLessThan(out.indexOf("fig"));
    expect(out.indexOf("fig")).toBeLessThan(out.indexOf("Después"));
    expect(out).not.toContain("[[figura");
  });

  it("keeps plain text unchanged when no token is present", () => {
    const out = renderToStaticMarkup(<RichText html="<p>Hola</p>" resolve={() => null} />);
    expect(out).toContain("Hola");
  });
});
