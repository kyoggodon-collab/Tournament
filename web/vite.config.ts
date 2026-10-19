import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: here,
  resolve: {
    alias: {
      "@shared": path.resolve(here, "../shared"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: path.resolve(here, "../dist"),
    emptyOutDir: true,
  },
});
