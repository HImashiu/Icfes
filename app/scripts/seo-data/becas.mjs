// Becas, créditos and recognitions tied to the Saber 11, for the /becas-icfes/ pages (scripts/build-seo-becas.mjs).
// Every rule, score and date here was read on the official site of the program on CHECKED (notes in
// universidades-research-notes.md, sections ICETEX, Becas y apoyos del gobierno, Universidad de los Andes).
// Nothing is estimated. When a program publishes a new call, update the entry and CHECKED together.

export const CHECKED = "2026-11-13";

// ICETEX "Tú eliges" pregrado lines: minimum Saber 11 global score by the municipality where the exam was taken
// ("Merito Mínimo" column of the official table; 1,123 municipalities, 39 to 230). Only capitals and large
// municipalities are copied here; the page links the full PDF.
export const ICETEX = {
  pdf: "https://web.icetex.gov.co/documents/20122/155937/consulta-de-municipio-de-presentacion-pruebas-saber-11.pdf",
  lines: [
    { name: "Tú eliges 30 %", url: "https://web.icetex.gov.co/es/-/tu-pagas-el-30" },
    { name: "Plan progresivo, Tú eliges 40 %", url: "https://web.icetex.gov.co/es/-/plan-progresivo-mediano-plazo-linea-tu-eliges-el-40" },
  ],
  calendarUrl: "https://web.icetex.gov.co/calendario-de-pregrado",
  // Pregrado calendar for 2027-1.
  cal: [
    ["Apertura de formularios", "2026-11-03"],
    ["Cierre de formularios (puede cerrar antes si se agotan los recursos)", "2026-12-04"],
    ["Último día para cargar documentos", "2026-12-10"],
    ["Último día para subsanar documentos", "2026-12-17"],
    ["Documentos verificados", "2026-12-21"],
    ["Último comité de aprobación", "2026-12-22"],
    ["Resultados", "2026-12-23"],
  ],
  capitals: [
    ["Bogotá", "Bogotá D. C.", 230], ["Medellín", "Antioquia", 230], ["Cali", "Valle del Cauca", 230],
    ["Barranquilla", "Atlántico", 230], ["Cartagena", "Bolívar", 230], ["Bucaramanga", "Santander", 230],
    ["Cúcuta", "Norte de Santander", 230], ["Pereira", "Risaralda", 230], ["Manizales", "Caldas", 230],
    ["Armenia", "Quindío", 230], ["Ibagué", "Tolima", 230], ["Neiva", "Huila", 230], ["Pasto", "Nariño", 230],
    ["Popayán", "Cauca", 230], ["Tunja", "Boyacá", 230], ["Villavicencio", "Meta", 230], ["Santa Marta", "Magdalena", 230],
    ["Montería", "Córdoba", 230], ["Sincelejo", "Sucre", 230], ["Valledupar", "Cesar", 230], ["Riohacha", "La Guajira", 230],
    ["Florencia", "Caquetá", 230], ["Yopal", "Casanare", 230], ["San Andrés", "San Andrés y Providencia", 206],
    ["Arauca", "Arauca", 161], ["Quibdó", "Chocó", 135], ["Mitú", "Vaupés", 130], ["San José del Guaviare", "Guaviare", 125],
    ["Leticia", "Amazonas", 111], ["Puerto Carreño", "Vichada", 90], ["Mocoa", "Putumayo", 89], ["Inírida", "Guainía", 82],
  ],
  others: [
    ["Envigado", "Antioquia", 230], ["Floridablanca", "Santander", 230], ["Dosquebradas", "Risaralda", 230],
    ["Zipaquirá", "Cundinamarca", 230], ["Sogamoso", "Boyacá", 230], ["Duitama", "Boyacá", 230], ["Tuluá", "Valle del Cauca", 228],
    ["Chía", "Cundinamarca", 227], ["Soacha", "Cundinamarca", 226], ["Palmira", "Valle del Cauca", 226], ["Itagüí", "Antioquia", 223],
    ["Fusagasugá", "Cundinamarca", 223], ["Facatativá", "Cundinamarca", 221], ["Bello", "Antioquia", 220],
    ["Barrancabermeja", "Santander", 219], ["Girardot", "Cundinamarca", 201], ["Soledad", "Atlántico", 195], ["Turbo", "Antioquia", 186],
    ["Ipiales", "Nariño", 179], ["Buenaventura", "Valle del Cauca", 175], ["Apartadó", "Antioquia", 155], ["Tumaco", "Nariño", 150],
    ["Maicao", "La Guajira", 95],
  ],
};

export const GRATUIDAD = {
  url: "https://www.mineducacion.gov.co/portal/Educacion-superior/Politica-de-Gratuidad-Puedo-Estudiar/419531:Politica-de-Gratuidad-Puedo-Estudiar",
  updated: "2026-08-12",
  groups: [
    "Estrato 1, 2 o 3, o vivienda sin estrato",
    "Población indígena",
    "Pueblo Rrom",
    "Comunidades negras, afrocolombianas, raizales y palenqueras",
    "Víctimas del conflicto armado",
    "Personas con discapacidad",
    "Comunidades campesinas (diploma de bachiller de un colegio rural)",
    "Personas privadas de la libertad",
    "Sisbén IV en los grupos A, B o C",
  ],
};

export const QUIERO_ESTUDIAR = {
  url: "https://apoyofinanciero.uniandes.edu.co/quiero-estudiar",
  minGlobal: 380,
  minGlobalMed: 400,
  minEquiv: 400,
  minEquivMed: 420,
};

export const ANDRES_BELLO = {
  url: "https://www.mineducacion.gov.co/portal/micrositios-institucionales/Noche-de-la-Excelencia-2024/422538:Distincion-Andres-Bello",
};


// Universidad del Rosario, Beca Mérito URosario Pruebas de Estado: ranking by the simple average of LC, M, SC and CN.
export const ROSARIO = {
  url: "https://urosario.edu.co/financiacion/becas/becas-merito-urosario-pruebas-de-estado",
  examDate: "2026-07-26",
  cal: [
    ["Saber 11 que cuenta", "2026-07-26"],
    ["Resultados del Saber 11", "2026-09-25"],
    ["Fecha máxima para estar admitido", "2026-10-09"],
    ["Identificación de beneficiarios", "2026-10-13"],
    ["Aplicación de las becas", "2026-10-15"],
    ["Notificación a beneficiarios", "2026-10-16"],
  ],
  excluded: ["Licenciatura en Filosofía", "Licenciatura en Ciencias Sociales", "Ingeniería Biomédica"],
};

// Agencia Atenea (Bogotá), Jóvenes a la E, sixth convocatoria (2027-1).
export const JOVENES_E = {
  base: "https://agenciaatenea.gov.co",
  privadas: "https://agenciaatenea.gov.co/convocatorias/convocatoria-jovenes-la-e-6-educacion-superior-en-instituciones-privadas",
  publicas: "https://agenciaatenea.gov.co/convocatorias/convocatoria-jovenes-la-e-6-educacion-superior-en-instituciones-publicas",
  cronograma: "https://agenciaatenea.gov.co/sites/default/files/convocatorias/2026-10/261016_cronograma-je6_priv_0.pdf",
  faq: "https://agenciaatenea.gov.co/sites/default/files/convocatorias/2026-11/preguntas_frecuentes_je6.pdf",
  lineamiento: "https://agenciaatenea.gov.co/sites/default/files/2026-11/l57_ep-lineamiento_operativo_aspirantes_sexta_convocatoria_je_v2.pdf",
  privOpen: "2026-11-12",
  privClose: "2026-11-18",
  pubOpen: "2026-11-07",
  pubClose: "2026-11-13",
  // Admisión General (private IES) schedule, cronograma v1 of 2026-10-16.
  cal: [
    ["Inscripciones en SICORE", "2026-11-12", "2026-11-18"],
    ["Verificación de requisitos y asignación de cupos", "2026-11-19", "2026-12-15"],
    ["Publicación de resultados", "2026-12-29"],
    ["Reclamaciones", "2026-12-29", "2026-12-30"],
    ["Firma de la carta de compromiso", "2026-12-29", "2027-01-12"],
    ["Actualización de la lista de espera", "2027-01-12"],
    ["Formalización del beneficio con la institución", "2027-01-04", "2027-01-29"],
  ],
};
