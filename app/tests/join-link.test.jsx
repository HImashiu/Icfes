import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LiveQr from "../src/components/LiveQr.jsx";
import { joinCodeFromHash, joinUrl } from "../src/lib/joinLink.js";

describe("live room join link", () => {
  it("reads the six-digit code back from the link hash", () => {
    expect(joinCodeFromHash("#en-vivo=048213")).toBe("048213");
    expect(joinCodeFromHash("#en-vivo=12345")).toBe("");
    expect(joinCodeFromHash("#presentacion")).toBe("");
    expect(joinCodeFromHash("")).toBe("");
  });

  it("builds a link on the same site that opens the join screen", () => {
    const url = joinUrl("048213", { origin: "https://condor.example", pathname: "/" });
    expect(url).toBe("https://condor.example/#en-vivo=048213");
    expect(joinCodeFromHash(new URL(url).hash)).toBe("048213");
  });

  it("renders a QR code svg with the room link as its label", () => {
    const { container, getByRole } = render(<LiveQr value="https://condor.example/#en-vivo=048213" size={200} />);
    expect(getByRole("img").getAttribute("aria-label")).toContain("048213");
    expect(container.querySelector("path").getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
  });
});
