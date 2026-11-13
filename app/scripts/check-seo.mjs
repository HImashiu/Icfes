// Checks every page in sitemap.xml after a site build (called at the end of scripts/build-site.mjs; also
// `node scripts/check-seo.mjs [site-dist]`). Errors stop the build; warnings are printed.
//  - title present and at most 60 characters; description 50-160 characters (warning)
//  - exactly one <h1>; canonical equals the page's URL
//  - every JSON-LD block parses, each node has an @type; Quiz questions carry an acceptedAnswer
//  - at least 1 link to the page from another page's main content (3 or more recommended), so nothing is orphaned
//  - no links to /privacidad.html (it redirects) and every sitemap URL is a real file
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

export function checkSeo(out) {
  const errors = [], warns = [];
  const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const site = locs[0];
  const pathOf = (u) => u.slice(site.length);
  const fileOf = (p) => (p === "" || p.endsWith("/")) ? join(out, p, "index.html") : (existsSync(join(out, p + ".html")) ? join(out, p + ".html") : join(out, p));
  const pages = new Map();
  for (const u of locs) {
    const p = pathOf(u), f = fileOf(p);
    if (!existsSync(f)) { errors.push(`${p || "/"}: in sitemap but no file`); continue; }
    pages.set(p, readFileSync(f, "utf8"));
  }
  const inbound = new Map([...pages.keys()].map((p) => [p, new Set()]));
  const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
  for (const [p, html] of pages) {
    const where = p || "/";
    const title = unesc((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").trim();
    if (!title) errors.push(`${where}: no <title>`);
    else if ([...title].length > 60) errors.push(`${where}: title has ${[...title].length} characters (max 60): ${title}`);
    const desc = unesc((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
    if (desc.length < 50 || desc.length > 160) warns.push(`${where}: description has ${desc.length} characters (50-160 suggested)`);
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) errors.push(`${where}: ${h1} <h1> elements (need exactly 1)`);
    const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (canon !== site + p) errors.push(`${where}: canonical is ${canon || "missing"}, expected ${site + p}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let data;
      try { data = JSON.parse(m[1]); } catch (e) { errors.push(`${where}: JSON-LD does not parse (${e.message})`); continue; }
      const nodes = data["@graph"] ?? [data];
      for (const n of nodes) {
        if (!n["@type"]) errors.push(`${where}: JSON-LD node without @type`);
        if (n["@type"] === "Quiz") for (const q of [].concat(n.hasPart ?? [])) if (q["@type"] === "Question" && !q.acceptedAnswer) errors.push(`${where}: Quiz question without acceptedAnswer`);
      }
    }
    if (/href="[^"]*privacidad\.html"/.test(html)) warns.push(`${where}: links to privacidad.html (use privacidad)`);
    const main = (html.match(/<main[^>]*>([\s\S]*)<\/main>/) || [])[1] || "";
    const body = main.replace(/<nav class="crumbs[\s\S]*?<\/nav>/, "");
    const base = p === "" || p.endsWith("/") ? p : posix.dirname(p) + "/";
    for (const [, h] of body.matchAll(/href="([^"#?]+)/g)) {
      if (/^(https?:|mailto:|tel:|\/\/)/.test(h)) continue;
      let t = posix.normalize(posix.join("/" + base, h)).slice(1);
      if (h.endsWith("/") && !t.endsWith("/")) t += "/";
      if (t === "./" || t === ".") t = "";
      if (inbound.has(t) && t !== p) inbound.get(t).add(p);
    }
  }
  for (const [p, from] of inbound) {
    if (p === "" || p === "privacidad") continue;
    if (from.size === 0) errors.push(`${p}: orphan (no link from another page's main content)`);
    else if (from.size < 3) warns.push(`${p}: only ${from.size} contextual link(s) in`);
  }
  return { errors, warns, pages: pages.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..", "site-dist");
  const { errors, warns, pages } = checkSeo(out);
  for (const w of warns) console.warn(`[check-seo] warn: ${w}`);
  for (const e of errors) console.error(`[check-seo] ERROR: ${e}`);
  console.log(`[check-seo] ${pages} pages, ${errors.length} errors, ${warns.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
