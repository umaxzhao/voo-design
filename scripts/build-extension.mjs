/**
 * Bundle the web-image extension into extension/dist.
 * Chrome loads the unpacked extension/ folder after this runs.
 */
import { build } from "vite";

await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: "extension/dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: "extension/background_main.js",
      output: {
        format: "es",
        entryFileNames: "background.js",
        inlineDynamicImports: true,
      },
    },
  },
});

await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: "extension/dist",
    emptyOutDir: false,
    target: "esnext",
    rollupOptions: {
      input: "src/content/content_main.js",
      output: {
        format: "iife",
        entryFileNames: "content.js",
        inlineDynamicImports: true,
        name: "VooWebImageContent",
      },
    },
  },
});
