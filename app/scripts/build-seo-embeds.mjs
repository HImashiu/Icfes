// Things other sites can put on their own pages, so schools, teachers and blogs have a reason to link to Cóndor:
//   insertar/               "Para tu página": the calculator embed, the school badge and the percentile table, with
//                           copy-paste snippets. Every snippet carries a plain text link to condoricfes.com that sits
//                           on the other site's page (a link inside an iframe does not count for that page).
//   insertar/calculadora/   the score calculator alone, small enough for an iframe (noindex, canonical = calculator).
//                           Needs its own frame headers in _headers (the rest of the site stays frame-ancestors 'none').
//   datos/percentiles-saber-11/  national percentiles per test and global, from the ICFES open data, with a CSV.
// Called from build-seo.mjs. The badge image is public/brand/sello-condor.png (drawn once from the landing's styles).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PCTS = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 99];

// The score at which a given share of the country scored lower (same rule as the calculator page).
function scoreAt(entry, pct) {
  const n = entry.counts.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < entry.counts.length; i++) {
    if ((acc / n) * 100 >= pct) return entry.min + i;
    acc += entry.counts[i];
  }
  return entry.min + entry.counts.length - 1;
}

const fmtN = (n) => n.toLocaleString("es-CO");
// A snippet as the reader will paste it: shown escaped inside <pre>, copied by the button from data-copy.
const snippet = (esc, id, code) => `<div class="snip"><pre id="${id}"><code>${esc(code)}</code></pre><button type="button" class="btn btn-ghost btn-sm" data-copy="${id}">Copiar código</button></div>`;

export function buildEmbedPages({ siteUrl, out, write, page, esc, faqBlock, faqLd, cta, saber11, national }) {
  const urls = [];
  const { TESTS, NATIONAL_SOURCE } = saber11;
  const cols = [{ id: "global", name: "Global (0 a 500)" }, ...TESTS.map((t) => ({ id: t.id, name: t.name }))];
  const total = national.global.counts.reduce((a, b) => a + b, 0);

  // ------------------------------------------------------------ percentile table + CSV
  {
    const path = "datos/percentiles-saber-11/";
    const csvName = "percentiles-saber-11-2022.csv";
    const csv = [["percentil", ...cols.map((c) => c.id)].join(","), ...PCTS.map((p) => [p, ...cols.map((c) => scoreAt(national[c.id], p))].join(","))].join("\n") + "\n";
    mkdirSync(join(out, path), { recursive: true });
    writeFileSync(join(out, path, csvName), csv);
    const rows = PCTS.map((p) => `<tr><td>${p === 50 ? "50 (mediana)" : p}</td>${cols.map((c) => `<td>${scoreAt(national[c.id], p)}</td>`).join("")}</tr>`).join("");
    const faq = [
      ["¿De dónde salen estos datos?", `De los datos abiertos del ICFES en datos.gov.co: ${esc(NATIONAL_SOURCE)}. Contamos cuántos estudiantes sacaron cada puntaje y buscamos el puntaje que deja atrás a cada porcentaje del país.`],
      ["¿Qué significa el percentil?", "El percentil 75 es el puntaje que supera el 75 % de los estudiantes. Si sacaste ese puntaje, estás en el 25 % más alto del país."],
      ["¿Puedo usar la tabla en mi página o en una clase?", "Sí. Cita la fuente (ICFES, datos abiertos) y enlaza esta página. También puedes descargar el CSV."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Datos</span>
  <h1>Percentiles del Saber 11: qué puntaje supera a cuántos</h1>
  <p class="prose">Esta tabla dice qué puntaje necesitas para quedar por encima de cada porcentaje de estudiantes del país, en el global y en cada prueba. Sale de los resultados de los ${fmtN(total)} estudiantes de calendario A que presentaron el Saber 11 en 2022.</p>
</div></section>
<section class="wrap narrow guide-body">
  <div class="tbl"><table><thead><tr><th>Percentil</th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
  <p class="source">Fuente: ${esc(NATIONAL_SOURCE)}. Cálculo de Cóndor. <a href="${csvName}" download>Descargar CSV</a>.</p>
  <p class="prose">Para ver tu propio percentil escribe tus puntajes en la <a href="../../calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>. Si quieres saber qué significa cada rango, mira los <a href="../../niveles-de-desempeno-icfes/">niveles de desempeño</a>.</p>
  <h2>Usar esta tabla</h2>
  <p class="prose">Puedes copiarla en tu página, en una guía o en una presentación. Solo cita la fuente y enlaza esta página. Si tienes un sitio de colegio o un blog, también puedes <a href="../../insertar/">insertar la calculadora</a>.</p>
  ${snippet(esc, "snip-datos", `Fuente: ICFES, datos abiertos Saber 11 2022. Tabla de percentiles de Cóndor: ${siteUrl}${path}`)}
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta("../../", "Mide en qué percentil estás con un simulacro")}`;
    write(path, page({
      siteUrl, path, title: "Percentiles del Saber 11 (ICFES 2022) por prueba | Cóndor",
      desc: `Qué puntaje del ICFES supera a cada porcentaje del país, en el global y por prueba. Datos abiertos del ICFES, ${fmtN(total)} estudiantes. Con CSV.`,
      body, crumbs: [{ name: "Percentiles del Saber 11", path }], script: "insertar.js",
      jsonLd: [faqLd(faq), {
        "@type": "Dataset", name: "Percentiles del Saber 11, calendario A 2022",
        description: "Puntaje que corresponde a cada percentil nacional en el puntaje global y en cada prueba del Saber 11, calculado a partir de los datos abiertos del ICFES.",
        url: siteUrl + path, inLanguage: "es-CO", isAccessibleForFree: true, temporalCoverage: "2022", spatialCoverage: "Colombia",
        creator: { "@type": "Organization", name: "Cóndor", url: siteUrl },
        isBasedOn: "https://www.datos.gov.co/d/kgxf-xxbe", license: "https://creativecommons.org/licenses/by/4.0/",
        variableMeasured: cols.map((c) => c.name),
        distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${siteUrl}${path}${csvName}` }],
      }],
    }));
    urls.push(path);
  }

  // ------------------------------------------------------------ calculator for iframes
  {
    const path = "insertar/calculadora/";
    const inputs = TESTS.map((t) => `<label><span>${esc(t.name)}</span><input type="number" inputmode="numeric" min="0" max="100" step="1" name="${t.id}" placeholder="0-100" /></label>`).join("");
    const levelsJson = Object.fromEntries(TESTS.map((t) => [t.id, t.levels.map((l) => [l.label, l.from, l.to])]));
    const dist = Object.fromEntries(Object.entries(national).map(([k, v]) => [k, { min: v.min, counts: v.counts }]));
    const link = `${siteUrl}calculadora-puntaje-icfes/?fuente=insertar-calculadora`;
    mkdirSync(join(out, path), { recursive: true });
    writeFileSync(join(out, path, "index.html"), `<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Calculadora del puntaje ICFES · Cóndor</title>
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="${siteUrl}calculadora-puntaje-icfes/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    *{box-sizing:border-box}html,body{margin:0}
    body{font:500 15px/1.4 Figtree,system-ui,sans-serif;color:#0D110F;background:#F6F3EA;padding:14px}
    .box{border:2px solid #0D110F;border-radius:18px;background:#fff;padding:14px;max-width:640px;margin:0 auto}
    h1{font:800 20px/1.1 "Bricolage Grotesque",system-ui,sans-serif;text-transform:uppercase;margin:0 0 10px}
    h1 span{display:inline-block;background:#C8F04A;border:2px solid #0D110F;border-radius:8px;padding:0 6px;transform:rotate(-2deg)}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
    label{display:flex;flex-direction:column;gap:3px;font-weight:700;font-size:13px}
    input{font:inherit;font-size:16px;padding:8px 10px;border:2px solid #0D110F;border-radius:10px;background:#F6F3EA;width:100%}
    input:focus{outline:3px solid #C8F04A;outline-offset:1px}input[aria-invalid]{border-color:#c0392b}
    .out{margin-top:12px;display:grid;gap:8px}
    .big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;background:#0D110F;color:#F6F3EA;border-radius:14px;padding:10px 14px}
    .big b{font:800 34px/1 "Bricolage Grotesque",system-ui,sans-serif;color:#C8F04A}.big small{font-size:13px}
    ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
    li{display:grid;grid-template-columns:1fr auto auto;gap:10px;font-size:13px;border-bottom:1px solid #e4e0d4;padding:3px 0}
    li small{color:#555}
    .foot{margin:10px 0 0;font-size:12px;color:#444;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
    .foot a{color:#0D110F;font-weight:800}
  </style>
</head>
<body>
  <div class="box">
    <h1>Calculadora del <span>puntaje ICFES</span></h1>
    <form id="calc" novalidate>
      <div class="grid">${inputs}</div>
      <div class="out" aria-live="polite">
        <div class="big"><span>Global</span><b id="calc-global">–</b><small id="calc-gpct">Llena las cinco pruebas</small></div>
        <ul id="calc-levels"></ul>
      </div>
    </form>
    <p class="foot"><span>Percentiles: ICFES, Saber 11 2022.</span><a href="${link}" target="_blank" rel="noopener">Hecha por Cóndor ↗</a></p>
  </div>
  <script type="application/json" id="calc-data">${JSON.stringify({ levels: levelsJson, dist })}</script>
  <script src="../../calc.js" defer></script>
</body>
</html>
`);
    // Not in the sitemap: it is a frame, not a page to rank.
  }

  // ------------------------------------------------------------ "Para tu página"
  {
    const path = "insertar/";
    const calcCode = `<iframe src="${siteUrl}insertar/calculadora/" title="Calculadora del puntaje ICFES" width="100%" height="520" style="border:0;max-width:640px" loading="lazy"></iframe>
<p style="font-size:14px">Calculadora del <a href="${siteUrl}calculadora-puntaje-icfes/">puntaje ICFES</a> hecha por Cóndor.</p>`;
    const badgeCode = `<a href="${siteUrl}?fuente=sello" title="Practicamos el Saber 11 con Cóndor"><img src="${siteUrl}brand/sello-condor.png" alt="Practicamos el Saber 11 con Cóndor" width="200" height="64" /></a>`;
    const linkCode = `<a href="${siteUrl}examenes-icfes-anteriores/">Exámenes ICFES anteriores para resolver en línea</a> (Cóndor)`;
    const faq = [
      ["¿Tiene costo?", "No. Puedes insertar la calculadora, el sello y la tabla en tu página sin pagar nada y sin crear cuenta."],
      ["¿Se ve bien en celular?", "Sí. La calculadora se ajusta al ancho de tu página. Si queda cortada, sube el alto del iframe (height) a 600."],
      ["¿Recogen datos de mis visitantes?", "La calculadora no guarda nada de lo que escriben: el cálculo se hace en el navegador de cada persona."],
      ["Mi colegio usa Cóndor, ¿dónde va el sello?", "Donde tengan la información de la prueba Saber 11 o los recursos para estudiantes. Lo ven las familias y los estudiantes nuevos."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Para tu página</span>
  <h1>Pon la calculadora ICFES en la página de tu colegio</h1>
  <p class="prose">Si tienes la página de un colegio, un blog o un aula virtual, puedes poner aquí lo mismo que usan nuestros estudiantes: la calculadora del puntaje ICFES, la tabla de percentiles del país o el sello de Cóndor. Copias el código y lo pegas.</p>
</div></section>
<section class="wrap narrow guide-body">
  <style>.snip{position:relative;margin:10px 0 22px}.snip pre{white-space:pre-wrap;word-break:break-all;background:#0D110F;color:#F6F3EA;border-radius:14px;padding:14px 16px;font-size:13px;line-height:1.5;margin:0 0 8px}.sello-ej{display:inline-block;margin:6px 0 4px}</style>
  <h2>Calculadora del puntaje ICFES</h2>
  <p class="prose">Tus estudiantes escriben sus puntajes de 0 a 100 y ven su global de 0 a 500, su nivel en cada prueba y su percentil en el país. Funciona en celular. <a href="calculadora/" target="_blank" rel="noopener">Mira cómo se ve</a>.</p>
  ${snippet(esc, "snip-calc", calcCode)}
  <h2>Sello «Practicamos con Cóndor»</h2>
  <p class="prose">Para los colegios que preparan el Saber 11 con Cóndor. Va en la página de la prueba o de recursos para estudiantes.</p>
  <p class="sello-ej"><img src="../brand/sello-condor.png" alt="Practicamos el Saber 11 con Cóndor" width="200" height="64" /></p>
  ${snippet(esc, "snip-sello", badgeCode)}
  <h2>Tabla de percentiles del Saber 11</h2>
  <p class="prose">La <a href="../datos/percentiles-saber-11/">tabla de percentiles</a> dice qué puntaje supera a cada porcentaje del país, por prueba, con datos abiertos del ICFES. Puedes copiarla o descargar el CSV citando la fuente.</p>
  <h2>Un enlace a los exámenes anteriores</h2>
  <p class="prose">Si tu página tiene una lista de recursos para el Icfes, este enlace lleva a los <a href="../examenes-icfes-anteriores/">exámenes ICFES anteriores</a> completos para resolver en línea.</p>
  ${snippet(esc, "snip-link", linkCode)}
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
  <p class="prose">¿Eres docente y quieres usar Cóndor con tus cursos? Mira <a href="../preicfes-para-colegios/">Cóndor para colegios</a>.</p>
</section>
${cta("../", "Prueba un simulacro antes de recomendarlo")}`;
    write(path, page({
      siteUrl, path, title: "Calculadora ICFES y sello para tu página | Cóndor",
      desc: "Inserta gratis la calculadora del puntaje ICFES, la tabla de percentiles del Saber 11 o el sello de Cóndor en la página de tu colegio o tu blog.",
      body, crumbs: [{ name: "Para tu página", path }], script: "insertar.js",
      jsonLd: [faqLd(faq), { "@type": "WebPage", name: "Calculadora ICFES y sello para tu página", url: siteUrl + path, inLanguage: "es-CO" }],
    }));
    urls.push(path);
  }
  return urls;
}
