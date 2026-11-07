// Builds only the sample page (the figure engine is CommonJS, so it needs a build, not the dev server).
// npx vite build --config scripts/booklet-sample/vite.sample.config.js --outDir <dir>
import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config.js";

export default mergeConfig(base, defineConfig({
  build: { copyPublicDir: false, emptyOutDir: true, rollupOptions: { input: "scripts/booklet-sample/index.html" } },
}));
