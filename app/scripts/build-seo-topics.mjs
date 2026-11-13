// Topic pages: preguntas-icfes/<area>/<topic>/, one per topic in seo-bank/topics.mjs. Each has a short explainer
// (what the ICFES asks, what to know, common mistakes, FAQ) and the solved questions tagged with that topic
// ("topico" in seo-bank/solved.json): the first few to answer on the page, all of them as links to their own page.
// Called from build-seo-bank.mjs, which passes the published solved questions and its card renderer, and which
// counts every public question (the cap) after these pages are written.
import { TOPICS } from "./seo-bank/topics.mjs";
import { AREA_SLUG } from "./seo-bank/common.mjs";

const CARDS = 3; // questions to answer on the page; the rest are links
const MIN_QUESTIONS = 3; // a topic with fewer published questions gets no page yet

export const topicPath = (t) => `preguntas-icfes/${AREA_SLUG[t.area]}/${t.slug}/`;

// Topics that have a page, given the published solved questions: [{ ...topic, path, items }].
export function liveTopics(items) {
  return TOPICS.map((t) => ({ ...t, path: topicPath(t), items: items.filter((it) => it.s.topico === t.slug && it.area === t.area) }))
    .filter((t) => t.items.length >= MIN_QUESTIONS);
}

export function buildTopicPages(ctx, items, { cardHtml, questionLd, appArea, examOf, clip }) {
  const topics = liveTopics(items);
  const esc = ctx.esc;
  for (const t of topics) {
    if (`${t.title} | Cóndor`.length > 60) throw new Error(`[build-seo-topics] title too long: ${t.title}`);
    const up = "../../../";
    const areaSlug = AREA_SLUG[t.area];
    const color = ctx.AREAS.find((a) => a.name === t.area)?.color ?? "#C8F04A";
    const shown = t.items.slice(0, CARDS);
    const cards = shown.map((it) => cardHtml(ctx, it, { full: false, up })).join("\n");
    if (cards.includes('class="katex')) ctx.markKatex();
    const siblings = topics.filter((x) => x.area === t.area && x !== t);
    const faq = t.faq.map(([q, a]) => [q, esc(a)]);
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${color}">${esc(t.area)}</span>
  <h1>${esc(t.h1)}</h1>
  <p class="prose">${esc(t.intro)}</p>
  <p class="prose">Abajo tienes ${t.items.length} preguntas reales del ICFES sobre ${esc(t.name.toLowerCase())}, cada una con su respuesta y la explicación paso a paso.</p>
  <div class="cta-row"><a class="btn btn-primary" href="${appArea(up, areaSlug)}">Practicar ${esc(t.area)} en la app</a></div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Lo que tienes que saber</h2>
  <ul class="checks">
    ${t.ideas.map((x) => `<li>${esc(x)}</li>`).join("\n    ")}
  </ul>
  <h2>Errores comunes</h2>
  <ul class="checks">
    ${t.errores.map((x) => `<li>${esc(x)}</li>`).join("\n    ")}
  </ul>
  <h2>Responde estas preguntas</h2>
</section>
<section class="qlist wrap narrow" aria-label="Preguntas de ${esc(t.name)}">
${cards}
</section>
<section class="wrap narrow guide-body">
  <h2>Todas las preguntas de ${esc(t.name.toLowerCase())} resueltas (${t.items.length})</h2>
  <ul class="checks">
    ${t.items.map((x) => `<li><a href="${up}${x.path}"><b>${esc(x.s.titulo)}</b></a> <span>· ${esc(x.s.corta)} · ${esc(examOf(x.s.exam).name)}</span></li>`).join("\n    ")}
  </ul>
  ${siblings.length ? `<h2>Otros temas de ${esc(t.area)}</h2>\n  <p class="prose">${siblings.map((x) => `<a href="${up}${x.path}">${esc(x.name)}</a>`).join(" · ")}</p>` : ""}
  <p class="prose">También: <a href="${up}preguntas-icfes/${areaSlug}/">preguntas de ${esc(t.area)} para responder</a>, todas las <a href="${up}pregunta-icfes/${areaSlug}/">preguntas de ${esc(t.area)} resueltas</a> y el <a href="${up}simulacro-icfes/${areaSlug}/">mini simulacro de ${esc(t.area)}</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${ctx.faqBlock(faq)}
</section>
${ctx.cta(up, `¿Quieres practicar más ${esc(t.area)}?`).replace(`href="${up}app/?empezar=1"`, `href="${appArea(up, areaSlug)}"`)}`;
    ctx.write(t.path, ctx.page({
      siteUrl: ctx.siteUrl, path: t.path, title: `${t.title} | Cóndor`, desc: clip(t.desc), body, katex: cards.includes('class="katex'),
      crumbs: [{ name: "Preguntas ICFES", path: "preguntas-icfes/" }, { name: t.area, path: `preguntas-icfes/${areaSlug}/` }, { name: t.name, path: t.path }],
      jsonLd: [
        ctx.faqLd(faq),
        { "@type": "CollectionPage", name: t.h1, description: t.desc, url: ctx.siteUrl + t.path, inLanguage: "es-CO",
          about: { "@type": "Thing", name: `${t.name} · Saber 11 · ${t.area}` },
          hasPart: [
            { "@type": "Quiz", name: `Preguntas de ${t.name.toLowerCase()} tipo ICFES`, inLanguage: "es-CO", educationalLevel: "Grado 11", isAccessibleForFree: true,
              citation: "ICFES, Saber 11, cuadernillos publicados", hasPart: shown.map((it) => questionLd(it, ctx.siteUrl, false)) },
            ...t.items.map((x) => ({ "@type": "Quiz", name: x.s.titulo, url: ctx.siteUrl + x.path })),
          ] },
      ],
    }));
  }
  return topics;
}
