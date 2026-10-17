// Roster import: turns a CSV (or a pasted list) into students. Pure, so it is tested without a browser.
// Accepted columns, in any order, with a header row: nombre, apellidos, correo (or email), curso (optional).
// Without a header row the order is: nombre, apellidos, correo. Separator: comma, semicolon or tab.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitLine(line, sep) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const HEADERS = {
  nombre: "first", nombres: "first", name: "first", apellidos: "last", apellido: "last", surname: "last",
  correo: "email", email: "email", "correo electronico": "email", curso: "course", grupo: "course",
};

export function parseRoster(text, { domains = null } = {}) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  const errors = [];
  if (lines.length === 0) return { rows, errors: [{ line: 0, message: "El archivo está vacío." }] };

  const first = lines[0];
  const sep = [";", "\t", ","].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitLine(first, sep).map((h) => HEADERS[norm(h)]);
  const hasHeader = head.some(Boolean) && !EMAIL.test(first.split(sep).find((c) => c.includes("@")) ?? "");
  const cols = hasHeader ? head : ["first", "last", "email"];
  const body = hasHeader ? lines.slice(1) : lines;
  const offset = hasHeader ? 2 : 1;
  if (hasHeader && !cols.includes("email")) return { rows, errors: [{ line: 1, message: "Falta la columna «correo»." }] };

  const seen = new Set();
  body.forEach((line, i) => {
    const cells = splitLine(line, sep);
    const get = (k) => cells[cols.indexOf(k)] ?? "";
    const email = get("email").toLowerCase();
    const lineNo = i + offset;
    if (!EMAIL.test(email)) { errors.push({ line: lineNo, message: `Correo no válido: «${get("email")}».` }); return; }
    if (domains && !domains.includes(email.split("@")[1])) { errors.push({ line: lineNo, message: `${email} no es del dominio del colegio.` }); return; }
    if (seen.has(email)) { errors.push({ line: lineNo, message: `${email} está repetido.` }); return; }
    seen.add(email);
    const fullName = [get("first"), get("last")].filter(Boolean).join(" ").trim();
    rows.push({ email, fullName, course: get("course") || null });
  });
  return { rows, errors };
}
