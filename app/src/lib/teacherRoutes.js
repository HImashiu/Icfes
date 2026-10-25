// Addresses of the teacher panel, kept in the URL hash so the browser's back button and shared links work:
// #docente/<section>/<tab> and #docente/actividad/<id>/<tab> for one activity.
export const NAV = [
  { section: "hoy", label: "Hoy", icon: "home" },
  { section: "actividades", label: "Actividades", icon: "book" },
  { section: "estudiantes", label: "Estudiantes", icon: "users" },
  { section: "resultados", label: "Resultados", icon: "chart" },
  { section: "biblioteca", label: "Biblioteca", icon: "school" },
];
export const ADMIN_NAV = [
  { section: "colegio", tab: "cursos", label: "Cursos y materias", icon: "school" },
  { section: "colegio", tab: "docentes", label: "Docentes", icon: "users" },
  { section: "colegio", tab: "registro", label: "Quién hizo qué", icon: "shield" },
  { section: "colegio", tab: "calificacion", label: "Calificación", icon: "pencil" },
  { section: "colegio", tab: "ajustes", label: "Ajustes", icon: "user" },
];

// Tabs of each section; the first is the default. An optional third entry is the short label used on a phone. HIDDEN tabs are reached from buttons, not from the tab strip.
export const HIDDEN_TABS = new Set(["nueva"]);
export const TABS = {
  hoy: [],
  actividades: [["lista", "Todas"], ["tareas", "Tareas"], ["practicas", "Prácticas en clase", "Clase"], ["simulacros", "Simulacros", "Simul."], ["vivo", "Juego en vivo", "En vivo"], ["refuerzo", "Refuerzo"], ["nueva", "Nueva actividad"]],
  estudiantes: [["lista", "Estudiantes"], ["clases", "Listas de clase"]],
  resultados: [["resumen", "Resumen"], ["actividades", "Por actividad"], ["grafica", "Armar gráfica", "Gráficas"], ["calificacion", "Calificación", "Notas"]],
  biblioteca: [["banco", "Banco de preguntas", "Banco"], ["preguntas", "Mis preguntas"], ["clases", "Clases para proyectar", "Proyectar"]],
  colegio: [["cursos", "Cursos y materias", "Cursos"], ["docentes", "Docentes"], ["registro", "Quién hizo qué", "Registro"], ["calificacion", "Calificación", "Notas"], ["ajustes", "Ajustes"]],
  cuenta: [],
  actividad: [["resultados", "Resultados"], ["papel", "En papel"], ["calificacion", "Calificación"]],
};
const SECTIONS = new Set(Object.keys(TABS));
// What "Nueva actividad" starts as: #docente/actividades/nueva/<preset>.
export const PRESETS = {
  tarea: { kind: "homework", delivery: "online", label: "Tarea", note: "Para resolver en casa antes de una fecha", icon: "book" },
  practica: { kind: "task", delivery: "online", label: "Práctica en clase", note: "En el salón, con corrección inmediata", icon: "pencil" },
  simulacro: { kind: "exam", delivery: "online", label: "Simulacro con tiempo", note: "En línea, con cronómetro y un intento", icon: "clock" },
  papel: { kind: "exam", delivery: "paper", label: "Simulacro en papel", note: "Cuadernillo impreso y hoja de burbujas", icon: "print" },
};
const tabOk = (section, tab) => TABS[section].some(([id]) => id === tab);

export function parseRoute(hash = "") {
  const parts = String(hash).replace(/^#/, "").split("/").map((p) => decodeURIComponent(p));
  if (parts[0] !== "docente") return { section: "hoy", tab: null, id: null };
  const section = SECTIONS.has(parts[1]) ? parts[1] : "hoy";
  if (section === "actividad") {
    const id = parts[2] || null;
    if (!id) return { section: "actividades", tab: "lista", id: null };
    return { section, id, tab: tabOk(section, parts[3]) ? parts[3] : TABS.actividad[0][0] };
  }
  const tab = tabOk(section, parts[2]) ? parts[2] : TABS[section][0]?.[0] ?? null;
  if (section === "actividades" && tab === "nueva" && parts[3] in PRESETS) return { section, tab, id: null, preset: parts[3] };
  return { section, tab, id: null };
}

export function routeHash(route) {
  const r = normalize(route);
  const bits = ["docente", r.section];
  if (r.section === "actividad") bits.push(encodeURIComponent(r.id), r.tab);
  else if (r.tab) bits.push(r.tab);
  if (r.preset) bits.push(r.preset);
  return `#${bits.join("/")}`;
}

export function normalize(route) {
  const section = SECTIONS.has(route?.section) ? route.section : "hoy";
  if (section === "actividad") {
    if (!route.id) return { section: "actividades", tab: "lista", id: null };
    return { section, id: route.id, tab: tabOk(section, route.tab) ? route.tab : TABS.actividad[0][0] };
  }
  const tab = tabOk(section, route?.tab) ? route.tab : TABS[section][0]?.[0] ?? null;
  if (section === "actividades" && tab === "nueva" && route?.preset in PRESETS) return { section, tab, id: null, preset: route.preset };
  return { section, tab, id: null };
}

// The destination highlighted in the navigation for a route.
export const navSection = (route) => (route.section === "actividad" ? "actividades" : route.section);

const LABEL = Object.fromEntries([...NAV, { section: "colegio", label: "Colegio" }, { section: "cuenta", label: "Mi cuenta" }].map((n) => [n.section, n.label]));
const tabLabel = (section, tab) => TABS[section]?.find(([id]) => id === tab)?.[1] ?? "";

// Breadcrumbs: section › (activity) › tab. Each crumb but the last carries the route it opens.
export function crumbs(route, { activityTitle } = {}) {
  const r = normalize(route);
  if (r.section === "actividad") {
    return [
      { label: "Actividades", route: { section: "actividades" } },
      { label: activityTitle || "Actividad", route: { section: "actividad", id: r.id } },
      { label: tabLabel("actividad", r.tab) },
    ];
  }
  const out = [{ label: LABEL[r.section], route: { section: r.section } }];
  if (r.tab && TABS[r.section].length > 1 && r.tab !== TABS[r.section][0][0]) out.push({ label: tabLabel(r.section, r.tab) });
  return out;
}
