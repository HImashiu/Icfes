import { describe, expect, it } from "vitest";
import { CHEERS, SHARE_LEVELS, cheerOf, daysLeft, errorText, friendLink, friendsApi, plural } from "../src/lib/friends.js";

describe("amigos helpers", () => {
  it("offers three sharing levels, nothing shared first", () => {
    expect(SHARE_LEVELS.map((l) => l.id)).toEqual(["nada", "basico", "completo"]);
  });
  it("names cheers and falls back to ánimo", () => {
    expect(cheerOf("vamos").label).toBe("¡Vamos juntos!");
    expect(cheerOf("nope")).toBe(CHEERS[0]);
  });
  it("counts days left", () => {
    const now = Date.UTC(2026, 10, 17, 12);
    expect(daysLeft(new Date(now + 864e5 / 2).toISOString(), now)).toBe("Queda 1 día");
    expect(daysLeft(new Date(now + 3 * 864e5).toISOString(), now)).toBe("Quedan 3 días");
    expect(daysLeft(new Date(now - 1).toISOString(), now)).toBe("Terminó");
  });
  it("words plurals and errors", () => {
    expect(plural(1, ["día", "días"])).toBe("1 día");
    expect(plural(4, ["día", "días"])).toBe("4 días");
    expect(errorText("already_today")).toMatch(/hoy/);
    expect(errorText("???")).toMatch(/otra vez/);
  });
  it("builds a friend link to #amigos/agregar", () => {
    expect(friendLink("abc234")).toMatch(/app\/#amigos\/agregar\/abc234$/);
  });
  it("talks to the server outside demo mode", () => {
    expect(typeof friendsApi.myFriends).toBe("function");
    expect(typeof friendsApi.overview).toBe("function");
  });
});
