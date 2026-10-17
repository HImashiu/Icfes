import { describe, expect, it } from "vitest";
import { parseRoster } from "../src/lib/roster.js";

describe("parseRoster", () => {
  it("reads a header row in any column order, comma separated", () => {
    const { rows, errors } = parseRoster("correo,nombre,apellidos\nAna@Colegio.edu.co,Ana,Pérez\nbeto@colegio.edu.co,Beto,Gil");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { email: "ana@colegio.edu.co", fullName: "Ana Pérez", course: null },
      { email: "beto@colegio.edu.co", fullName: "Beto Gil", course: null },
    ]);
  });
  it("accepts semicolons, a BOM, quotes and the Spanish accent in headers", () => {
    const { rows } = parseRoster('﻿Nombre;Apellidos;Correo electrónico;Curso\n"Ana";"De la Cruz";ana@c.edu.co;11-A');
    expect(rows[0]).toEqual({ email: "ana@c.edu.co", fullName: "Ana De la Cruz", course: "11-A" });
  });
  it("without a header the order is nombre, apellidos, correo", () => {
    const { rows } = parseRoster("Ana,Pérez,ana@c.edu.co");
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ana@c.edu.co");
  });
  it("reports bad emails, duplicates and foreign domains by line, keeping the good rows", () => {
    const { rows, errors } = parseRoster("nombre,apellidos,correo\nA,B,ok@c.edu.co\nC,D,no-email\nE,F,ok@c.edu.co\nG,H,x@gmail.com", { domains: ["c.edu.co"] });
    expect(rows.map((r) => r.email)).toEqual(["ok@c.edu.co"]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
  it("says so when the email column is missing or the file is empty", () => {
    expect(parseRoster("nombre,apellidos\nA,B").errors[0].message).toMatch(/correo/);
    expect(parseRoster("  \n").errors).toHaveLength(1);
  });
});
