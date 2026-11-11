import { describe, it, expect } from "vitest";
import { gapSentence } from "../src/lib/gaps.js";

describe("gapSentence", () => {
  it("returns the sentence of a blank without the picture token in front of it", () => {
    const html = "<p>[[figura:c2-g105-112-auto-86c644]] Permanent residents that are 18 or [[hueco:109]] need to have the card.</p>";
    const s = gapSentence(html, 109);
    expect(s).toContain("Permanent residents");
    expect(s).not.toContain("figura");
  });
});
