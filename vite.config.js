import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    target: "esnext",
    chunkSizeWarningLimit: 2000,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.{js,jsx}"],
  },
});
