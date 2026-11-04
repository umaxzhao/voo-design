import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { clientModelAssetsPlugin } from "./scripts/client-model-assets.mjs";
import { editorPublicAssetsPlugin } from "./scripts/editor-public-assets.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [react(), clientModelAssetsPlugin(), editorPublicAssetsPlugin({ bundleModels: process.env.VOO_BUNDLE_MODELS === "1" || mode === "electron" }), ...(process.env.ANALYZE === "1" ? [visualizer({ filename: "analysis/bundle.html", gzipSize: true, brotliSize: true, open: false })] : [])],
  base: "./",
  resolve: {
    // ONNX loads the single public/ort copy through env.wasm.wasmPaths.
    ...(mode !== "test" ? { conditions: ["onnxruntime-web-use-extern-wasm", "module", "browser", "development|production"] } : {}),
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  // Discover the lazy inference-worker dependency before an editing session starts.
  optimizeDeps: { include: ["onnxruntime-web/webgpu"] },
  build: {
    outDir: "dist",
    copyPublicDir: false,
    sourcemap: false,
    target: "esnext",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning, warn) {
        // A split barrel cycle can change initialization order in production.
        // Reject it rather than shipping a build that only works in dev.
        if (warning.code === "CYCLIC_CROSS_CHUNK_REEXPORT") throw new Error(warning.message);
        warn(warning);
      },
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
          // Feature boundaries follow actual dynamic imports. Grouping an
          // entire feature folder here also hoists its shared engine and
          // export dependencies into an eagerly imported monolithic chunk.
        },
      },
    },
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.js"],
    environment: "node",
    include: ["tests/unit/**/*.test.{js,jsx}"],
  },
}));
