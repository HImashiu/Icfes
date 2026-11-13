// "Puntaje ICFES para entrar a…" pages: what each university asks of the Saber 11, with its published weights and
// cut lines, and a calculator preset to them (site/calc-u.js).
//   puntaje-icfes/                    hub: how universities use the Saber 11, links to every university and career
//   puntaje-icfes/<universidad>/      one university: method, weights per program, last cut lines, dates, sources
//   puntaje-icfes/carreras/<carrera>/ one career across universities
// Data: scripts/seo-data/universidades.mjs (every number read on the university's own site; date in CHECKED).
// Called from build-seo.mjs with the shared helpers. Returns nothing; pages are registered through write().
import { CAREERS, CHECKED, UNIVERSITIES } from "./seo-data/universidades.mjs";

const TESTS = [
  { id: "lc", name: "Lectura crítica", short: "LC" },
  { id: "ma", name: "Matemáticas", short: "M" },
  { id: "sc", name: "Sociales y ciudadanas", short: "S" },
  { id: "cn", name: "Ciencias naturales", short: "CN" },
  { id: "in", name: "Inglés", short: "I" },
];
const ORDER = ["cn", "lc", "ma", "sc", "in"]; // order of data-w for calc-u.js
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const longDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} de ${MONTHS[m - 1]} de ${y}`; };
const dec = (n) => n.toFixed(2).replace(".", ",");
const weighted = (w, s) => ORDER.reduce((a, k) => a + w[k] * s[k], 0) / 100;
const EXAMPLE = { lc: 60, ma: 55, sc: 50, cn: 52, in: 65 };
const testName = (id) => TESTS.find((t) => t.id === id).name;
const topTests = (w) => { const max = Math.max(...ORDER.map((k) => w[k])); return ORDER.filter((k) => w[k] === max); };
const joinY = (a) => a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} y ${a[a.length - 1]}`;

// Inline styles for the calculator rows (the shared stylesheets are owned by the foundation thread).
export const STYLE = `<style>
.ucalc-tab td.you{font-weight:800;white-space:nowrap}
#ucalc .calc-in span{color:#0D110F}
#ucalc .calc-in input{background:#fff;color:#0D110F;border-color:#0D110F}
#ucalc .calc-in input::placeholder{color:#8A9088}
#ucalc .calc-in input:focus{border-color:#2B5F2E;box-shadow:0 0 0 3px #C8F04A}
#ucalc-note{font-size:14px;color:#0D110F}
.ucalc-tab tr.ok td.you{background:#C8F04A;color:#0D110F}
.ucalc-tab tr.near td.you{background:#FFE8A3;color:#0D110F}
.ucalc-tab td small{display:block;color:var(--text-2);font-weight:600;font-size:12px;line-height:1.3;margin-top:2px}
.ucalc-tab .wts{font-size:13px;min-width:7.5em}
.ucalc-legend{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:13px;font-weight:600;color:var(--text-2);margin:4px 0 14px}
.ucalc-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;border:2px solid #0D110F;vertical-align:-2px;margin-right:6px}
.uni-facts li{margin-bottom:8px}
.ucalc-notes{font-size:14px;color:var(--text-2)}
.src-list{font-size:14px}
.guide-body .source a{color:#2B5F2E;font-weight:700}
</style>`;

const weightsText = (w) => [...ORDER.filter((k) => w[k] > 0).map((k) => `${TESTS.find((t) => t.id === k).short} ${w[k]}`), ...(w.pe ? [`Prueba propia ${w.pe}`] : [])].join(" · ");

export function calcForm(esc, min, gmin, { kind, note } = {}) {
  const inputs = TESTS.map((t) => `<label class="calc-in"><span>${esc(t.name)}</span><input type="number" inputmode="numeric" min="0" max="100" step="1" name="${t.id}" placeholder="0 a 100" /></label>`).join("");
  return `<form class="card calc" id="ucalc" novalidate${min ? ` data-min="${min}"` : ""}${gmin ? ` data-gmin="${gmin}"` : ""}${kind ? ` data-kind="${kind}"` : ""}>
    <div class="calc-grid">${inputs}</div>
    <p class="source" id="ucalc-note" aria-live="polite">${esc(note || "Escribe tus cinco puntajes de 0 a 100 y la tabla calcula tu ponderado en cada programa.")}</p>
  </form>`;
}
export const legendFor = (near) => `<div class="ucalc-legend"><span><i style="background:#C8F04A"></i>Igual o por encima del último corte</span><span><i style="background:#FFE8A3"></i>A menos de ${near} puntos del corte</span></div>`;
const legend = legendFor(3);
const legendG = legendFor(15);
const globalOf = (s) => Math.round(5 * (3 * (s.lc + s.ma + s.sc + s.cn) + s.in) / 13);

// One row compared on the global score (0-500). cuts: [value or null per period].
export function gRow(esc, { label, cuts, sub }) {
  const latestCut = cuts.find((c) => c != null);
  return `<tr data-g${latestCut != null ? ` data-cut="${latestCut}"` : ""}><td>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</td>${cuts.map((c) => `<td>${c == null ? "–" : c}</td>`).join("")}<td class="you">–</td></tr>`;
}

// One row of a calculator table. cuts: [value or null per period].
function calcRow(esc, { label, w, cuts, sub }) {
  const latestCut = cuts.find((c) => c != null);
  const canCalc = !w.pe;
  return `<tr${canCalc ? ` data-w="${ORDER.map((k) => w[k]).join(",")}"${latestCut != null ? ` data-cut="${latestCut}"` : ""}` : ""}><td>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</td><td class="wts">${esc(weightsText(w))}</td>${cuts.map((c) => `<td>${c == null ? "–" : dec(c)}</td>`).join("")}<td class="you">${canCalc ? "–" : "n/a"}</td></tr>`;
}

function sourcesBlock(esc, sources) {
  return `<h2>Fuentes</h2>
  <p class="prose">Consultadas el ${longDate(CHECKED)} en los sitios oficiales. Antes de inscribirte, confirma en ellos: las universidades actualizan sus reglas cada semestre.</p>
  <ul class="src-list">${sources.map((s) => `<li><a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.label)}</a></li>`).join("")}</ul>`;
}

export function buildScoreUniversityPages({ siteUrl, write, page, esc, faqBlock, faqLd, cta }) {
  const careerName = Object.fromEntries(CAREERS.map((c) => [c.slug, c.name]));
  const uniUrl = (u, up) => `${up}puntaje-icfes/${u.slug}/`;
  const careerUrl = (slug, up) => `${up}puntaje-icfes/carreras/${slug}/`;
  const datasetLd = (u, path, desc) => ({
    "@type": "Dataset", name: `Ponderaciones y cortes del Saber 11 para ${u.name}`, description: desc, url: siteUrl + path, inLanguage: "es-CO",
    dateModified: CHECKED, creator: { "@id": `${siteUrl}#org` }, isBasedOn: u.sources.map((s) => s.url),
    about: { "@type": "CollegeOrUniversity", name: u.name, address: { "@type": "PostalAddress", addressLocality: u.city.split(",")[0], addressCountry: "CO" } },
    isAccessibleForFree: true,
  });

  // ---------------------------------------------------------------- one page per university
  for (const u of UNIVERSITIES) {
    const path = `puntaje-icfes/${u.slug}/`;
    const up = "../../";
    let main = "", faq = [], desc = "", h1, title, intro, ld = [];
    const progLink = (p) => p.career ? `<a href="${careerUrl(p.career, up)}">${esc(p.name)}</a>` : esc(p.name);

    if (u.mode === "saber11" && u.programs.length) {
      const periods = u.periods || [];
      const rows = u.programs.map((p) => calcRow(esc, { label: progLink(p), w: p.w, cuts: periods.map((pe) => p.cut?.[pe] ?? null), sub: p.note }));
      const head = `<tr><th>Programa</th><th>Pesos (%)</th>${periods.map((pe) => `<th>${esc(u.cutLabel)} ${pe}</th>`).join("")}<th>Tú</th></tr>`;
      const withCut = u.programs.filter((p) => p.cut?.[periods[0]] != null).sort((a, b) => b.cut[periods[0]] - a.cut[periods[0]]);
      const ex = u.programs.find((p) => p.career === "medicina") || u.programs[0];
      const exScore = weighted(ex.w, EXAMPLE);
      const exLine = ORDER.filter((k) => ex.w[k] > 0).map((k) => `${EXAMPLE[k]} × ${ex.w[k]} %`).join(" + ");
      h1 = { univalle: "Puntaje ICFES para entrar a Univalle", uis: "Puntaje ICFES para entrar a la UIS" }[u.slug] || `Puntaje ICFES para entrar a la ${u.name}`;
      title = u.short === "Univalle" ? "Puntaje ICFES para Univalle 2026: cortes por carrera"
        : u.short === "UIS" ? "Puntaje ICFES para la UIS: ponderados por carrera"
          : "Puntaje ICFES U. de Caldas: ponderados por carrera";
      intro = withCut.length
        ? `Estos son los pesos que la ${u.name} le da a cada prueba del Saber 11 y las líneas de corte de sus últimos semestres. Escribe tus puntajes y mira tu ponderado en cada programa.`
        : `Estos son los pesos que la ${u.name} le da a cada prueba del Saber 11 en cada programa. Escribe tus puntajes y mira tu ponderado en cada uno.`;
      desc = withCut.length
        ? `Pesos del Saber 11 y líneas de corte ${periods.join(" y ")} de ${u.short} por programa: ${withCut[0].name} ${dec(withCut[0].cut[periods[0]])}. Calcula tu ponderado.`
        : `Pesos del Saber 11 por programa en la ${u.name} (${u.city}) y calculadora de tu puntaje ponderado.${u.min ? ` Mínimo ${u.min} por prueba.` : ""}`;
      main = `${STYLE}
  <h2>Cómo usa el ICFES la ${esc(u.name)}</h2>
  ${u.how.map((p) => `<p class="prose">${esc(p)}</p>`).join("\n  ")}
  <h2>Calcula tu puntaje ponderado</h2>
  ${calcForm(esc, u.min)}
  ${withCut.length ? legend : ""}
  <div class="tbl"><table class="ucalc-tab"><thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>
  <p class="prose">Pesos: CN Ciencias naturales, LC Lectura crítica, M Matemáticas, S Sociales y ciudadanas, I Inglés. Tu ponderado = suma de cada puntaje por su peso, dividida entre 100.</p>
  <h2>Ejemplo</h2>
  <p class="prose">Con ${EXAMPLE.lc} en Lectura crítica, ${EXAMPLE.ma} en Matemáticas, ${EXAMPLE.sc} en Sociales, ${EXAMPLE.cn} en Ciencias y ${EXAMPLE.in} en Inglés, el ponderado para ${esc(ex.name)} es (${exLine}) ÷ 100 = <b>${dec(exScore)}</b>.${ex.cut?.[periods[0]] != null ? ` El último corte fue ${dec(ex.cut[periods[0]])}, así que faltarían ${dec(ex.cut[periods[0]] - exScore)} puntos.` : ""}</p>
  <h2>Fechas y datos útiles</h2>
  <ul class="uni-facts">${u.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
      if (withCut.length) {
        const top = withCut[0], low = withCut[withCut.length - 1];
        faq.push([`¿Cuánto puntaje ICFES necesito para entrar a ${u.short}?`, `No hay un mínimo fijo: depende de los inscritos de cada semestre. Como referencia, en ${periods[0]} la línea de corte más alta fue la de ${top.name} (${dec(top.cut[periods[0]])} sobre 100, ponderado) y la más baja la de ${low.name} (${dec(low.cut[periods[0]])}).`]);
        const med = u.programs.find((p) => p.career === "medicina");
        if (med?.avgGlobal) faq.push([`¿Con cuánto puntaje global entraron a Medicina en ${u.short}?`, `En ${periods[0]} el promedio del puntaje global de los admitidos en primer llamado fue ${dec(med.avgGlobal[periods[0]])} sobre 500, y se inscribieron ${med.inscritos[periods[0]]} aspirantes. La línea de corte ponderada fue ${dec(med.cut[periods[0]])}.`]);
      }
      if (u.min) faq.push([`¿Cuál es el puntaje mínimo para inscribirse en la ${u.short}?`, `Para pregrado presencial en Bucaramanga, ${u.min} puntos en cada una de las cinco pruebas del Saber 11, con un examen de 2021 en adelante. Después compites por puntaje ponderado.`]);
      if (u.slug === "universidad-de-caldas") faq.push(["¿Cuánto puntaje ICFES necesito para Medicina en la Universidad de Caldas?", "Desde 2026-2 el Saber 11 (Matemáticas 40 %, Lectura crítica 40 %, Ciencias 10 %, Sociales 10 %) solo sirve para quedar entre los 300 preseleccionados. La admisión la decide un examen propio de comprensión lectora y razonamiento matemático."]);
      faq.push(["¿Cómo calculo mi puntaje ponderado?", `Multiplica el puntaje de cada prueba (de 0 a 100) por el peso que el programa le da, suma y divide entre 100. Ejemplo para ${ex.name}: ${exLine}, dividido entre 100, da ${dec(exScore)}.`]);
      faq.push(["¿Este cálculo es oficial?", `No. Cóndor usa los pesos y cortes publicados por la ${u.name} (consultados el ${longDate(CHECKED)}), pero la admisión la decide la universidad y los cortes cambian cada semestre.`]);
      ld.push(datasetLd(u, path, desc));
    } else if (u.mode === "global") {
      const periods = u.periods || [];
      const globals = u.globals || [];
      const cuts = (p) => periods.map((pe) => p.cut?.[pe] ?? null);
      const latest = (p) => cuts(p).find((c) => c != null);
      const rows = globals.length
        ? globals.map((p) => gRow(esc, { label: progLink(p), cuts: cuts(p) })).join("")
        : gRow(esc, { label: "Todos los programas", cuts: [], sub: "La universidad no publica un corte actual" });
      const head = `<tr><th>Programa</th>${periods.map((pe) => `<th>${esc(u.cutLabel)} ${pe}</th>`).join("")}<th>Tu global</th></tr>`;
      const sorted = [...globals].filter((p) => p.cut?.[periods[0]] != null).sort((x, y) => y.cut[periods[0]] - x.cut[periods[0]]);
      const exG = globalOf(EXAMPLE);
      const art = u.slug === "universidad-del-magdalena" ? "la Universidad del Magdalena" : "la Universidad del Atlántico";
      h1 = `Puntaje ICFES para entrar a ${art}`;
      title = u.slug === "universidad-del-magdalena" ? "Puntaje ICFES Unimagdalena: últimos admitidos" : "Puntaje ICFES Uniatlántico 2027: cómo se entra";
      intro = sorted.length
        ? `${u.name.replace("Universidad", "La Universidad")} admite con el puntaje global del Saber 11. Aquí está el global del último admitido en cada programa en sus últimos semestres, y una calculadora de tu global.`
        : `${u.name.replace("Universidad", "La Universidad")} admite con el puntaje global del Saber 11, sin puntaje mínimo. Aquí está cómo funciona su admisión 2027-1, las pruebas específicas y las fechas.`;
      desc = sorted.length
        ? `Puntaje global ICFES del último admitido a ${u.short} por programa (${periods[0]}): ${sorted[0].name} ${sorted[0].cut[periods[0]]}. Mínimo ${u.gmin} para inscribirte.`
        : `${u.short} admite por puntaje global del Saber 11 y ya no pide mínimo. Pruebas de Medicina y Bellas Artes, fechas 2027-1 y calculadora.`;
      main = `${STYLE}
  <h2>Cómo usa el ICFES ${art}</h2>
  ${u.how.map((p) => `<p class="prose">${esc(p)}</p>`).join("\n  ")}
  <h2>Calcula tu puntaje global</h2>
  ${calcForm(esc, 0, u.gmin, { note: "Escribe tus cinco puntajes de 0 a 100 y la tabla calcula tu puntaje global." })}
  ${sorted.length ? legendG : ""}
  <div class="tbl"><table class="ucalc-tab"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
  <p class="prose">El puntaje global va de 0 a 500: 5 × (3 × Lectura crítica + 3 × Matemáticas + 3 × Sociales + 3 × Ciencias naturales + Inglés) ÷ 13. Con ${EXAMPLE.lc}, ${EXAMPLE.ma}, ${EXAMPLE.sc}, ${EXAMPLE.cn} y ${EXAMPLE.in} el global es <b>${exG}</b>.</p>
  <h2>Fechas y datos útiles</h2>
  <ul class="uni-facts">${u.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
      if (sorted.length) {
        const top = sorted[0], low = sorted[sorted.length - 1];
        faq.push([`¿Cuánto puntaje ICFES necesito para entrar a ${u.short}?`, `Necesitas al menos ${u.gmin} de puntaje global para inscribirte. Para quedar admitido depende del programa: en ${periods[0]} el último admitido por cupo regular a ${top.name} tuvo ${top.cut[periods[0]]} y a ${low.name} ${low.cut[periods[0]]}.`]);
        const med = globals.find((p) => p.career === "medicina");
        if (med) faq.push([`¿Con cuánto puntaje se entra a Medicina en ${u.short}?`, `El último admitido por cupo regular tuvo ${periods.filter((pe) => med.cut[pe] != null).map((pe) => `${med.cut[pe]} en ${pe}`).join(", ")} (puntaje global sobre 500).`]);
        if (u.slug === "universidad-del-magdalena") faq.push(["¿Qué pasa si entro con 250 o menos?", "Desde el Acuerdo Académico 14 de 2025, quien es admitido con un global de 250 o menos cursa primero un Semestre de Nivelación Académica y empieza el programa el semestre siguiente."]);
      } else {
        faq.push([`¿Cuál es el puntaje mínimo para entrar a ${u.short}?`, "Para 2027-1 no hay puntaje mínimo para inscribirte. Compites con tu puntaje global del Saber 11 contra los demás inscritos del programa."]);
        faq.push([`¿Cómo es la prueba de Medicina en ${u.short}?`, "Convocan al doble del cupo por orden de puntaje global. Presentan una prueba psicotécnica y una entrevista, que valen el 20 % del puntaje; el otro 80 % sale del Saber 11."]);
      }
      faq.push(["¿Este cálculo es oficial?", `No. Cóndor usa las reglas y puntajes que publica ${art} (consultados el ${longDate(CHECKED)}); la admisión la decide la universidad y los puntajes cambian cada semestre.`]);
      ld.push({ ...datasetLd(u, path, desc), name: `Puntaje global del Saber 11 para entrar a ${art}` });
    } else if (u.ranges) {
      const r = u.ranges;
      h1 = "Puntaje ICFES para entrar a la UTP";
      title = "Puntaje ICFES para la UTP 2026: rangos de admitidos";
      intro = `Estos son los rangos de puntaje de los admitidos a la Universidad Tecnológica de Pereira en ${r.period}, por programa y por circunscripción, tal como los publica la universidad.`;
      desc = `Rangos de puntaje ICFES de los admitidos a la UTP en ${r.period}: mayor y menor por programa, para Risaralda y fuera de Risaralda. Medicina desde ${r.programs[0].ris[1]}.`;
      const rows = r.programs.map((p) => `<tr><td>${progLink(p)}</td><td>${p.ris[1]}</td><td>${p.ris[0]}</td><td>${p.fuera[1]}</td><td>${p.fuera[0]}</td></tr>`).join("");
      main = `${STYLE}
  <h2>Cómo usa el ICFES la UTP</h2>
  ${u.how.map((p) => `<p class="prose">${esc(p)}</p>`).join("\n  ")}
  <h2>Rangos de puntaje de los admitidos ${r.period}</h2>
  <div class="tbl"><table><thead><tr><th>Programa</th><th>Risaralda: menor admitido</th><th>Risaralda: mayor</th><th>Fuera: menor admitido</th><th>Fuera: mayor</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="prose">«Mayor» es el puntaje más alto entre inscritos y admitidos; «menor admitido» es el puntaje del último que entró. La UTP aclara que no son puntajes requeridos, solo datos de ese semestre.</p>
  <h2>Datos útiles</h2>
  <ul class="uni-facts">${u.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  <p class="prose">Para ver tu puntaje global de 0 a 500 usa la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>.</p>`;
      faq.push(["¿Cuánto puntaje ICFES necesito para Medicina en la UTP?", `En ${r.period} el último admitido a Medicina tuvo ${r.programs[0].ris[1]} entre los aspirantes de Risaralda y ${r.programs[0].fuera[1]} entre los de fuera del departamento. Son datos de ese semestre, no un mínimo.`]);
      faq.push(["¿Por qué el corte es distinto para Risaralda y fuera?", "La UTP reserva el 70 % de los cupos para aspirantes de Risaralda y el 30 % para los de otros departamentos (Acuerdo 38 de 2018), y cada grupo compite por separado."]);
      faq.push(["¿Estos rangos son oficiales?", `Son los que publica la UTP para ${r.period} (consultados el ${longDate(CHECKED)}). Cóndor no está afiliado a la universidad; confirma en su sitio antes de inscribirte.`]);
      ld.push(datasetLd(u, path, desc));
    } else {
      const isUnal = u.slug === "universidad-nacional";
      h1 = isUnal ? "Puntaje ICFES para entrar a la Universidad Nacional" : "Puntaje ICFES para entrar a la Universidad de Antioquia";
      title = isUnal ? "Puntaje ICFES para la Nacional: cómo se entra" : "Puntaje ICFES para la UdeA: cómo se entra en 2027";
      intro = isUnal
        ? "Respuesta corta: en el proceso regular, la Universidad Nacional no te admite por tu puntaje ICFES. Te admite con su propio examen. Aquí están las fechas del proceso 2027-1 y cómo prepararte."
        : "Respuesta corta: la Universidad de Antioquia no te admite por tu puntaje ICFES. Te admite con su propio examen de competencia lectora y razonamiento lógico. Aquí están las fechas del proceso 2027-1.";
      desc = isUnal
        ? "La Universidad Nacional admite con su propio examen, no con el puntaje ICFES. Fechas del proceso 2027-1 y cómo prepararte para el examen."
        : "La UdeA admite con su examen de competencia lectora y razonamiento lógico, sin puntaje ICFES mínimo. Fechas 2027-1, costos y requisitos.";
      main = `${STYLE}
  <h2>Cómo admite la ${esc(u.short.replace(/^la /, ""))}</h2>
  ${u.how.map((p) => `<p class="prose">${esc(p)}</p>`).join("\n  ")}
  <h2>Fechas y datos del proceso 2027-1</h2>
  <ul class="uni-facts">${u.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  <h2>Cómo prepararte</h2>
  <p class="prose">${isUnal ? "El examen de la Nacional es distinto del Saber 11, pero ambos exigen leer con cuidado y razonar con números y datos." : "El examen de la UdeA mide competencia lectora y razonamiento lógico."} Practicar <a href="${up}preguntas-icfes/lectura-critica/">preguntas de Lectura crítica</a> y <a href="${up}preguntas-icfes/matematicas/">preguntas de Matemáticas</a> del ICFES entrena esas mismas habilidades, y un buen Saber 11 te sirve para las universidades que sí admiten con él, como <a href="${up}puntaje-icfes/univalle/">Univalle</a> o la <a href="${up}puntaje-icfes/uis/">UIS</a>.</p>`;
      faq = isUnal ? [
        ["¿Qué puntaje ICFES necesito para la Universidad Nacional?", "En el proceso regular de pregrado la Nacional no selecciona por puntaje ICFES: lo hace con su examen de admisión. Los programas especiales tienen reglas propias que publica la universidad."],
        ["¿Cuándo es el examen de la Nacional para 2027-1?", "El domingo 20 de septiembre de 2026. La inscripción y el pago fueron del 6 de julio al 24 de agosto de 2026 y los resultados salieron desde el 9 de octubre."],
        ["¿Dónde veo los puntajes de admisión de años anteriores?", "La Nacional publica los puntajes de su examen por sede y periodo en admisiones.unal.edu.co, en resultados de procesos anteriores."],
      ] : [
        ["¿Qué puntaje ICFES necesito para la Universidad de Antioquia?", "Ninguno: el Consejo Académico eliminó el puntaje mínimo en el examen de Estado. Te admite el examen de la UdeA (competencia lectora 50 % y razonamiento lógico 50 %). Igual debes tener el resultado o la citación del Saber 11."],
        ["¿Qué es el SNP que pide la inscripción de la UdeA?", "Es el código AC del ICFES que aparece en tu citación o en tu resultado del Saber 11. Si aún no tienes resultado, usa el de la citación."],
        ["¿Cuándo es el examen de la UdeA para 2027-1?", "El 26 y el 27 de octubre de 2026, con resultados el 11 de noviembre de 2026."],
      ];
      ld.push({ "@type": "Article", headline: h1, description: desc, url: siteUrl + path, inLanguage: "es-CO", dateModified: CHECKED, author: { "@id": `${siteUrl}#org` }, publisher: { "@id": `${siteUrl}#org` }, isBasedOn: u.sources.map((s) => s.url), about: { "@type": "CollegeOrUniversity", name: u.name } });
    }

    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">${esc(u.city.split(",")[0])}</span>
  <h1>${esc(h1)}</h1>
  <p class="prose">${esc(intro)}</p>
</div></section>
<section class="wrap narrow guide-body">
  ${main}
  ${sourcesBlock(esc, u.sources)}
  <p class="prose">Mira cómo piden el ICFES otras universidades en <a href="../">puntaje ICFES para entrar a la universidad</a>, las <a href="${up}becas-icfes/">becas y créditos con el puntaje ICFES</a>, o mide tus puntajes por prueba con un <a href="${up}simulacro-icfes/">simulacro ICFES</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, "Sube el puntaje que te pide la universidad")}`;
    write(path, page({
      siteUrl, path, title, desc, body, script: (u.mode === "saber11" && u.programs.length) || u.mode === "global" ? "calc-u.js" : undefined,
      crumbs: [{ name: "Puntaje ICFES por universidad", path: "puntaje-icfes/" }, { name: u.name, path }],
      jsonLd: [faqLd(faq), ...ld],
    }));
  }

  // ---------------------------------------------------------------- one page per career
  for (const c of CAREERS) {
    const path = `puntaje-icfes/carreras/${c.slug}/`;
    const up = "../../../";
    const rows = [], unis = [], ranges = [], gRows = [];
    for (const u of UNIVERSITIES) {
      for (const p of u.programs || []) {
        if (p.career !== c.slug) continue;
        const pe = (u.periods || [])[0];
        const cut = pe ? p.cut?.[pe] ?? p.cut?.[u.periods[1]] : null;
        const cutPe = pe && p.cut?.[pe] != null ? pe : u.periods?.[1];
        rows.push({ u, p, cut: cut ?? null, cutPe });
        unis.push(u);
      }
      for (const p of u.ranges?.programs || []) if (p.career === c.slug) { ranges.push({ u, p, period: u.ranges.period }); unis.push(u); }
      for (const p of u.globals || []) {
        if (p.career !== c.slug) continue;
        const cutPe = (u.periods || []).find((pe) => p.cut?.[pe] != null);
        gRows.push({ u, p, cut: cutPe ? p.cut[cutPe] : null, cutPe });
        unis.push(u);
      }
    }
    const tableRows = rows.map(({ u, p, cut, cutPe }) => calcRow(esc, { label: `<a href="${uniUrl(u, up)}">${esc(u.short)}</a>`, w: p.w, cuts: [cut], sub: [p.name !== c.name ? p.name : "", cut != null ? `Corte ${cutPe}` : "Sin corte publicado"].filter(Boolean).join(". ") }));
    const notes = rows.filter(({ p }) => p.note).map(({ u, p }) => `<li><b>${esc(u.short)}:</b> ${esc(p.note)}</li>`).join("");
    const heaviest = rows.map(({ u, p }) => `en ${u.short === "U. de Caldas" ? "la Universidad de Caldas" : u.short} pesa más ${joinY(topTests(p.w).map((k) => testName(k)))} (${p.w[topTests(p.w)[0]]} %)`);
    const withCut = rows.filter((r) => r.cut != null);
    const medRange = ranges[0];
    const h1 = `Puntaje ICFES para estudiar ${c.name}`;
    const title = `Puntaje ICFES para ${c.name}: pesos y cortes`.length > 60 ? `Puntaje ICFES para ${c.name}` : `Puntaje ICFES para ${c.name}: pesos y cortes`;
    const desc = `${c.name} en ${joinY([...new Set(unis.map((u) => u.short))])}: cuánto pesa cada prueba del ICFES${withCut.length || gRows.length ? ", último corte" : ""} y calculadora de tu ponderado.`;
    const faq = [
      [`¿Qué prueba del ICFES pesa más para ${c.name}?`, `Depende de la universidad: ${heaviest.join("; ")}.`],
      ...(withCut.length || gRows.length ? [[`¿Cuánto puntaje necesito para ${c.name}?`, `No hay un número fijo. Como referencia, ${[...withCut.map((r) => `en ${r.u.short} el último corte publicado (${r.cutPe}) fue ${dec(r.cut)} sobre 100, ponderado`), ...gRows.filter((r) => r.cut != null).map((r) => `en ${r.u.short} el último admitido de ${r.cutPe} tuvo ${r.cut} de puntaje global, sobre 500`)].join("; ")}.${medRange ? ` En la UTP el último admitido de ${medRange.period} tuvo ${medRange.p.ris[1]} (Risaralda) y ${medRange.p.fuera[1]} (fuera de Risaralda).` : ""}`]] : []),
      [`¿Y en la Nacional o la Universidad de Antioquia?`, `Esas dos universidades no admiten por puntaje ICFES en su proceso regular: cada una tiene su propio examen de admisión.`],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">${esc(c.name)}</span>
  <h1>${esc(h1)}</h1>
  <p class="prose">Cada universidad pública le da un peso distinto a las pruebas del Saber 11 para ${esc(c.name)}. Aquí están los pesos y cortes que publican, y una calculadora que te dice tu ponderado en cada una.</p>
</div></section>
<section class="wrap narrow guide-body">
  ${STYLE}
  <h2>Calcula tu ponderado para ${esc(c.name)}</h2>
  ${calcForm(esc, 0)}
  ${withCut.length ? legend : ""}
  <div class="tbl"><table class="ucalc-tab"><thead><tr><th>Universidad</th><th>Pesos (%)</th><th>Último corte</th><th>Tú</th></tr></thead><tbody>${tableRows.join("")}</tbody></table></div>
  ${notes ? `<ul class="ucalc-notes">${notes}</ul>` : ""}
  <p class="prose">Pesos: CN Ciencias naturales, LC Lectura crítica, M Matemáticas, S Sociales y ciudadanas, I Inglés. ${rows.some((r) => r.u.min) ? `La UIS además pide mínimo ${rows.find((r) => r.u.min).u.min} puntos en cada prueba para inscribirse.` : ""}</p>
  ${ranges.length ? `<h2>${esc(c.name)} en la UTP</h2>
  <p class="prose">La UTP no publica sus pesos por programa, pero sí el rango de puntajes de sus admitidos:</p>
  <div class="tbl"><table><thead><tr><th>Programa</th><th>Risaralda: menor admitido</th><th>Fuera: menor admitido</th></tr></thead><tbody>${ranges.map(({ p, period }) => `<tr><td><a href="${up}puntaje-icfes/utp/">${esc(p.name)}</a> (${period})</td><td>${p.ris[1]}</td><td>${p.fuera[1]}</td></tr>`).join("")}</tbody></table></div>` : ""}
  ${gRows.length ? `<h2>${esc(c.name)} donde cuenta el puntaje global</h2>
  <p class="prose">${joinY([...new Set(gRows.map((r) => r.u.name))].map(esc))} no pondera por prueba: ordena a los inscritos por el puntaje global del Saber 11, de 0 a 500. La calculadora de arriba también te da tu global.</p>
  ${gRows.some((r) => r.cut != null) ? legendG : ""}
  <div class="tbl"><table class="ucalc-tab"><thead><tr><th>Universidad</th><th>Último admitido</th><th>Tu global</th></tr></thead><tbody>${gRows.map(({ u, p, cut, cutPe }) => gRow(esc, { label: `<a href="${uniUrl(u, up)}">${esc(u.short)}</a>`, cuts: [cut], sub: [p.name !== c.name ? p.name : "", cut != null ? `Puntaje global, ${cutPe}` : "Sin corte publicado"].filter(Boolean).join(". ") })).join("")}</tbody></table></div>` : ""}
  <h2>Qué prueba pesa más</h2>
  <p class="prose">${esc(heaviest.map((s) => s[0].toUpperCase() + s.slice(1)).join(". "))}. Si te falta puntaje, empieza por la prueba que más pesa en la universidad que quieres: practica con <a href="${up}preguntas-icfes/">preguntas ICFES por área</a>.</p>
  <h2>En la Nacional y en la de Antioquia</h2>
  <p class="prose">La <a href="${up}puntaje-icfes/universidad-nacional/">Universidad Nacional</a> y la <a href="${up}puntaje-icfes/universidad-de-antioquia/">Universidad de Antioquia</a> no admiten por puntaje ICFES en su proceso regular: cada una tiene su propio examen.</p>
  <p class="prose">Datos consultados el ${longDate(CHECKED)} en los sitios de cada universidad (fuentes en la página de cada una). Mira todas las universidades en <a href="../../">puntaje ICFES para entrar a la universidad</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, `Prepárate para entrar a ${esc(c.name)}`)}`;
    write(path, page({
      siteUrl, path, title, desc, body, script: "calc-u.js",
      crumbs: [{ name: "Puntaje ICFES por universidad", path: "puntaje-icfes/" }, { name: c.name, path }],
      jsonLd: [faqLd(faq), { "@type": "Dataset", name: `Ponderaciones del Saber 11 para ${c.name} por universidad`, description: desc, url: siteUrl + path, inLanguage: "es-CO", dateModified: CHECKED, creator: { "@id": `${siteUrl}#org` }, isBasedOn: [...new Set(unis.flatMap((u) => u.sources.map((s) => s.url)))], isAccessibleForFree: true }],
    }));
  }

  // ---------------------------------------------------------------- hub
  {
    const path = "puntaje-icfes/";
    const up = "../";
    const uniRows = UNIVERSITIES.map((u) => {
      const how = u.mode === "exam" ? "Examen propio (no usa el puntaje ICFES)" : u.mode === "global" ? `Puntaje global del Saber 11${u.gmin ? `; mínimo ${u.gmin}` : "; sin mínimo"}${u.globals?.length ? "; publica últimos admitidos" : ""}` : u.ranges ? "Saber 11 ponderado; publica rangos de admitidos" : u.periods?.length ? "Saber 11 ponderado; publica línea de corte" : `Saber 11 ponderado${u.min ? `; mínimo ${u.min} por prueba` : "; sin mínimo"}`;
      return `<tr><td><a href="${u.slug}/">${esc(u.name)}</a></td><td>${esc(u.city.split(",")[0])}</td><td>${esc(how)}</td></tr>`;
    }).join("");
    const careerTiles = `<div class="areas">${CAREERS.map((c) => `<a class="area" href="carreras/${c.slug}/" style="--c:#C8F04A"><span class="dot"></span><b>${esc(c.name)}</b><span>Pesos y cortes</span></a>`).join("")}</div>`;
    const faq = [
      ["¿Cuánto puntaje ICFES necesito para entrar a una universidad pública?", "No hay un número único. Las que usan el Saber 11 te ordenan por un puntaje ponderado según el programa, y el corte depende de cuántos se inscriben ese semestre. Algunas, como la Nacional y la de Antioquia, no usan el puntaje ICFES: tienen examen propio."],
      ["¿Qué es el puntaje ponderado?", "Es tu puntaje calculado con los pesos que el programa le da a cada prueba. Por ejemplo, para Medicina en Univalle Ciencias naturales pesa 30 % e Inglés 10 %. Se multiplica cada puntaje por su peso, se suma y se divide entre 100."],
      ["¿Sirve el puntaje global para entrar a la universidad?", "Depende de la universidad. La del Magdalena y la del Atlántico ordenan a los inscritos por el puntaje global. Univalle, la UIS o la de Caldas miran el ponderado del programa, y dos estudiantes con el mismo global pueden tener ponderados muy distintos."],
      ["¿Hay becas por puntaje ICFES?", "Sí, aunque pocas dependen solo del puntaje. El crédito Tú Eliges del ICETEX pide un puntaje global mínimo según el municipio donde presentaste, y becas como Quiero Estudiar de los Andes exigen 380 o más. Las reúne la página de becas con el puntaje ICFES."],
      ["¿De dónde salen estos datos?", `De los sitios y documentos oficiales de cada universidad, consultados el ${longDate(CHECKED)}. Cada página enlaza sus fuentes. Cóndor no está afiliado a ninguna universidad ni al ICFES.`],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Universidades</span>
  <h1>Puntaje ICFES para entrar a la universidad</h1>
  <p class="prose">Cuánto pide cada universidad pública, cómo pondera cada prueba del Saber 11 y cuál fue su último corte, con datos de sus propios sitios. Elige tu universidad o tu carrera.</p>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Por universidad</h2>
  <div class="tbl"><table><thead><tr><th>Universidad</th><th>Ciudad</th><th>Cómo admite</th></tr></thead><tbody>${uniRows}</tbody></table></div>
  <h2>Por carrera</h2>
  ${careerTiles}
  <h2>Cómo usan el ICFES las universidades</h2>
  <p class="prose">Tu reporte del Saber 11 trae un puntaje de 0 a 100 en cada prueba y un global de 0 a 500. Algunas universidades, como la del Magdalena y la del Atlántico, te ordenan por el global. Muchas otras no lo miran: cada programa le da un peso a cada prueba. Para Derecho pesa más Lectura crítica; para ingenierías, Matemáticas; para salud, Ciencias naturales. Con esos pesos calculan tu <b>puntaje ponderado</b>, te ordenan con los demás inscritos y llenan los cupos de mayor a menor.</p>
  <p class="prose">Por eso el corte cambia cada semestre: es el puntaje del último admitido. Los cortes de esta página son una referencia, no una garantía.</p>
  <p class="prose">¿Aún no tienes tus puntajes? Estímalos con un <a href="${up}simulacro-icfes/">simulacro ICFES</a> o calcula el global en la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>. Si ya presentaste, aprende a <a href="${up}resultados-icfes/">leer tus resultados</a>.</p>
  <h2>Becas y créditos con el puntaje ICFES</h2>
  <p class="prose">Tu puntaje también cuenta para pagar la carrera: el ICETEX pide un mínimo según tu municipio y algunas universidades privadas tienen becas para puntajes altos. Mira los requisitos y fechas en <a href="${up}becas-icfes/">becas con el puntaje ICFES</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, "Practica para el puntaje que necesitas")}`;
    write(path, page({
      siteUrl, path, title: "Puntaje ICFES para entrar a la universidad 2026", desc: "Cuánto puntaje ICFES pide cada universidad pública: pesos por prueba y últimos cortes de Univalle, UIS, Caldas, UTP y Unimagdalena, y cómo entrar a la Nacional.",
      body, crumbs: [{ name: "Puntaje ICFES por universidad", path }],
      jsonLd: [faqLd(faq), { "@type": "CollectionPage", name: "Puntaje ICFES para entrar a la universidad", url: siteUrl + path, inLanguage: "es-CO", dateModified: CHECKED, hasPart: [...UNIVERSITIES.map((u) => ({ "@type": "WebPage", name: u.name, url: `${siteUrl}puntaje-icfes/${u.slug}/` })), ...CAREERS.map((c) => ({ "@type": "WebPage", name: `Puntaje ICFES para ${c.name}`, url: `${siteUrl}puntaje-icfes/carreras/${c.slug}/` }))] }],
    }));
  }
}
