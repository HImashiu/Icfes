// The one-page summary a family receives. Only what a parent needs: no raw answers, no other students.
import { areaAverages, areaScale, bandFor } from "./analytics.js";

const TIPS = {
  "Matemáticas": "Practicar problemas con tablas, gráficas y proporcionalidad, y explicar en voz alta cómo se resolvieron.",
  "Lectura crítica": "Leer un texto corto cada día y decir con sus propias palabras cuál es la idea principal y qué opina el autor.",
  "Sociales y ciudadanas": "Repasar los conceptos de la clase y leer una noticia cada día para identificar los puntos de vista.",
  "Ciencias naturales": "Repasar experimentos y gráficas de la clase y practicar preguntas que piden interpretar datos.",
  "Inglés": "Escuchar o leer algo corto en inglés cada día y practicar vocabulario y lectura de avisos y diálogos.",
};
const GENERIC_TIP = "Practicar un poco cada día, empezando por las preguntas que más cuestan.";

// attempts: the student's delivered attempts (score, mode, submitted_at). Returns the payload stored with the link.
export function familyPayload({ studentName, attempts }) {
  const done = attempts.filter((a) => a.submitted_at && a.score?.keyed);
  const timed = done.filter((a) => a.mode !== "practice").sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  const last = timed[timed.length - 1];
  const band = last ? bandFor(last.score.perArea) : null;
  const all = areaAverages(done);
  const perArea = all.map((a) => {
    const c = done.reduce((acc, at) => acc + (at.score.perArea.find((x) => x.name === a.name)?.correct ?? 0), 0);
    const t = done.reduce((acc, at) => acc + (at.score.perArea.find((x) => x.name === a.name)?.total ?? 0), 0);
    return { name: a.name, pct: a.pct, scale: areaScale(c, t, a.name) };
  });
  const weakest = perArea[0] ?? null;
  const strongest = perArea.length > 1 ? perArea[perArea.length - 1] : null;
  return {
    student: studentName,
    band: band?.global != null ? { low: band.low, high: band.high } : null,
    areas: perArea,
    strongest: strongest?.name ?? null,
    weakest: weakest?.name ?? null,
    plan: perArea.slice(0, 2).map((a) => ({ area: a.name, tip: TIPS[a.name] ?? GENERIC_TIP })),
    attempts: done.length,
    note: "Resultado orientativo: usa una clave de respuestas preliminar y una curva provisional. No es el puntaje oficial del ICFES.",
  };
}

export const reportUrl = (token) => `${window.location.origin}${window.location.pathname}#/informe/${token}`;
export const whatsappLink = (url, student) =>
  `https://wa.me/?text=${encodeURIComponent(`Informe de ${student} en la preparación para el ICFES: ${url}`)}`;
export const tokenFromHash = (hash) => /^#\/informe\/([a-f0-9]{20,64})$/.exec(hash ?? "")?.[1] ?? null;
