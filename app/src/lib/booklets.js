// The ICFES prints one cuadernillo per exam form and splits it into two sessions (morning and afternoon). The data
// keeps one file per session ("S11-A_1ra", "S11-A_2da"); students see one cuadernillo with Sesión 1 and Sesión 2.
const SESSION = /_(\d)(?:ra|da|a)?$/i;

export function sessionOf(slug) {
  const m = String(slug ?? "").match(SESSION);
  return m ? Number(m[1]) : null;
}
export const bookletCode = (slug) => String(slug ?? "").replace(SESSION, "");

// "S11-A · Primera sesión" (or a slug) becomes "S11-A · Sesión 1".
export function sessionTitle(slug, title) {
  const n = sessionOf(slug);
  const code = bookletCode(slug) || String(title ?? "").split("·")[0].trim();
  return n ? `${code} · Sesión ${n}` : title ?? code;
}

// What each session holds, as the real exam splits it (session 1 has no Inglés).
export const SESSION_HINT = {
  1: "Lectura crítica, Matemáticas, Sociales y Ciencias",
  2: "Matemáticas, Sociales, Ciencias e Inglés",
};

// index.json entries grouped into cuadernillos, in the index order: [{ code, sessions: [{ n, slug, status, ... }] }].
export function groupBooklets(exams = []) {
  const map = new Map();
  for (const e of exams) {
    const code = bookletCode(e.slug);
    if (!map.has(code)) map.set(code, { code, sessions: [] });
    map.get(code).sessions.push({ ...e, n: sessionOf(e.slug) ?? map.get(code).sessions.length + 1 });
  }
  return [...map.values()].map((b) => ({
    ...b,
    sessions: b.sessions.sort((x, y) => x.n - y.n),
    ready: b.sessions.some((s) => s.status !== "proximamente"),
  }));
}
