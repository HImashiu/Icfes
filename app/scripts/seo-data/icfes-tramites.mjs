// Facts for the Saber 11 paperwork pages (scripts/build-seo-tramites.mjs). All read on icfes.gov.co (and the
// official ICFES sub-sites) on CHECKED; see universidades-research-notes.md. Cóndor is not the ICFES: every page
// sends people to the official site for the actual paperwork.

export const CHECKED = "2026-11-13";

export const OFFICIAL = {
  icfes: "https://www.icfes.gov.co/",
  saber11: "https://www.icfes.gov.co/evaluaciones-icfes/saber-11/",
  tarifas: "https://www.icfes.gov.co/evaluaciones-icfes/saber-11/tarifas-examen-saber-11/",
  etapas: "https://www.icfes.gov.co/evaluaciones-icfes/saber-11/etapas_previas_examen_saber_11/",
  servicios: "https://www.icfes.gov.co/atencion-y-servicios-a-la-ciudadania/servicios/",
  citacion: "https://citacion.icfes.edu.co/",
  resultados: "https://resultadossaber11.icfes.gov.co/",
  calB2026: "https://www.icfes.gov.co/icfes-abre-proceso-de-registro-ordinario-para-la-prueba-saber-11-calendario-b-2026/",
  calA2026: "https://www.icfes.gov.co/icfes-amplia-plazo-inscripciones-saber-11-calendario-a-julio/",
  reporte: "https://www.icfes.gov.co/icfes-publicara-los-resultados-individuales-de-las-pruebas-saber-11-calendario-a/",
};

// Tarifas 2026 (Resolución 000629 del 11 de noviembre de 2025), ordinaria / extraordinaria.
export const TARIFAS_2026 = [
  ["Colegios públicos y privados de rango I", 72000, 108000],
  ["Colegios privados de rango II", 94000, 141000],
  ["Colegios privados de rango III", 95000, 142000],
  ["Colegios privados de rango IV", 100000, 151000],
  ["Colegios privados de rango V", 120000, 180000],
  ["Colegios privados de rango VI", 143000, 215000],
  ["Graduados (individuales), de la 1.ª a la 4.ª inscripción", 143000, 215000],
  ["Graduados (individuales), desde la 5.ª inscripción", 430000, 646000],
];

// The 2026 cycle, as the reference until the ICFES publishes 2027. ISO dates.
export const CAL_2026 = {
  B: { exam: "2026-03-15", ordinaryUntil: "2025-12-19", extra: ["2025-12-22", "2026-01-16"], citacion: "2026-02-27", results: "2026-05-15", source: "calB2026" },
  A: { exam: "2026-07-26", ordinaryUntil: "2026-05-12", extra: ["2026-05-14", "2026-05-22"], citacion: "2026-07-10", results: "2026-09-25", source: "calA2026", note: "El registro ordinario iba hasta el 1 de mayo y el ICFES lo amplió hasta el 12 de mayo." },
};

// 2027: fill in when the ICFES publishes the calendar. With an exam date here, /fechas-icfes-2027/ shows the table
// and emits Event schema for it. Keep `source` = the ICFES page that announced it.
export const CAL_2027 = {
  B: null, // e.g. { exam: "2027-03-14", ordinaryUntil: "...", extra: ["...", "..."], citacion: "...", results: "...", sourceUrl: "https://www.icfes.gov.co/..." }
  A: null,
};

// Questions per session from the ICFES "Guía de orientación Saber 11.º 2026" (figura 1, cuadernillo estándar): each
// session lasts 4 h 30 min and includes 12 questions of the clima escolar questionnaire (read 2026-11-13).
export const EXAM_DAY = {
  guideUrl: "https://www.icfes.gov.co/wp-content/uploads/2025/11/guia-orientacion-saber-11-2026-26-noviembre.pdf",
  duration: "4 horas y 30 minutos",
  climaPerSession: 12,
  start: "7:00 a. m.",
  arriveBefore: "15 minutos",
  session1: { questions: 143, tests: "Matemáticas, Lectura crítica, Sociales y ciudadanas y Ciencias naturales" },
  session2: { start: "1:30 p. m.", questions: 159, tests: "Matemáticas, Sociales y ciudadanas, Ciencias naturales e Inglés" },
  bring: ["Lápiz número 2", "Borrador", "Tajalápiz", "Tu documento de identidad"],
  ids: [
    "Cédula de ciudadanía, física o digital",
    "Tarjeta de identidad",
    "Certificado de documento en trámite",
    "Pasaporte vigente",
    "Licencia de conducción",
    "Extranjeros: cédula de extranjería, o PPT junto con el DNI",
  ],
};
