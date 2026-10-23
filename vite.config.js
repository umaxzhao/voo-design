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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) {
              return "react-vendor";
            }
            if (id.includes("onnxruntime-web")) return "ort-vendor";
            if (id.includes("ag-psd")) return "psd-vendor";
            if (id.includes("canvaskit-wasm")) return "canvaskit-vendor";
            if (id.includes("lucide-react")) return "icons-vendor";
            if (id.includes("zustand")) return "state-vendor";
            return "vendor";
          }
          if (id.includes("/src/canvas/components/presentation/")) return "presentation";
          if (id.includes("/src/canvas/components/editor_properties/")) return "properties";
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.{js,jsx}"],
  },
});
