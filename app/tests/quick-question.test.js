// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { clearQuickStart, questionShareLink, readQuickQuestion } from "../src/lib/quickStart.js";

describe("shared question link", () => {
  beforeEach(() => { sessionStorage.clear(); history.replaceState(null, "", "/app/"); });
  it("builds a link that opens that question first and tags the source", () => {
    expect(questionShareLink("S11-B_1ra", "12", "https://condoricfes.com"))
      .toBe("https://condoricfes.com/app/?empezar=1&cuadernillo=S11-B_1ra&pregunta=12&fuente=wa-pregunta");
  });
  it("keeps the question through the sign-in round trip and clears it after", () => {
    history.replaceState(null, "", "/app/?empezar=1&cuadernillo=S11-B_1ra&pregunta=12&fuente=wa-pregunta");
    expect(readQuickQuestion()).toBe("12");
    history.replaceState(null, "", "/app/");
    expect(readQuickQuestion()).toBe("12");
    clearQuickStart();
    expect(readQuickQuestion()).toBe(null);
  });
  it("ignores anything that is not a question number", () => {
    history.replaceState(null, "", "/app/?pregunta=<script>");
    expect(readQuickQuestion()).toBe(null);
  });
});
