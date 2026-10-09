import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // icfes_figures/ lives one level up in the repo; dev needs permission to serve it.
  server: { fs: { allow: [".."] } },
  // render.js is a UMD module (module.exports in Node); let the bundler treat it as CommonJS.
  build: { commonjsOptions: { include: [/node_modules/, /icfes_figures/] } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
