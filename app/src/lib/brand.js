// Working names for the product and its mascot. Keep them here so they can change in one place.
export const APP_NAME = "Cóndor";
export const MASCOT_NAME = "Cóndi";

// Area colors identify areas; they never grade. Text on them is always dark.
export const AREA_COLORS = {
  "Lectura crítica": "#8AB4FF",
  "Matemáticas": "#FFB547",
  "Sociales y ciudadanas": "#F59EC4",
  "Ciencias naturales": "#5ED3B4",
  "Inglés": "#C79BFF",
};
export const areaColor = (name) => AREA_COLORS[name] ?? "#A7B1AA";

const es = new Intl.NumberFormat("es-CO");
const es1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtInt = (n) => es.format(Math.round(n));
export const fmtDec = (n) => es1.format(n);
export const fmtPct = (n) => `${Math.round(n)} %`;
