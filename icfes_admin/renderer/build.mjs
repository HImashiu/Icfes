// Bundles the student app's renderer for the admin page into ../static/.
// The sources in src/ are copies of the app's lib files (claude/app-prototype-0f98ww, app/src/lib/).
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const out = new URL("../static/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["src/entry.js"],
  bundle: true,
  format: "iife",
  minify: true,
  loader: { ".css": "empty" },
  outfile: `${out}render.bundle.js`,
});
cpSync("node_modules/katex/dist/katex.min.css", `${out}katex/katex.min.css`);
cpSync("node_modules/katex/dist/fonts", `${out}katex/fonts`, { recursive: true });
console.log("renderer built into", out);
