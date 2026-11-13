#!/usr/bin/env node
// Crawl report: which bots crawl condoricfes.com, what they fetch, and which sitemap pages they have not reached yet.
// Reads the crawler lines the worker writes (worker/index.js, "crawl": 1) from Workers Logs (kept 3 days on the free plan).
//   cd app && node scripts/crawl-report.mjs [days=3] [--json]
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (the same ones the deploy uses).
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!token || !account) { console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"); process.exit(1); }
const days = Math.min(Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3), 7);
const asJson = process.argv.includes("--json");
const to = Date.now(), from = to - days * 86400000;

async function query() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      queryId: "crawl-report", view: "events", limit: 2000, timeframe: { from, to },
      parameters: { filters: [{ key: "crawl", operation: "eq", type: "number", value: 1 }, { key: "$workers.scriptName", operation: "eq", type: "string", value: "condor" }] },
    }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result?.events?.events ?? [];
}

// The newest 2000 bot lines in the window (plenty at the site's size; shorten the window if it ever fills up).
const rows = (await query()).map((e) => {
  const s = e.source ?? {};
  return { t: e.timestamp, bot: s.bot, verified: s.verified, path: s.path, status: s.status };
});

const section = (p = "") => {
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return "/";
  if (parts[0] === "app") return "/app/";
  return `/${parts[0]}/`;
};
const count = (arr, key) => Object.entries(arr.reduce((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

const search = rows.filter((r) => r.bot === "Googlebot" || r.bot === "Bingbot");
const crawled = new Set(search.filter((r) => r.status === 200).map((r) => r.path));
const sitemapFile = join(here, "..", "site-dist", "sitemap.xml");
const sitemap = existsSync(sitemapFile) ? [...readFileSync(sitemapFile, "utf8").matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/") : [];
const notYet = sitemap.filter((p) => !crawled.has(p));

const report = {
  window: `${new Date(from).toISOString()} .. ${new Date(to).toISOString()}`,
  hits: rows.length,
  byBot: count(rows, (r) => `${r.bot}${r.verified ? " (verificado)" : ""}`),
  googleBingBySection: count(search, (r) => section(r.path)),
  googleBingByStatus: count(search, (r) => String(r.status)),
  errors: search.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.bot} ${r.path}`).slice(0, 40),
  topPaths: count(search, (r) => r.path).slice(0, 20),
  sitemapPages: sitemap.length,
  sitemapCrawledByGoogleOrBing: sitemap.length - notYet.length,
  notYetCrawled: notYet,
};
if (asJson) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`Crawl report, last ${days} day(s): ${report.hits} bot requests`);
  for (const [k, list] of Object.entries({ "By bot": report.byBot, "Google+Bing by section": report.googleBingBySection, "Google+Bing by status": report.googleBingByStatus, "Top paths": report.topPaths })) {
    console.log(`\n${k}`);
    for (const [name, n] of list) console.log(`  ${String(n).padStart(5)}  ${name}`);
  }
  if (report.errors.length) console.log(`\nErrors served to Google/Bing\n  ${report.errors.join("\n  ")}`);
  console.log(`\nSitemap pages fetched by Google or Bing: ${report.sitemapCrawledByGoogleOrBing} of ${report.sitemapPages}`);
  if (notYet.length) console.log(`Not fetched yet (first 30):\n  ${notYet.slice(0, 30).join("\n  ")}`);
}
