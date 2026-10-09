import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
