// Growth tools of the public site (docs/growth/LEDGER.md): pages people use, share and come back to, each one a way
// into the app. Called from build-seo.mjs with the shared helpers, after every other page family (so it can reuse
// questions that are already public and index every page for search).
//
//   herramientas-icfes/                 hub of the tools
//   diagnostico-icfes/                  F16 diagnostic: 20 questions → estimated global with a range, weakest test
//   diagnostico-icfes/curso/            F17 a teacher's class diagnostic, no account needed (+ private results view)
//   cuantas-preguntas-acertar-icfes/    F18 inverse calculator: right answers per test for a target score
//   plan-de-estudio-icfes/              F19 study plan to the exam date, printable, as calendar events
//   cuanto-falta-para-el-icfes/         F20 countdown + the dates as a calendar subscription (calendario/*.ics)
//   formulas-icfes/ (+ 3)               F21 formula sheets for Matemáticas, Física, Química, printable
//   reto-icfes/ (+ packs, noindex)      F12 five-question challenges to send a friend
//   aliados/                            F10 partner programme for tutors, academies and creators
//   propuesta-colegios/                 F47 a school's own proposal, printable
//   simulacro-nacional/                 F30 the Cóndor national mock exam day
//   que-viene/                          F46 roadmap with votes
//   novedades/ + feed.xml               F24 what's new, as a page and an Atom feed
//   buscar/ (noindex) + index.json      F22 site search, zero-result searches recorded
//   verificar/, cartel/ (noindex)       F39 certificate check, F14 printable poster with a personal QR code
// The pages' behaviour is site-src/tools.js, bundled here with esbuild into site-dist/tools.js.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildScoreTables, icsCalendar, REAL_COUNTS, TEST_IDS, TEST_NAMES } from "../src/lib/growth/tools-core.js";
import { CAL_2026, CAL_2027 } from "./seo-data/icfes-tramites.mjs";

// Pages written outside the sitemap (noindex); build-site.mjs fills their placeholders like the others.
export const RAW_PAGES = [];

export const GROWTH_TOOLS = [
  { path: "diagnostico-icfes/", name: "Diagnóstico ICFES", short: "¿Cuánto sacarías hoy? 20 preguntas reales y tu puntaje estimado por prueba." },
  { path: "cuantas-preguntas-acertar-icfes/", name: "¿Cuántas preguntas debo acertar?", short: "Las respuestas correctas que necesitas en cada prueba para tu puntaje meta." },
  { path: "plan-de-estudio-icfes/", name: "Plan de estudio ICFES", short: "Semana a semana hasta tu examen, para imprimir o llevar al calendario." },
  { path: "cuanto-falta-para-el-icfes/", name: "Cuenta regresiva ICFES", short: "Los días que faltan y las fechas del Saber 11 en tu calendario." },
  { path: "formulas-icfes/", name: "Fórmulas para el ICFES", short: "Matemáticas, Física y Química en hojas para imprimir." },
  { path: "reto-icfes/", name: "Reto ICFES para un amigo", short: "Cinco preguntas reales para resolver y mandar por WhatsApp." },
  { path: "diagnostico-icfes/curso/", name: "Diagnóstico para tu curso", short: "Para docentes: un enlace para el curso y los resultados de todos, sin crear cuenta." },
  { path: "simulacro-nacional/", name: "Simulacro nacional Cóndor", short: "Un sábado, todos a la misma hora, con el examen real completo." },
];

const CHECKED = "2026-11-13";
// The national mock day (F30). Session 1 in the morning, session 2 after lunch, a real past exam.
export const NACIONAL = { key: "nacional-2026-12", date: "2026-12-05", s1: "08:00", s2: "14:00", exam1: "ICFES-2019-1_1ra", exam2: "ICFES-2019-1_2da", examName: "ICFES 2019-1" };
// 2027 exam dates: the official ones when CAL_2027 has them, otherwise an estimate from 2026 (same Sunday of the month).
export const EXAM_2027 = {
  B: CAL_2027.B?.exam ?? "2027-03-14",
  A: CAL_2027.A?.exam ?? "2027-07-25",
  official: !!(CAL_2027.B?.exam || CAL_2027.A?.exam),
};

const FORMULAS = {
  matematicas: {
    name: "Matemáticas", color: "#FFB547",
    title: "Fórmulas de matemáticas para el ICFES",
    desc: "Hoja de fórmulas de matemáticas para el ICFES Saber 11: porcentajes, áreas, volúmenes, Pitágoras, funciones, probabilidad y estadística. Para imprimir.",
    intro: "El Saber 11 no da hoja de fórmulas: estas son las que más se usan en Matemáticas. Más que memorizarlas, practica cuándo usar cada una.",
    blocks: [
      ["Porcentajes y proporciones", [["x % de N", "N · x / 100"], ["Aumento de x %", "N · (1 + x/100)"], ["Descuento de x %", "N · (1 − x/100)"], ["Regla de tres directa", "a/b = c/d → d = b·c / a"], ["Variación porcentual", "(nuevo − viejo) / viejo · 100"]]],
      ["Áreas y perímetros", [["Rectángulo", "A = b · h; P = 2b + 2h"], ["Triángulo", "A = b · h / 2"], ["Trapecio", "A = (B + b) · h / 2"], ["Círculo", "A = π r²; L = 2 π r"], ["Sector circular", "A = π r² · θ / 360°"]]],
      ["Volúmenes", [["Prisma y cilindro", "V = área de la base · h"], ["Cilindro", "V = π r² h"], ["Pirámide y cono", "V = área de la base · h / 3"], ["Esfera", "V = 4/3 π r³"], ["Cubo", "V = a³"]]],
      ["Triángulos", [["Pitágoras", "c² = a² + b²"], ["Suma de ángulos", "180°"], ["Seno, coseno, tangente", "sen θ = op/hip; cos θ = ady/hip; tan θ = op/ady"], ["Semejanza", "lados proporcionales: a/a′ = b/b′ = c/c′"]]],
      ["Funciones y rectas", [["Pendiente", "m = (y₂ − y₁) / (x₂ − x₁)"], ["Recta", "y = m x + b"], ["Cuadrática: vértice", "x = −b / 2a"], ["Fórmula general", "x = (−b ± √(b² − 4ac)) / 2a"], ["Rectas paralelas / perpendiculares", "m₁ = m₂ / m₁ · m₂ = −1"]]],
      ["Potencias y logaritmos", [["Producto", "aᵐ · aⁿ = aᵐ⁺ⁿ"], ["Cociente", "aᵐ / aⁿ = aᵐ⁻ⁿ"], ["Potencia de potencia", "(aᵐ)ⁿ = aᵐⁿ"], ["Logaritmo", "log_b x = y ⇔ bʸ = x"], ["Crecimiento compuesto", "C · (1 + r)ᵗ"]]],
      ["Probabilidad y conteo", [["Probabilidad", "P = casos favorables / casos posibles"], ["Complemento", "P(no A) = 1 − P(A)"], ["Independientes", "P(A y B) = P(A) · P(B)"], ["Permutaciones", "n! / (n − r)!"], ["Combinaciones", "n! / (r! (n − r)!)"]]],
      ["Estadística", [["Media", "suma de los datos / número de datos"], ["Mediana", "el dato del centro, ordenados"], ["Moda", "el dato que más se repite"], ["Rango", "máximo − mínimo"], ["Media ponderada", "Σ (dato · peso) / Σ pesos"]]],
    ],
  },
  fisica: {
    name: "Física", color: "#5ED3B4",
    title: "Fórmulas de física para el ICFES (Ciencias)",
    desc: "Hoja de fórmulas de física para Ciencias naturales del ICFES: movimiento, fuerzas, energía, presión, electricidad y ondas, con unidades. Para imprimir.",
    intro: "En Ciencias naturales del Saber 11, las preguntas de física piden interpretar gráficas y situaciones más que hacer cuentas largas. Estas relaciones son las que aparecen.",
    blocks: [
      ["Movimiento", [["Velocidad media", "v = Δx / Δt"], ["MRU", "x = x₀ + v t"], ["Aceleración", "a = Δv / Δt"], ["MRUA", "v = v₀ + a t; x = x₀ + v₀ t + ½ a t²"], ["Caída libre", "g ≈ 9,8 m/s²"]]],
      ["Fuerzas", [["Segunda ley de Newton", "F = m · a"], ["Peso", "P = m · g"], ["Ley de Hooke", "F = k · Δx"], ["Fricción", "f = μ · N"], ["Acción y reacción", "fuerzas iguales y opuestas en cuerpos distintos"]]],
      ["Energía y trabajo", [["Trabajo", "W = F · d · cos θ"], ["Energía cinética", "Ec = ½ m v²"], ["Energía potencial", "Ep = m g h"], ["Conservación", "Ec + Ep = constante (sin fricción)"], ["Potencia", "P = W / t"]]],
      ["Fluidos y calor", [["Densidad", "ρ = m / V"], ["Presión", "P = F / A"], ["Presión en un líquido", "P = ρ g h"], ["Empuje (Arquímedes)", "E = ρ_líquido · g · V_sumergido"], ["Calor", "Q = m · c · ΔT"]]],
      ["Electricidad", [["Ley de Ohm", "V = I · R"], ["Potencia eléctrica", "P = V · I"], ["Resistencias en serie", "R = R₁ + R₂ + …"], ["En paralelo", "1/R = 1/R₁ + 1/R₂ + …"], ["Carga", "q = I · t"]]],
      ["Ondas", [["Velocidad de una onda", "v = λ · f"], ["Periodo", "T = 1 / f"], ["Cantidad de movimiento", "p = m · v"]]],
    ],
  },
  quimica: {
    name: "Química", color: "#8AB4FF",
    title: "Fórmulas de química para el ICFES (Ciencias)",
    desc: "Hoja de fórmulas de química para el ICFES Saber 11: mol, masa molar, concentraciones, gases, pH y estequiometría, con ejemplos de unidades. Para imprimir.",
    intro: "Química en el Saber 11 mide si entiendes cantidades, mezclas y reacciones. Con estas relaciones resuelves la mayoría de preguntas de cálculo.",
    blocks: [
      ["Cantidad de sustancia", [["Moles", "n = masa / masa molar"], ["Número de Avogadro", "6,022 × 10²³ partículas por mol"], ["Masa molar", "suma de las masas atómicas (g/mol)"], ["Densidad", "ρ = m / V"]]],
      ["Concentración", [["Molaridad", "M = moles de soluto / litros de solución"], ["% masa/masa", "masa de soluto / masa de solución · 100"], ["% masa/volumen", "g de soluto / mL de solución · 100"], ["Dilución", "C₁ V₁ = C₂ V₂"], ["Partes por millón", "mg de soluto / kg (o L) de solución"]]],
      ["Gases", [["Gas ideal", "P V = n R T (T en kelvin)"], ["Boyle (T constante)", "P₁ V₁ = P₂ V₂"], ["Charles (P constante)", "V₁ / T₁ = V₂ / T₂"], ["Gay-Lussac (V constante)", "P₁ / T₁ = P₂ / T₂"], ["Kelvin", "K = °C + 273"]]],
      ["Ácidos y bases", [["pH", "pH = −log [H⁺]"], ["pOH", "pH + pOH = 14"], ["Neutro", "pH = 7 a 25 °C"], ["Ácido / básico", "pH < 7 / pH > 7"]]],
      ["Reacciones", [["Ley de conservación", "la masa de reactivos = la masa de productos"], ["Estequiometría", "usa los coeficientes de la ecuación balanceada como razón de moles"], ["Reactivo límite", "el que se acaba primero según la razón de moles"], ["Rendimiento", "real / teórico · 100"]]],
    ],
  },
};

export async function buildGrowthPages(ctx) {
  const { siteUrl, write, page, esc, faqBlock, faqLd, cta, renderRich, AREAS, bank, used, usable, questionHtml, saber11, appRoot, out, markKatex } = ctx;
  const ext = (url, text) => `<a href="${url}" rel="nofollow noopener" target="_blank">${text}</a>`;
  const css = (up) => `<link rel="stylesheet" href="${up}growth.css" />`;
  const toolLinks = (up, skip) => GROWTH_TOOLS.filter((t) => t.path !== skip).slice(0, 8)
    .map((t) => `<a href="${up}${t.path}">${esc(t.name)}</a>`).join(" · ");
  const pages = [];
  const put = (path, html) => { write(path, html); pages.push(path); };
  // Pages that must not be indexed (duplicates of public questions, personal views): written outside the sitemap.
  const putRaw = (path, html) => {
    RAW_PAGES.push(path);
    mkdirSync(join(out, path), { recursive: true });
    writeFileSync(join(out, path, "index.html"), html.replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, follow" />'));
  };

  // Score tables from the app's own estimator (lib/saber11.js), so the site and the app agree.
  const diagTables = buildScoreTables(saber11.scoreTest, 4);
  const realTables = buildScoreTables(saber11.scoreTest, REAL_COUNTS);

  // ------------------------------------------------------------------ public questions already on other pages
  // The diagnostic and the challenges only reuse questions that are public already, so the public set stays the same
  // size (the cap of 550 public questions holds).
  const areaOf = Object.fromEntries(AREAS.map((a) => [a.name, a]));
  const testIdOf = { "Lectura crítica": "lc", "Matemáticas": "ma", "Sociales y ciudadanas": "sc", "Ciencias naturales": "cn", "Inglés": "in" };
  const publicItems = (areaName, max) => {
    const items = [];
    for (const b of bank) {
      for (const q of b.exam.questions) {
        if (items.length >= max) return items;
        if (!used.has(`${b.name}-${q.number}`) || !usable(b, q, areaName)) continue;
        const g = q.group_id ? b.groups.get(q.group_id) : null;
        if (g && items.some((it) => it.g === g)) { items.push({ b, q, passage: null, g, groupSize: 1, areaName }); continue; }
        items.push({ b, q, passage: g ?? null, g, groupSize: 1, areaName });
      }
    }
    return items;
  };
  // n questions of an area: standalone ones first; reading areas keep a passage with its questions together.
  const pick = (areaName, n, offset = 0) => {
    const all = publicItems(areaName, 400);
    const singles = all.filter((it) => !it.g);
    if (singles.length >= n + offset) return singles.slice(offset, offset + n).map((it) => ({ ...it, passage: null }));
    const out2 = [];
    const groups = [...new Set(all.filter((it) => it.g).map((it) => it.g))];
    for (const g of groups.slice(offset % Math.max(1, groups.length))) {
      const qs = all.filter((it) => it.g === g).slice(0, n - out2.length);
      qs.forEach((it, i) => out2.push({ ...it, passage: i === 0 ? g : null, groupSize: qs.length }));
      if (out2.length >= n) break;
    }
    return out2.length ? out2 : singles.slice(0, n);
  };
  const qHtml = (items) => items.map((it) => {
    const area = areaOf[it.areaName] ?? AREAS[0];
    const h = questionHtml(it, area, renderRich).replace('class="qcard q reveal"', `class="qcard q reveal" data-test="${testIdOf[area.name]}"`);
    if (h.includes('class="katex')) markKatex();
    return h;
  }).join("\n");

  // ------------------------------------------------------------------ hub
  {
    const path = "herramientas-icfes/";
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Herramientas</span>
  <h1>Herramientas gratis para preparar el ICFES</h1>
  <p class="prose">Calculadoras, un diagnóstico de 20 preguntas reales, tu plan de estudio, la cuenta regresiva al examen y hojas de fórmulas. Todo funciona en el celular y sin crear cuenta.</p>
  <p class="caption" data-proof hidden></p>
</div></section>
<section class="wrap narrow guide-body g-tool">
  <div class="areas">${GROWTH_TOOLS.map((t) => `<a class="area" href="${up}${t.path}" style="--c:#C8F04A"><span class="dot"></span><b>${esc(t.name)}</b><span>${esc(t.short)}</span></a>`).join("")}</div>
  <section hidden><h2>Lo que dicen quienes practican</h2><div class="g-quotes" data-testimonials hidden></div></section>
  <h2>Más para tu preparación</h2>
  <p class="prose">También tienes la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>, el <a href="${up}puntaje-icfes/">puntaje que pide cada universidad</a>, los <a href="${up}examenes-icfes-anteriores/">exámenes ICFES anteriores</a> completos y las <a href="${up}formulas-icfes/matematicas/">fórmulas de matemáticas</a> para imprimir. ¿Quieres ver qué viene en Cóndor? Vota en <a href="${up}que-viene/">lo que viene</a>, o mira las <a href="${up}novedades/">novedades</a>.</p>
  <p class="prose">¿Das clases o tienes una academia? Mira el <a href="${up}aliados/">programa de aliados</a>. ¿Coordinas el Saber 11 en un colegio? Arma la <a href="${up}propuesta-colegios/">propuesta para tu colegio</a>.</p>
</section>
${cta(up, "Practica con preguntas reales")}`;
    put(path, page({
      siteUrl, path, title: "Herramientas ICFES gratis: diagnóstico, plan y más",
      desc: "Herramientas gratis para el ICFES Saber 11: diagnóstico de 20 preguntas, cuántas preguntas acertar, plan de estudio, cuenta regresiva y fórmulas.",
      body: css(up) + body, crumbs: [{ name: "Herramientas", path }],
      jsonLd: [{ "@type": "CollectionPage", name: "Herramientas ICFES", url: siteUrl + path, inLanguage: "es-CO", hasPart: GROWTH_TOOLS.map((t) => ({ "@type": "WebPage", name: t.name, url: siteUrl + t.path })) }],
    }));
  }

  // ------------------------------------------------------------------ F16 diagnostic (+ class mode with ?c=)
  {
    const path = "diagnostico-icfes/";
    const up = "../";
    const items = TEST_IDS.flatMap((id) => pick(TEST_NAMES[id], 4));
    const byTest = Object.fromEntries(TEST_IDS.map((id) => [id, items.filter((it) => testIdOf[it.areaName] === id).length]));
    const faq = [
      ["¿El diagnóstico da mi puntaje real del ICFES?", "Da un estimado con un rango. Con 4 preguntas por prueba el rango es amplio: sirve para saber por dónde empezar. Para un estimado más fino haz un simulacro completo."],
      ["¿De dónde salen las preguntas?", "Son preguntas reales de cuadernillos que publicó el ICFES. Cada una dice su cuadernillo y su número."],
      ["¿Cómo se calcula el puntaje?", "Con el mismo modelo de la app de Cóndor: un puntaje de 0 a 100 por prueba según tus respuestas, y el global con los pesos oficiales (3 para cada prueba y 1 para Inglés), dividido entre 13 y multiplicado por 5."],
      ["¿Lo puedo hacer con mi curso?", "Sí. El docente crea un enlace en «Diagnóstico para tu curso», lo comparte por WhatsApp y ve los resultados de todos en una sola página, sin crear cuenta."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Diagnóstico</span>
  <h1>Diagnóstico ICFES: ¿cuánto sacarías hoy?</h1>
  <p class="prose" id="g-diag-intro">Responde ${items.length} preguntas reales del Saber 11, cuatro por prueba, y te mostramos tu <b>puntaje global estimado</b> con su rango, tu resultado por prueba y por dónde empezar. Toma unos 25 minutos.</p>
  <p class="caption" data-proof hidden></p>
  <div class="cta-row"><a class="btn btn-primary" href="#g-quiz" data-ev="diag:start" data-no-cta>Empezar el diagnóstico</a><a class="btn btn-ghost" href="curso/">Hacerlo con mi curso</a></div>
</div></section>
<section class="wrap narrow g-tool g-quiz" id="g-quiz" data-tool="diagnostico" data-no-sticky>
  <div class="g-card g-hidden" id="g-class-card">
    <p class="prose" id="g-class-head"></p>
    <label class="g-field">Tu nombre (como te conoce tu docente)<input id="g-class-name" maxlength="60" autocomplete="name" /></label>
  </div>
  <div class="g-progress"><span id="g-prog-t">0 de ${items.length}</span><div class="g-bar"><i id="g-prog" style="width:0%"></i></div></div>
${qHtml(items)}
  <div class="g-row g-noprint"><button type="button" class="btn btn-primary" id="g-finish">Ver mi resultado</button><span class="caption" id="g-left"></span></div>
  <div class="g-card g-hidden" id="g-result" aria-live="polite">
    <h2>Tu resultado</h2>
    <div class="g-big"><b id="g-global">–</b><span id="g-range"></span></div>
    <p class="prose" id="g-summary"></p>
    <ul class="g-bars" id="g-bars"></ul>
    <div class="g-row g-noprint">
      <a class="btn btn-go" id="g-next" href="${up}app/?empezar=1&amp;fuente=diagnostico">Practicar mi prueba más floja <span class="go" aria-hidden="true"></span></a>
      <a class="btn btn-ghost" id="g-share" target="_blank" rel="noopener" data-ev="share:diag">Compartir por WhatsApp</a>
    </div>
    <p class="g-msg ok g-hidden" id="g-class-ok">Listo: tu docente ya puede ver tu resultado.</p>
    <form class="g-card g-noprint" id="g-lead" style="margin-top:22px;box-shadow:none">
      <p class="prose" style="margin-top:0"><b>¿Te lo guardamos?</b> Te enviamos tu resultado y el plan para tu prueba más floja por correo.</p>
      <label class="g-field">Tu correo<input type="email" name="email" required autocomplete="email" /></label>
      <label class="g-check"><input type="checkbox" name="consent" required /> <span>Acepto que Cóndor me escriba sobre mi preparación. Puedo pedir que me borren cuando quiera (<a href="${up}privacidad">privacidad</a>). Si soy menor de edad, tengo permiso de mi familia.</span></label>
      <button class="btn btn-primary" type="submit">Guardar mi resultado</button>
      <p class="g-msg" id="g-lead-msg" role="status"></p>
    </form>
  </div>
  <script type="application/json" id="g-data">${JSON.stringify({ tables: diagTables, perTest: byTest })}</script>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo leer tu resultado</h2>
  <p class="prose">El puntaje global va de 0 a 500. Con datos del ICFES de 2022, la mitad de los estudiantes del país sacó menos de unos 250. Mira qué significa cada rango en <a href="${up}niveles-de-desempeno-icfes/">niveles de desempeño</a>, calcula un puntaje exacto con la <a href="${up}calculadora-puntaje-icfes/">calculadora ICFES</a> o mira <a href="${up}cuantas-preguntas-acertar-icfes/">cuántas preguntas debes acertar</a> para tu meta.</p>
  <p class="prose">Después del diagnóstico, arma tu <a href="${up}plan-de-estudio-icfes/">plan de estudio</a> hasta el examen. Otras herramientas: ${toolLinks(up, path)}.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>`;
    put(path, page({
      siteUrl, path, title: "Diagnóstico ICFES gratis: ¿cuánto sacarías hoy?",
      desc: "Test ICFES de 20 preguntas reales del Saber 11 con tu puntaje global estimado de 0 a 500, tu resultado por prueba y por dónde empezar a estudiar.",
      body: css(up) + body, crumbs: [{ name: "Herramientas", path: "herramientas-icfes/" }, { name: "Diagnóstico", path }], script: "tools.js", katex: true,
      jsonLd: [faqLd(faq), { "@type": "WebApplication", name: "Diagnóstico ICFES", url: siteUrl + path, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: "es-CO", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "COP" } }],
    }));
  }

  // ------------------------------------------------------------------ F17 class diagnostic
  {
    const path = "diagnostico-icfes/curso/";
    const up = "../../";
    const faq = [
      ["¿Necesito crear una cuenta?", "No. Escribes tu nombre y recibes dos enlaces: uno para el curso y uno privado para ver los resultados. Guarda el privado: es tu llave."],
      ["¿Qué ven los estudiantes?", "Las mismas 20 preguntas del diagnóstico, con la respuesta de cada una al marcarla, y su puntaje estimado al final. No ven los resultados de sus compañeros."],
      ["¿Qué veo yo?", "La lista del curso con el resultado de cada estudiante, el promedio por prueba, qué tanto acertó el curso en cada pregunta y la prueba que más le cuesta al grupo."],
      ["¿Y después?", "Si quieres asignar práctica por prueba, simulacros y seguir el avance, crea tu espacio docente en Cóndor y trae a tu curso."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Para docentes</span>
  <h1>Diagnóstico ICFES para tu curso, sin crear cuenta</h1>
  <p class="prose">Crea un enlace, compártelo con tus estudiantes por WhatsApp y mira en una sola página cómo llega tu curso a cada prueba del Saber 11: resultados por estudiante, por prueba y por pregunta.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="curso" data-no-sticky>
  <form class="g-card" id="g-make">
    <h2>Crea el diagnóstico de tu curso</h2>
    <div class="g-grid">
      <label class="g-field">Tu nombre<input name="teacher" required maxlength="80" autocomplete="name" placeholder="Profe Marta Gómez" /></label>
      <label class="g-field">Colegio <small>(opcional)</small><input name="school" maxlength="120" placeholder="IE La Paz" /></label>
      <label class="g-field">Curso <small>(opcional)</small><input name="course" maxlength="40" placeholder="11-2" /></label>
      <label class="g-field">Tu correo <small>(opcional, por si pierdes el enlace)</small><input name="email" type="email" maxlength="200" autocomplete="email" /></label>
    </div>
    <div class="g-row"><button class="btn btn-primary" type="submit">Crear el enlace</button></div>
    <p class="g-msg" id="g-make-msg" role="status"></p>
  </form>
  <div class="g-card g-hidden" id="g-links">
    <h2>Listo: comparte este enlace con tu curso</h2>
    <p class="prose"><b id="g-student-link"></b></p>
    <div class="g-row"><a class="btn btn-go" id="g-wa" target="_blank" rel="noopener" data-ev="share:curso">Enviar por WhatsApp <span class="go" aria-hidden="true"></span></a><button type="button" class="btn btn-ghost" id="g-copy">Copiar enlace</button></div>
    <p class="prose" style="margin-top:22px"><b>Tu enlace privado de resultados</b> (guárdalo, no lo compartas): <a id="g-report-link" href="#"></a></p>
  </div>
  <div class="g-hidden" id="g-report">
    <div class="g-card">
      <h2 id="g-rep-title">Resultados del curso</h2>
      <p class="prose" id="g-rep-sub"></p>
      <div class="g-big"><b id="g-rep-n">0</b><span>estudiantes respondieron</span></div>
      <ul class="g-bars" id="g-rep-bars"></ul>
      <div class="g-row g-noprint"><button type="button" class="btn btn-ghost" onclick="window.print()">Imprimir</button><a class="btn btn-go" href="${up}app/#docente" data-ev="curso:upgrade">Crear mi espacio docente <span class="go" aria-hidden="true"></span></a></div>
    </div>
    <div class="g-card"><h2>Por estudiante</h2><div class="tbl"><table><thead><tr><th>Estudiante</th><th>Aciertos</th><th>Puntaje estimado</th><th>Prueba más floja</th></tr></thead><tbody id="g-rep-rows"></tbody></table></div></div>
    <div class="g-card"><h2>Por pregunta</h2><p class="prose">Qué parte del curso acertó cada pregunta. Las más bajas son las primeras para repasar en clase.</p><ul class="g-bars" id="g-rep-q"></ul></div>
  </div>
  <script type="application/json" id="g-data">${JSON.stringify({ tables: diagTables })}</script>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo funciona</h2>
  <ol class="g-steps"><li>Escribes tu nombre y el curso, y recibes el enlace.</li><li>Lo envías al grupo de WhatsApp del curso o lo proyectas con el código QR.</li><li>Cada estudiante responde las 20 preguntas desde su celular, en unos 25 minutos.</li><li>Abres tu enlace privado y ves el resultado del curso, por prueba y por pregunta.</li></ol>
  <p class="prose">Las preguntas son las del <a href="../">diagnóstico ICFES</a>, tomadas de cuadernillos publicados por el ICFES. Para el examen completo con tiempo, usa el <a href="${up}simulacro-icfes/">simulacro ICFES</a>; para el trabajo de todo el año, mira <a href="${up}preicfes-para-colegios/">Cóndor para colegios</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>`;
    put(path, page({
      siteUrl, path, title: "Diagnóstico ICFES para tu curso, gratis y sin cuenta",
      desc: "Para docentes: crea un diagnóstico ICFES de 20 preguntas reales para tu curso, compártelo por WhatsApp y mira los resultados por estudiante, prueba y pregunta.",
      body: css(up) + body, crumbs: [{ name: "Diagnóstico ICFES", path: "diagnostico-icfes/" }, { name: "Para tu curso", path }], script: "tools.js",
      jsonLd: [faqLd(faq), { "@type": "WebApplication", name: "Diagnóstico ICFES para tu curso", url: siteUrl + path, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: "es-CO", isAccessibleForFree: true, audience: { "@type": "EducationalAudience", educationalRole: "teacher" }, offers: { "@type": "Offer", price: "0", priceCurrency: "COP" } }],
    }));
  }

  // ------------------------------------------------------------------ F18 inverse calculator
  {
    const path = "cuantas-preguntas-acertar-icfes/";
    const up = "../";
    const rows = [250, 300, 350, 400].map((g) => `<tr><td><b>${g}</b></td>${TEST_IDS.map((id) => {
      const k = realTables[id].findIndex((r) => r[0] >= g / 5);
      return `<td>${k < 0 ? "–" : `${k} de ${REAL_COUNTS[id]}`}</td>`;
    }).join("")}</tr>`).join("");
    const faq = [
      ["¿Cuántas preguntas tengo que acertar para sacar 300 en el ICFES?", `Con el modelo de Cóndor, alrededor de ${TEST_IDS.map((id) => `${realTables[id].findIndex((r) => r[0] >= 60)} de ${REAL_COUNTS[id]} en ${TEST_NAMES[id]}`).join(", ")}, si te va parejo en todas. Mira la tabla para otros puntajes.`],
      ["¿Todas las preguntas valen lo mismo?", "No exactamente. El ICFES usa un modelo que tiene en cuenta la dificultad de cada pregunta, así que dos estudiantes con el mismo número de aciertos pueden tener puntajes un poco distintos. Esta calculadora da un estimado."],
      ["¿Por qué Inglés pesa menos?", "En el global, Lectura crítica, Matemáticas, Sociales y Ciencias pesan 3 cada una e Inglés pesa 1. Una pregunta más en Matemáticas mueve el global más que una en Inglés."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Calculadora</span>
  <h1>¿Cuántas preguntas debo acertar en el ICFES?</h1>
  <p class="prose">Escoge el puntaje global que quieres y te decimos cuántas respuestas correctas necesitas en cada prueba, sobre el número real de preguntas del Saber 11.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="inversa">
  <form class="g-card" id="g-inv" onsubmit="return false">
    <label class="g-field">Puntaje global meta: <b id="g-inv-v">300</b><input type="range" id="g-inv-g" min="150" max="480" step="5" value="300" style="padding:0;border:0;background:transparent" /></label>
    <ul class="g-bars" id="g-inv-bars" aria-live="polite"></ul>
    <p class="caption" style="margin-top:14px">Supone el mismo puntaje en cada prueba. ¿Tu carrera pondera distinto? Mira el <a href="${up}puntaje-icfes/">puntaje por universidad</a>.</p>
  </form>
  <script type="application/json" id="g-data">${JSON.stringify({ tables: realTables })}</script>
</section>
<section class="wrap narrow guide-body">
  <h2>Tabla rápida</h2>
  <p class="prose">Respuestas correctas para cada puntaje global, si te va igual en todas las pruebas:</p>
  <div class="tbl"><table><thead><tr><th>Global</th>${TEST_IDS.map((id) => `<th>${esc(TEST_NAMES[id])}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
  <p class="source">Estimado con el modelo de puntaje de Cóndor (teoría de respuesta al ítem, ajustado a la distribución nacional de 2022 de los datos abiertos del ICFES) y el número de preguntas de la guía de orientación Saber 11 2026. Revisado el ${CHECKED}.</p>
  <p class="prose">Para ver dónde estás hoy, haz el <a href="${up}diagnostico-icfes/">diagnóstico ICFES</a>; con tu puntaje por prueba, la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje</a> te da el global y tu percentil. Otras herramientas: ${toolLinks(up, path)}.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, "Empieza a sumar respuestas correctas")}`;
    put(path, page({
      siteUrl, path, title: "¿Cuántas preguntas debo acertar en el ICFES?",
      desc: "Calcula cuántas preguntas debes acertar en cada prueba del ICFES Saber 11 para sacar 250, 300, 350 o 400 de puntaje global. Gratis y al instante.",
      body: css(up) + body, crumbs: [{ name: "Herramientas", path: "herramientas-icfes/" }, { name: "Cuántas preguntas acertar", path }], script: "tools.js",
      jsonLd: [faqLd(faq), { "@type": "WebApplication", name: "Calculadora de preguntas a acertar en el ICFES", url: siteUrl + path, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: "es-CO", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "COP" } }],
    }));
  }

  // ------------------------------------------------------------------ F19 study plan
  {
    const path = "plan-de-estudio-icfes/";
    const up = "../";
    const faq = [
      ["¿Cuánto tiempo antes debo empezar a estudiar para el ICFES?", "Lo ideal es 3 a 6 meses, con sesiones cortas y frecuentes. Si te queda menos, el plan se concentra en simulacros y en tus pruebas más flojas."],
      ["¿Cuántas horas al día debo estudiar?", "Con 30 a 60 minutos, 4 o 5 días a la semana, se nota la diferencia si practicas con preguntas reales y repasas cada error."],
      ["¿Puedo llevar el plan a mi calendario?", "Sí. El botón «Agregar a mi calendario» descarga un archivo que Google Calendar, el calendario del iPhone y Outlook abren con recordatorios en los días y la hora que escojas."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Plan</span>
  <h1>Plan de estudio para el ICFES, semana a semana</h1>
  <p class="prose">Dinos cuándo es tu examen, cuánto tiempo tienes y qué pruebas te cuestan más. Te armamos un plan semana a semana hasta el Saber 11, para imprimir o para llevar a tu calendario con recordatorios.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="plan">
  <form class="g-card" id="g-plan" onsubmit="return false">
    <div class="g-grid">
      <label class="g-field">Fecha de tu examen<input type="date" name="exam" required value="${EXAM_2027.B}" /></label>
      <label class="g-field">Días de estudio por semana<select name="days">${[2, 3, 4, 5, 6].map((d) => `<option ${d === 4 ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label class="g-field">Minutos por día<select name="minutes">${[20, 30, 45, 60, 90].map((m) => `<option ${m === 45 ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="g-field">Hora del recordatorio<input type="time" name="time" value="18:30" /></label>
    </div>
    <p class="g-field" style="margin-top:14px">¿Qué pruebas te cuestan más?</p>
    <div class="g-row" style="margin-top:4px">${TEST_IDS.map((id) => `<label class="g-check" style="margin:0"><input type="checkbox" name="weak" value="${id}" ${id === "ma" ? "checked" : ""} /> ${esc(TEST_NAMES[id])}</label>`).join("")}</div>
    <div class="g-row g-noprint"><button type="button" class="btn btn-primary" id="g-plan-go">Armar mi plan</button><button type="button" class="btn btn-ghost" id="g-plan-ics">Agregar a mi calendario</button><button type="button" class="btn btn-ghost" onclick="window.print()">Imprimir</button></div>
  </form>
  <div id="g-plan-out" aria-live="polite"></div>
  <form class="g-card g-noprint g-hidden" id="g-lead">
    <p class="prose" style="margin-top:0"><b>¿Te lo mandamos?</b> Recibe el plan en tu correo para tenerlo a mano.</p>
    <label class="g-field">Tu correo<input type="email" name="email" required autocomplete="email" /></label>
    <label class="g-check"><input type="checkbox" name="consent" required /> <span>Acepto que Cóndor me escriba sobre mi preparación. Puedo pedir que me borren cuando quiera (<a href="${up}privacidad">privacidad</a>). Si soy menor de edad, tengo permiso de mi familia.</span></label>
    <button class="btn btn-primary" type="submit">Enviarme el plan</button>
    <p class="g-msg" id="g-lead-msg" role="status"></p>
  </form>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo está hecho el plan</h2>
  <p class="prose">Tiene tres fases, como el plan de la app: <b>bases</b> (más de 12 semanas antes: por prueba, sin reloj, entendiendo cada error), <b>ritmo de examen</b> (de 12 a 4 semanas: con tiempo y un simulacro cada dos semanas) y <b>recta final</b> (las últimas 4: simulacros completos y repaso de errores). Tus pruebas más flojas salen el doble de veces.</p>
  <p class="prose">Para saber cuáles son tus pruebas más flojas, haz el <a href="${up}diagnostico-icfes/">diagnóstico ICFES</a>. Para el detalle de cada semana, lee la guía <a href="${up}como-prepararse-para-el-icfes/">cómo prepararse para el ICFES</a>. Otras herramientas: ${toolLinks(up, path)}.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, "Empieza la semana 1 hoy")}`;
    put(path, page({
      siteUrl, path, title: "Plan de estudio ICFES: semana a semana, gratis",
      desc: "Arma tu plan de estudio para el ICFES Saber 11 hasta la fecha de tu examen, según tus pruebas más flojas. Para imprimir o llevar a tu calendario.",
      body: css(up) + body, crumbs: [{ name: "Herramientas", path: "herramientas-icfes/" }, { name: "Plan de estudio", path }], script: "tools.js",
      jsonLd: [faqLd(faq), { "@type": "WebApplication", name: "Plan de estudio ICFES", url: siteUrl + path, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: "es-CO", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "COP" } }],
    }));
  }

  // ------------------------------------------------------------------ F20 countdown + calendar subscription
  {
    const path = "cuanto-falta-para-el-icfes/";
    const up = "../";
    const est = EXAM_2027.official ? "según el ICFES" : "estimada con base en 2026, hasta que el ICFES publique el calendario 2027";
    const d = (iso) => parseLocal(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    const events = [
      { uid: "saber11-b-2027", date: EXAM_2027.B, title: `Examen Saber 11 calendario B 2027${EXAM_2027.official ? "" : " (fecha estimada)"}`, description: "Revisa la fecha oficial y tu citación en icfes.gov.co.", url: `${siteUrl}cuanto-falta-para-el-icfes/` },
      { uid: "saber11-a-2027", date: EXAM_2027.A, title: `Examen Saber 11 calendario A 2027${EXAM_2027.official ? "" : " (fecha estimada)"}`, description: "Revisa la fecha oficial y tu citación en icfes.gov.co.", url: `${siteUrl}cuanto-falta-para-el-icfes/` },
      { uid: "nacional-2026-12", start: `${NACIONAL.date}T${NACIONAL.s1}`, minutes: 270, title: "Simulacro nacional Cóndor: sesión 1", description: `Examen real completo (${NACIONAL.examName}).`, url: `${siteUrl}simulacro-nacional/`, alarm: 30 },
    ];
    mkdirSync(join(out, "calendario"), { recursive: true });
    writeFileSync(join(out, "calendario", "fechas-icfes.ics"), icsCalendar("Fechas ICFES · Cóndor", events));
    const faq = [
      ["¿Cuánto falta para el ICFES 2027?", `Para calendario B, el examen sería el ${d(EXAM_2027.B)} y para calendario A el ${d(EXAM_2027.A)} (${est}). La cuenta regresiva de arriba se actualiza sola.`],
      ["¿Cómo agrego las fechas a mi calendario?", "Toca «Agregar a mi calendario»: el archivo abre en Google Calendar, el calendario del iPhone u Outlook. Si te suscribes al enlace, las fechas se actualizan cuando el ICFES publique cambios."],
      ["¿Dónde veo la fecha oficial?", "En icfes.gov.co y en tu citación, que se publica unas dos semanas antes del examen."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Cuenta regresiva</span>
  <h1>¿Cuánto falta para el ICFES?</h1>
  <p class="prose">La cuenta regresiva al Saber 11 de 2027, para calendario B y calendario A, y las fechas listas para tu calendario. Fecha ${esc(est)}.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="cuenta">
  <div class="g-card">
    <div class="g-row" style="margin:0 0 16px" role="tablist">
      <button type="button" class="btn btn-primary btn-sm" data-cal="B" aria-pressed="true">Calendario B · ${esc(d(EXAM_2027.B))}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cal="A" aria-pressed="false">Calendario A · ${esc(d(EXAM_2027.A))}</button>
      <button type="button" class="btn btn-ghost btn-sm g-hidden" data-cal="mine" aria-pressed="false">Mi fecha</button>
    </div>
    <div class="g-count" aria-live="polite"><div><b id="g-d">–</b><span>días</span></div><div><b id="g-h">–</b><span>horas</span></div><div><b id="g-m">–</b><span>minutos</span></div><div><b id="g-s">–</b><span>segundos</span></div></div>
    <p class="prose" id="g-count-note" style="margin-bottom:0"></p>
    <div class="g-row"><a class="btn btn-go" href="${up}calendario/fechas-icfes.ics" data-ev="ics:fechas" download>Agregar a mi calendario <span class="go" aria-hidden="true"></span></a><a class="btn btn-ghost" id="g-gcal" target="_blank" rel="noopener" data-ev="ics:google">Google Calendar</a></div>
  </div>
  <script type="application/json" id="g-data">${JSON.stringify({ B: EXAM_2027.B, A: EXAM_2027.A, start: "07:00" })}</script>
</section>
<section class="wrap narrow guide-body">
  <h2>Qué hacer con el tiempo que queda</h2>
  <ul class="checks"><li><b>Más de 3 meses:</b> practica por prueba, sin reloj, y entiende cada error.</li><li><b>De 1 a 3 meses:</b> preguntas con tiempo y un simulacro cada dos semanas.</li><li><b>El último mes:</b> simulacros completos, repaso de errores y descanso antes del día.</li></ul>
  <p class="prose">Arma tu <a href="${up}plan-de-estudio-icfes/">plan de estudio semana a semana</a> con la fecha de tu examen, o mira el calendario completo (inscripción, citación y resultados) en <a href="${up}fechas-icfes-2027/">fechas ICFES 2027</a>. Otras herramientas: ${toolLinks(up, path)}.</p>
  <p class="source">Fechas de 2026 como referencia: calendario B el ${d(CAL_2026.B.exam)} y calendario A el ${d(CAL_2026.A.exam)}, según el ICFES. Revisado el ${CHECKED}.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, "Usa los días que faltan")}`;
    put(path, page({
      siteUrl, path, title: "¿Cuánto falta para el ICFES 2027? Cuenta regresiva",
      desc: "Cuenta regresiva al ICFES Saber 11 2027 para calendario B y A, con las fechas listas para tu calendario y qué estudiar según el tiempo que queda.",
      body: css(up) + body, crumbs: [{ name: "Herramientas", path: "herramientas-icfes/" }, { name: "Cuenta regresiva", path }], script: "tools.js",
      jsonLd: [faqLd(faq), { "@type": "WebPage", name: "Cuenta regresiva ICFES", url: siteUrl + path, inLanguage: "es-CO" }],
    }));
  }

  // ------------------------------------------------------------------ F21 formula sheets
  {
    const hubPath = "formulas-icfes/";
    const sheet = (f) => `<div class="g-formula">${f.blocks.map(([h, rows]) => `<section><h3>${esc(h)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>`).join("")}</div>`;
    for (const [slug, f] of Object.entries(FORMULAS)) {
      const path = `${hubPath}${slug}/`;
      const up = "../../";
      const others = Object.entries(FORMULAS).filter(([s]) => s !== slug).map(([s, o]) => `<a href="../${s}/">fórmulas de ${esc(o.name.toLowerCase())}</a>`).join(" y ");
      const areaSlug = slug === "matematicas" ? "matematicas" : "ciencias-naturales";
      const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${f.color}">${esc(f.name)}</span>
  <h1>${esc(f.title)}</h1>
  <p class="prose">${esc(f.intro)}</p>
  <div class="cta-row g-noprint"><button type="button" class="btn btn-primary" onclick="window.print()" data-ev="formulas:print">Imprimir la hoja</button><a class="btn btn-ghost" href="${up}preguntas-icfes/${areaSlug}/">Practicar con preguntas</a></div>
</div></section>
<section class="wrap narrow g-tool">
  ${sheet(f)}
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo usar esta hoja</h2>
  <p class="prose">El día del examen no puedes llevarla: úsala para practicar. Resuelve preguntas reales, y cuando no sepas qué fórmula usar, búscala aquí y anota en qué tipo de pregunta apareció. Así la recuerdas por el problema, no de memoria.</p>
  <p class="prose">Sigue con las ${others}, o practica con <a href="${up}preguntas-icfes/${areaSlug}/">preguntas ICFES de ${slug === "matematicas" ? "Matemáticas" : "Ciencias naturales"}</a>. Otras herramientas: ${toolLinks(up, hubPath)}.</p>
</section>
${cta(up, `Practica ${slug === "matematicas" ? "Matemáticas" : "Ciencias"} con preguntas reales`)}`;
      put(path, page({
        siteUrl, path, title: f.title, desc: f.desc, body: css(up) + body,
        crumbs: [{ name: "Fórmulas ICFES", path: hubPath }, { name: f.name, path }],
        jsonLd: [{ "@type": "LearningResource", name: f.title, description: f.desc, url: siteUrl + path, inLanguage: "es-CO", educationalLevel: "Grado 11", learningResourceType: "Cheat sheet", isAccessibleForFree: true, publisher: { "@type": "Organization", name: "Cóndor", url: siteUrl } }],
      }));
    }
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Fórmulas</span>
  <h1>Fórmulas para el ICFES: hojas para imprimir</h1>
  <p class="prose">Las fórmulas que más aparecen en Matemáticas y en Ciencias naturales del Saber 11, en una hoja por materia para imprimir y practicar.</p>
</div></section>
<section class="wrap narrow g-tool">
  <div class="areas">${Object.entries(FORMULAS).map(([s, f]) => `<a class="area" href="${s}/" style="--c:${f.color}"><span class="dot"></span><b>${esc(f.name)}</b><span>${f.blocks.length} temas</span></a>`).join("")}</div>
</section>
<section class="wrap narrow guide-body">
  <h2>¿El ICFES da fórmulas?</h2>
  <p class="prose">No. En el Saber 11 no hay hoja de fórmulas ni calculadora, pero las preguntas están pensadas para resolverse con relaciones básicas y buen razonamiento. Por eso conviene practicarlas con <a href="${up}preguntas-icfes/matematicas/">preguntas de matemáticas</a> y <a href="${up}preguntas-icfes/ciencias-naturales/">de ciencias</a>, no solo memorizarlas.</p>
  <p class="prose">Otras herramientas: ${toolLinks(up, hubPath)}.</p>
</section>
${cta(up, "Practica con preguntas reales")}`;
    put(hubPath, page({
      siteUrl, path: hubPath, title: "Fórmulas para el ICFES: matemáticas, física, química",
      desc: "Hojas de fórmulas para el ICFES Saber 11 para imprimir: matemáticas, física y química, con las relaciones que más aparecen en el examen.",
      body: css(up) + body, crumbs: [{ name: "Fórmulas ICFES", path: hubPath }],
      jsonLd: [{ "@type": "CollectionPage", name: "Fórmulas para el ICFES", url: siteUrl + hubPath, inLanguage: "es-CO", hasPart: Object.entries(FORMULAS).map(([s, f]) => ({ "@type": "LearningResource", name: f.title, url: `${siteUrl}${hubPath}${s}/` })) }],
    }));
  }

  // ------------------------------------------------------------------ F12 challenges (hub indexed, packs noindex)
  {
    const packs = [];
    for (let n = 0; n < 10; n++) {
      const id = TEST_IDS[n % 5];
      const items = pick(TEST_NAMES[id], 5, Math.floor(n / 5) * 5);
      if (items.length < 3) continue;
      packs.push({ n: packs.length + 1, id, items });
    }
    for (const p of packs) {
      const path = `reto-icfes/${p.n}/`;
      const up = "../../";
      const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Reto ${p.n} · ${esc(TEST_NAMES[p.id])}</span>
  <h1>Reto ICFES ${p.n}: ${p.items.length} preguntas de ${esc(TEST_NAMES[p.id])}</h1>
  <p class="prose" id="g-reto-intro">${p.items.length} preguntas reales del Saber 11. Respóndelas y reta a un amigo con el mismo reto.</p>
</div></section>
<section class="wrap narrow g-tool g-quiz" data-tool="reto" data-pack="${p.n}" data-test="${p.id}" data-no-sticky>
${qHtml(p.items)}
  <div class="g-card g-hidden" id="g-reto-end" aria-live="polite">
    <div class="g-big"><b id="g-reto-score">–</b><span id="g-reto-sub"></span></div>
    <label class="g-field" style="margin-top:12px">Tu nombre, para el mensaje <small>(opcional)</small><input id="g-reto-name" maxlength="20" autocomplete="given-name" /></label>
    <div class="g-row"><a class="btn btn-go" id="g-reto-wa" target="_blank" rel="noopener" data-ev="share:reto">Retar a un amigo por WhatsApp <span class="go" aria-hidden="true"></span></a>${p.n < packs.length ? `<a class="btn btn-ghost" href="../${p.n + 1}/">Siguiente reto</a>` : ""}</div>
    <p class="prose">¿Quieres más de ${esc(TEST_NAMES[p.id])}? <a href="${up}app/?empezar=1&amp;area=${({ lc: "lectura-critica", ma: "matematicas", sc: "sociales-y-ciudadanas", cn: "ciencias-naturales", in: "ingles" })[p.id]}&amp;fuente=reto">Practica en la app</a>, con tu progreso guardado.</p>
  </div>
</section>`;
      putRaw(path, page({ siteUrl, path, title: `Reto ICFES ${p.n}: ${TEST_NAMES[p.id]}`, desc: `Cinco preguntas reales de ${TEST_NAMES[p.id]} del Saber 11 para resolver y retar a un amigo.`, body: css(up) + body, crumbs: [{ name: "Reto ICFES", path: "reto-icfes/" }, { name: `Reto ${p.n}`, path }], script: "tools.js", katex: true, jsonLd: [{ "@type": "WebPage", name: `Reto ICFES ${p.n}`, url: siteUrl + path }] }));
    }
    const path = "reto-icfes/";
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Retos</span>
  <h1>Reto ICFES: 5 preguntas para retar a un amigo</h1>
  <p class="prose">Escoge un reto de cinco preguntas reales del Saber 11, respóndelo y mándaselo a un amigo por WhatsApp. Es la forma más rápida de estudiar con alguien más.</p>
</div></section>
<section class="wrap narrow g-tool">
  <div class="areas">${packs.map((p) => `<a class="area" href="${p.n}/" style="--c:${areaOf[TEST_NAMES[p.id]]?.color ?? "#C8F04A"}"><span class="dot"></span><b>Reto ${p.n}</b><span>${esc(TEST_NAMES[p.id])} · ${p.items.length} preguntas</span></a>`).join("")}</div>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo funciona</h2>
  <ol class="g-steps"><li>Responde las cinco preguntas: cada una te dice si acertaste.</li><li>Escribe tu nombre y toca «Retar a un amigo».</li><li>Tu amigo recibe el mismo reto y estudian juntos las que les costaron.</li></ol>
  <p class="prose">¿Prefieres medirte con el examen completo? Haz el <a href="${up}diagnostico-icfes/">diagnóstico ICFES</a> o un <a href="${up}simulacro-icfes/">simulacro</a>. Otras herramientas: ${toolLinks(up, path)}.</p>
</section>
${cta(up, "Practica con más preguntas")}`;
    put(path, page({
      siteUrl, path, title: "Reto ICFES: 5 preguntas para retar a un amigo",
      desc: "Retos de cinco preguntas reales del ICFES Saber 11 por prueba para resolver y mandar a un amigo por WhatsApp. Estudia acompañado, gratis.",
      body: css(up) + body, crumbs: [{ name: "Herramientas", path: "herramientas-icfes/" }, { name: "Reto ICFES", path }],
      jsonLd: [{ "@type": "CollectionPage", name: "Reto ICFES", url: siteUrl + path, inLanguage: "es-CO" }],
    }));
  }

  // ------------------------------------------------------------------ F10 partners
  {
    const path = "aliados/";
    const up = "../";
    const faq = [
      ["¿Quién puede ser aliado?", "Profes particulares, academias y preicfes, creadores de contenido educativo, fundaciones y bibliotecas que acompañan a estudiantes de grado 10 y 11."],
      ["¿Qué recibo?", "Un código y un enlace propios, un panel con cuántos estudiantes llegaron con tu código y cuánto practican, y carteles con tu código QR para imprimir."],
      ["¿Mis estudiantes pagan algo?", "Practicar con las preguntas del ICFES en Cóndor no cuesta hoy. Si más adelante hay planes de pago, te avisamos antes."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Aliados</span>
  <h1>Programa de aliados de Cóndor</h1>
  <p class="prose">¿Das clases particulares, tienes una academia o un canal para estudiantes? Lleva a tus estudiantes a practicar con preguntas reales del ICFES y mira cuánto avanzan con tu propio panel.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="aliados" data-no-sticky>
  <div class="g-card">
    <h2>Lo que tienes como aliado</h2>
    <ul class="checks"><li><b>Tu código y tu enlace</b> (condoricfes.com/?ref=tu-codigo) para tu grupo, tus redes o tu clase.</li><li><b>Tu panel</b> en la app: cuántos estudiantes llegaron con tu código, cuántos practican y cuánto.</li><li><b>Carteles con tu QR</b> listos para imprimir y pegar en tu salón.</li><li><b>Herramientas para clase</b>: el <a href="${up}diagnostico-icfes/curso/">diagnóstico de curso</a> y los <a href="${up}reto-icfes/">retos</a> para mandar al grupo.</li></ul>
  </div>
  <form class="g-card" id="g-partner">
    <h2>Quiero ser aliado</h2>
    <div class="g-grid">
      <label class="g-field">Nombre o nombre de tu academia<input name="name" required maxlength="120" /></label>
      <label class="g-field">Eres<select name="kind"><option value="profe">Profe particular</option><option value="academia">Academia o preicfes</option><option value="creador">Creador de contenido</option><option value="fundacion">Fundación o biblioteca</option><option value="otro">Otro</option></select></label>
      <label class="g-field">Correo<input name="email" type="email" required maxlength="200" autocomplete="email" /></label>
      <label class="g-field">Ciudad<input name="city" maxlength="80" /></label>
      <label class="g-field">¿Con cuántos estudiantes trabajas?<input name="audience" type="number" min="0" inputmode="numeric" /></label>
    </div>
    <label class="g-field" style="margin-top:12px">Cuéntanos cómo los acompañas <small>(opcional)</small><textarea name="message" rows="3" maxlength="1000"></textarea></label>
    <div class="g-row"><button class="btn btn-primary" type="submit">Enviar solicitud</button></div>
    <p class="g-msg" id="g-partner-msg" role="status"></p>
  </form>
</section>
<section class="wrap narrow guide-body">
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
  <p class="prose">¿Eres docente de un colegio? Mira <a href="${up}preicfes-para-colegios/">Cóndor para colegios</a> o arma la <a href="${up}propuesta-colegios/">propuesta para tu colegio</a>. Otras herramientas: ${toolLinks(up, path)}.</p>
</section>`;
    put(path, page({
      siteUrl, path, title: "Programa de aliados: profes y academias ICFES",
      desc: "Para profes particulares, academias preicfes y creadores: tu código, un panel con el avance de tus estudiantes y carteles con QR para practicar el ICFES.",
      body: css(up) + body, crumbs: [{ name: "Aliados", path }], script: "tools.js",
      jsonLd: [faqLd(faq), { "@type": "WebPage", name: "Programa de aliados de Cóndor", url: siteUrl + path, inLanguage: "es-CO" }],
    }));
  }

  // ------------------------------------------------------------------ F47 school proposal
  {
    const path = "propuesta-colegios/";
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Colegios</span>
  <h1>Propuesta de Cóndor para tu colegio</h1>
  <p class="prose">Escribe los datos de tu colegio y te armamos una propuesta de una página para llevar a rectoría o al consejo académico: qué incluye, cómo se implementa en cuatro semanas y qué resultados vas a poder mostrar.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="propuesta" data-no-sticky>
  <form class="g-card g-noprint" id="g-prop">
    <div class="g-grid">
      <label class="g-field">Colegio<input name="school" required maxlength="120" /></label>
      <label class="g-field">Ciudad<input name="city" maxlength="80" /></label>
      <label class="g-field">Estudiantes de grado 11<input name="g11" type="number" min="1" max="2000" inputmode="numeric" required value="60" /></label>
      <label class="g-field">Estudiantes de grado 10<input name="g10" type="number" min="0" max="2000" inputmode="numeric" value="60" /></label>
      <label class="g-field">Calendario<select name="cal"><option value="A">A</option><option value="B">B</option></select></label>
      <label class="g-field">Tu nombre<input name="name" required maxlength="80" autocomplete="name" /></label>
      <label class="g-field">Tu cargo<select name="role"><option value="coordinador">Coordinación académica</option><option value="docente">Docente</option><option value="otro">Rectoría u otro</option></select></label>
      <label class="g-field">Correo<input name="email" type="email" required maxlength="200" autocomplete="email" /></label>
    </div>
    <label class="g-check"><input type="checkbox" name="consent" required /> <span>Acepto que Cóndor me contacte sobre esta propuesta (<a href="${up}privacidad">privacidad</a>).</span></label>
    <div class="g-row"><button class="btn btn-primary" type="submit">Armar la propuesta</button></div>
    <p class="g-msg" id="g-prop-msg" role="status"></p>
  </form>
  <article class="g-card g-hidden" id="g-prop-doc"></article>
</section>
<section class="wrap narrow guide-body">
  <h2>Qué incluye la propuesta</h2>
  <ul class="checks"><li>Diagnóstico inicial de grado 11 con el <a href="${up}diagnostico-icfes/curso/">diagnóstico de curso</a>.</li><li>Práctica por prueba, simulacros con tiempo y en papel, y seguimiento por estudiante.</li><li>Un plan de cuatro semanas para arrancar, con lo que hace cada docente.</li><li>Los resultados que vas a poder mostrar a rectoría y a las familias.</li></ul>
  <p class="prose">Más detalle en <a href="${up}preicfes-para-colegios/">Cóndor para colegios</a> y la <a href="${up}prueba-docente/">prueba para docentes</a>. Otras herramientas: ${toolLinks(up, path)}.</p>
</section>`;
    put(path, page({
      siteUrl, path, title: "Propuesta preicfes para tu colegio en 2 minutos",
      desc: "Arma una propuesta de una página para llevar Cóndor a tu colegio: diagnóstico, práctica, simulacros, plan de cuatro semanas y resultados para rectoría.",
      body: css(up) + body, crumbs: [{ name: "Para colegios", path: "preicfes-para-colegios/" }, { name: "Propuesta", path }], script: "tools.js",
      jsonLd: [{ "@type": "WebPage", name: "Propuesta de Cóndor para colegios", url: siteUrl + path, inLanguage: "es-CO", audience: { "@type": "EducationalAudience", educationalRole: "administrator" } }],
    }));
  }

  // ------------------------------------------------------------------ F30 national mock day
  {
    const path = "simulacro-nacional/";
    const up = "../";
    const day = parseLocal(NACIONAL.date).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const ev = [
      { uid: `${NACIONAL.key}-s1`, start: `${NACIONAL.date}T${NACIONAL.s1}`, minutes: 270, title: "Simulacro nacional Cóndor · Sesión 1", description: `Examen real completo, sesión 1 (${NACIONAL.examName}).`, url: `${siteUrl}simulacro-nacional/`, alarm: 30 },
      { uid: `${NACIONAL.key}-s2`, start: `${NACIONAL.date}T${NACIONAL.s2}`, minutes: 270, title: "Simulacro nacional Cóndor · Sesión 2", description: `Examen real completo, sesión 2 (${NACIONAL.examName}).`, url: `${siteUrl}simulacro-nacional/`, alarm: 30 },
    ];
    writeFileSync(join(out, "calendario", "simulacro-nacional.ics"), icsCalendar("Simulacro nacional Cóndor", ev));
    const faq = [
      ["¿Cuándo es el simulacro nacional?", `El ${day}: sesión 1 a las 8:00 a. m. y sesión 2 a las 2:00 p. m., hora de Colombia.`],
      ["¿Qué examen se presenta?", `Un examen real completo publicado por el ICFES (${NACIONAL.examName}), con las dos sesiones y el tiempo del examen.`],
      ["¿Cuánto cuesta?", "Nada. Necesitas entrar con tu cuenta de Google para guardar tus respuestas y ver tu puntaje."],
      ["¿Hay un ranking?", "No. En Cóndor no hay rankings: ves tu puntaje estimado, tu nivel por prueba y tu percentil frente al país con datos del ICFES."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Evento</span>
  <h1>Simulacro nacional Cóndor</h1>
  <p class="prose">El ${esc(day)}, estudiantes de todo el país presentan a la misma hora un examen ICFES real completo, con las dos sesiones y el tiempo del examen. Al terminar ves tu puntaje estimado de 0 a 500 y qué repasar.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="nacional" data-no-sticky>
  <div class="g-card">
    <div class="g-count" aria-live="polite"><div><b id="g-d">–</b><span>días</span></div><div><b id="g-h">–</b><span>horas</span></div><div><b id="g-m">–</b><span>minutos</span></div><div><b id="g-s">–</b><span>segundos</span></div></div>
    <p class="prose" id="g-nac-count" style="margin-bottom:0"></p>
    <div class="g-row g-hidden" id="g-nac-live">
      <a class="btn btn-go" href="${up}app/?empezar=1&amp;cuadernillo=${NACIONAL.exam1}&amp;fuente=nacional">Presentar la sesión 1 <span class="go" aria-hidden="true"></span></a>
      <a class="btn btn-ghost" href="${up}app/?empezar=1&amp;cuadernillo=${NACIONAL.exam2}&amp;fuente=nacional">Sesión 2</a>
    </div>
  </div>
  <form class="g-card" id="g-nac">
    <h2>Inscríbete</h2>
    <div class="g-grid">
      <label class="g-field">Estás en<select name="grade"><option value="11">Grado 11</option><option value="10">Grado 10</option><option value="egresado">Ya me gradué</option><option value="docente">Soy docente</option></select></label>
      <label class="g-field">Correo para el recordatorio <small>(opcional)</small><input name="email" type="email" maxlength="200" autocomplete="email" /></label>
    </div>
    <div class="g-row"><button class="btn btn-primary" type="submit">Inscribirme</button><a class="btn btn-ghost" href="${up}calendario/simulacro-nacional.ics" download data-ev="ics:nacional">Agregar a mi calendario</a></div>
    <p class="g-msg" id="g-nac-msg" role="status"></p>
  </form>
  <script type="application/json" id="g-data">${JSON.stringify(NACIONAL)}</script>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo es el día</h2>
  <ol class="g-steps"><li>8:00 a. m.: sesión 1 (Matemáticas, Lectura crítica, Sociales y Ciencias), 4 horas y 30 minutos.</li><li>Almuerzo y descanso.</li><li>2:00 p. m.: sesión 2 (Matemáticas, Sociales, Ciencias e Inglés).</li><li>Al terminar: tu puntaje estimado, tu nivel por prueba y las preguntas para repasar.</li></ol>
  <p class="prose">Para llegar listo, haz antes el <a href="${up}diagnostico-icfes/">diagnóstico ICFES</a> y mira <a href="${up}estructura-examen-icfes/">cómo es el examen</a>. Si eres docente, inscribe a tu curso y úsalo como simulacro del colegio. Otras herramientas: ${toolLinks(up, path)}.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>`;
    put(path, page({
      siteUrl, path, title: "Simulacro nacional ICFES gratis: diciembre 2026",
      desc: `Simulacro ICFES nacional gratis el ${day}: examen real completo, dos sesiones con tiempo y tu puntaje estimado de 0 a 500 al terminar.`,
      body: css(up) + body, crumbs: [{ name: "Simulacro ICFES", path: "simulacro-icfes/" }, { name: "Simulacro nacional", path }], script: "tools.js",
      jsonLd: [faqLd(faq), {
        "@type": "Event", name: "Simulacro nacional Cóndor", startDate: `${NACIONAL.date}T${NACIONAL.s1}:00-05:00`, endDate: `${NACIONAL.date}T18:30:00-05:00`,
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
        location: { "@type": "VirtualLocation", url: siteUrl + path }, organizer: { "@type": "Organization", name: "Cóndor", url: siteUrl },
        isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "COP", availability: "https://schema.org/InStock", url: siteUrl + path, validFrom: "2026-11-13" },
        description: "Examen ICFES real completo, a la misma hora en todo el país, con puntaje estimado al terminar.", image: `${siteUrl}img/og.png`,
      }],
    }));
  }

  // ------------------------------------------------------------------ F46 roadmap with votes
  {
    const path = "que-viene/";
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Lo que viene</span>
  <h1>Lo que viene en Cóndor: vota lo que quieres</h1>
  <p class="prose">Estas son las ideas en las que estamos trabajando o pensando. Vota las que más te servirían para el ICFES y propón las tuyas: lo más votado va primero.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="roadmap" data-no-sticky>
  <ul class="g-road" id="g-road"><li><span>Cargando…</span></li></ul>
  <form class="g-card" id="g-idea">
    <h2>Propón una idea</h2>
    <label class="g-field">¿Qué te ayudaría a prepararte mejor?<textarea name="text" rows="3" maxlength="500" required></textarea></label>
    <div class="g-row"><button class="btn btn-primary" type="submit">Enviar idea</button></div>
    <p class="g-msg" id="g-idea-msg" role="status"></p>
  </form>
</section>
<section class="wrap narrow guide-body">
  <p class="prose">Mira lo que ya salió en <a href="${up}novedades/">novedades</a>. Otras herramientas: ${toolLinks(up, path)}.</p>
</section>`;
    put(path, page({
      siteUrl, path, title: "Lo que viene en Cóndor: vota las próximas funciones",
      desc: "Vota las próximas funciones de Cóndor para preparar el ICFES y propón tus ideas: explicaciones paso a paso, práctica sin internet, simulacros mensuales y más.",
      body: css(up) + body, crumbs: [{ name: "Lo que viene", path }], script: "tools.js",
      jsonLd: [{ "@type": "WebPage", name: "Lo que viene en Cóndor", url: siteUrl + path, inLanguage: "es-CO" }],
    }));
  }

  // ------------------------------------------------------------------ F22 search page (noindex) — index.json comes last
  {
    const path = "buscar/";
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Buscar</span>
  <h1>Buscar en Cóndor</h1>
  <p class="prose">Guías, preguntas por tema, exámenes anteriores, universidades, becas y herramientas para el ICFES.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="buscar" data-no-sticky>
  <form class="g-search" id="g-search" role="search" onsubmit="return false"><label class="g-field" style="flex:1"><span class="sr-only" style="position:absolute;left:-9999px">Buscar</span><input type="search" name="q" id="g-q" placeholder="Ej.: puntaje Univalle, probabilidad, inscripción" autocomplete="off" /></label></form>
  <ul class="g-results" id="g-results" aria-live="polite"></ul>
  <p class="prose g-hidden" id="g-none">No encontramos eso todavía. Lo anotamos para escribirlo. Mientras tanto, mira las <a href="${up}herramientas-icfes/">herramientas</a> o las <a href="${up}preguntas-icfes/">preguntas por área</a>.</p>
</section>`;
    putRaw(path, page({ siteUrl, path, title: "Buscar en Cóndor", desc: "Busca guías, preguntas, exámenes anteriores, universidades y herramientas para el ICFES Saber 11 en Cóndor.", body: css(up) + body, crumbs: [{ name: "Buscar", path }], script: "tools.js", jsonLd: [{ "@type": "SearchResultsPage", name: "Buscar en Cóndor", url: siteUrl + path }] }));
  }

  // ------------------------------------------------------------------ F39 certificate check (noindex)
  {
    const path = "verificar/";
    const up = "../";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Verificar</span>
  <h1>Verificar un certificado de práctica</h1>
  <p class="prose">Los certificados de práctica de Cóndor tienen un código de 8 letras y números. Escríbelo para ver a quién se le dio y qué práctica respalda.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="verificar" data-no-sticky>
  <form class="g-card g-search" id="g-ver" onsubmit="return false"><label class="g-field" style="flex:1">Código<input name="c" maxlength="8" required autocapitalize="off" /></label><button class="btn btn-primary" type="submit" style="align-self:end">Verificar</button></form>
  <div class="g-card g-cert g-hidden" id="g-ver-out" aria-live="polite"></div>
  <p class="prose">El certificado de práctica dice cuánto practicó una persona en Cóndor. No es un resultado oficial del ICFES.</p>
</section>`;
    putRaw(path, page({ siteUrl, path, title: "Verificar certificado de práctica · Cóndor", desc: "Verifica un certificado de práctica de Cóndor con su código.", body: css(up) + body, crumbs: [{ name: "Verificar", path }], script: "tools.js", jsonLd: [{ "@type": "WebPage", name: "Verificar certificado", url: siteUrl + path }] }));
  }

  // ------------------------------------------------------------------ F14 poster with a personal QR (noindex)
  {
    const path = "cartel/";
    const up = "../";
    const body = `<section class="section guide-head g-noprint"><div class="wrap narrow">
  <span class="tag">Cartel</span>
  <h1>Cartel con tu código QR</h1>
  <p class="prose">Imprímelo y pégalo en tu salón, en la cartelera del colegio o en tu academia. Quien lo escanee llega a Cóndor con tu enlace.</p>
</div></section>
<section class="wrap narrow g-tool" data-tool="cartel" data-no-sticky>
  <div class="g-poster" id="g-poster">
    <div><span class="stk stk-lime" style="font:800 15px/1 var(--ui);padding:8px 14px">Saber 11</span><h2 style="margin-top:18px!important">Practica el ICFES con <span class="stk stk-lime">preguntas reales</span></h2></div>
    <div class="qr" id="g-qr" aria-label="Código QR"></div>
    <div><p id="g-poster-line">Escanea y responde tu primera pregunta en segundos.</p><p class="url" id="g-poster-url">condoricfes.com</p></div>
  </div>
  <div class="g-row g-noprint" style="justify-content:center"><button type="button" class="btn btn-primary" onclick="window.print()" data-ev="cartel:print">Imprimir el cartel</button></div>
</section>`;
    putRaw(path, page({ siteUrl, path, title: "Cartel con código QR · Cóndor", desc: "Imprime un cartel con tu código QR para practicar el ICFES en Cóndor.", body: css(up) + body, crumbs: [{ name: "Cartel", path }], script: "tools.js", jsonLd: [{ "@type": "WebPage", name: "Cartel", url: siteUrl + path }] }));
  }

  // ------------------------------------------------------------------ F24 what's new + Atom feed
  {
    const lastmodFile = join(appRoot, "scripts", "seo-lastmod.json");
    const lm = existsSync(lastmodFile) ? JSON.parse(readFileSync(lastmodFile, "utf8")) : {};
    const titleOf = (p) => {
      const f = join(out, p, "index.html");
      if (!existsSync(f)) return null;
      const m = readFileSync(f, "utf8").match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      return m ? m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() : null;
    };
    const descOf = (p) => {
      const f = join(out, p, "index.html");
      const m = existsSync(f) ? readFileSync(f, "utf8").match(/<meta name="description" content="([^"]*)"/) : null;
      return m ? m[1] : "";
    };
    const known = Object.entries(lm).filter(([p]) => p && p !== "privacidad" && !p.startsWith("pregunta-icfes/") && existsSync(join(out, p, "index.html")))
      .map(([p, v]) => ({ p, first: v.first ?? v.date ?? CHECKED, date: v.date ?? CHECKED }))
      .sort((a, b) => b.first.localeCompare(a.first) || a.p.localeCompare(b.p));
    // New tool pages (not in seo-lastmod yet) go on top with today's date.
    const fresh = pages.filter((p) => !lm[p]).map((p) => ({ p, first: CHECKED, date: CHECKED }));
    const items = [...fresh, ...known].filter((x) => titleOf(x.p)).slice(0, 40);
    const path = "novedades/";
    const up = "../";
    const byDay = new Map();
    for (const it of items) { if (!byDay.has(it.first)) byDay.set(it.first, []); byDay.get(it.first).push(it); }
    const fmtDay = (iso) => parseLocal(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Novedades</span>
  <h1>Novedades de Cóndor</h1>
  <p class="prose">Las páginas, guías y herramientas más nuevas para preparar el ICFES. También puedes seguirlas con el <a href="${up}feed.xml">feed</a> en tu lector.</p>
</div></section>
<section class="wrap narrow guide-body">
${[...byDay.entries()].map(([day, list]) => `  <h2>${esc(fmtDay(day))}</h2>\n  <ul class="checks">${list.map((it) => `<li><a href="${up}${it.p}">${esc(titleOf(it.p))}</a></li>`).join("")}</ul>`).join("\n")}
  <p class="prose">¿Qué quieres que hagamos después? Vota en <a href="${up}que-viene/">lo que viene</a>.</p>
</section>`;
    put(path, page({
      siteUrl, path, title: "Novedades de Cóndor: guías y herramientas ICFES",
      desc: "Lo más nuevo de Cóndor para preparar el ICFES Saber 11: guías, páginas de universidades y becas, herramientas y exámenes anteriores.",
      body: css(up) + body, crumbs: [{ name: "Novedades", path }],
      jsonLd: [{ "@type": "CollectionPage", name: "Novedades de Cóndor", url: siteUrl + path, inLanguage: "es-CO" }],
    }));
    const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es-CO">
  <title>Cóndor · Novedades para el ICFES</title>
  <subtitle>Guías, herramientas y exámenes anteriores del Saber 11</subtitle>
  <link href="${siteUrl}feed.xml" rel="self" />
  <link href="${siteUrl}novedades/" />
  <id>${siteUrl}feed.xml</id>
  <updated>${(items[0]?.date ?? CHECKED)}T12:00:00Z</updated>
  <author><name>Cóndor</name></author>
${items.slice(0, 30).map((it) => `  <entry>
    <title>${xmlEsc(titleOf(it.p))}</title>
    <link href="${siteUrl}${it.p}" />
    <id>${siteUrl}${it.p}</id>
    <published>${it.first}T12:00:00Z</published>
    <updated>${it.date}T12:00:00Z</updated>
    <summary>${xmlEsc(descOf(it.p))}</summary>
  </entry>`).join("\n")}
</feed>
`;
    writeFileSync(join(out, "feed.xml"), feed);
  }

  // ------------------------------------------------------------------ the tools bundle (site-src/tools.js + qrcode)
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(appRoot, "site-src", "tools.js")], bundle: true, minify: true, format: "iife", target: ["es2019"],
    outfile: join(out, "tools.js"), legalComments: "none", logLevel: "error",
  });

  return pages;
}

const parseLocal = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };

// Search index of every public page (F22), written after all pages exist (build-site.mjs calls it).
export function writeSearchIndex(out) {
  const pages = [];
  (function walk(dir, rel) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (rel === "" && ["app", "img", "katex", "assets", "fonts", "brand", "calendario", "buscar", "verificar", "cartel"].includes(name)) continue;
      const r = `${rel}${name}/`;
      const f = join(full, "index.html");
      if (existsSync(f)) {
        const html = readFileSync(f, "utf8");
        if (!/content="noindex/.test(html)) {
          const t = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
          const d = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"') ?? "";
          if (t) pages.push({ u: r, t, d: d.slice(0, 160) });
        }
      }
      walk(full, r);
    }
  })(out, "");
  pages.sort((a, b) => a.u.localeCompare(b.u));
  mkdirSync(join(out, "buscar"), { recursive: true });
  writeFileSync(join(out, "buscar", "index.json"), JSON.stringify({ v: 1, pages }));
  return pages.length;
}
