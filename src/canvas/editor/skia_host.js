/**
 * The Skia renderer, wired to this application.
 *
 * Two things the shared package deliberately does not decide: where its
 * runtime lives, and what a document looks like. This module answers both —
 * the asset URLs for however the editor is being served, and the scene built
 * by `skia_scene_adapter` — and hands back something the editor can draw a
 * frame with.
 *
 * Loaded on demand: the wasm is several megabytes, so nothing here is paid for
 * until a caller actually asks to render through Skia.
 */

import { assetUrl } from "../asset_url.js";
import { documentsToScene } from "./skia_scene_adapter.js";

/** How long a frame waits on pictures before painting without them. */
const RESOURCE_TIMEOUT_MS = 3000;

let modulePromise = null;

/**
 * Where canvaskit.js and canvaskit.wasm sit for the build doing the asking.
 *
 * The runtime is fetched once, so this has to be right before the first load
 * rather than corrected after it. `assetUrl` already knows how each build
 * serves its public directory — the extension from the origin root, the
 * hosted editor from /editor/ — so it answers for both.
 */
function assetUrls() {
  return { script: assetUrl("canvaskit.js"), wasm: assetUrl("canvaskit.wasm") };
}

async function loadModules() {
  modulePromise ??= import("@voo/canvas-core").then((core) => {
    core.setCanvasKitAssetUrls(assetUrls());
    return core;
  });
  return modulePromise;
}

/**
 * Brings up a renderer on one canvas.
 *
 * Answers the backend it settled on — CanvasKit falls back to a software
 * surface where WebGL is unavailable, and the caller may want to say so.
 */
export async function createSkiaHost(canvas) {
  const core = await loadModules();
  const instance = new core.SkiaRenderer();
  const backend = await instance.initialize(canvas);

  return {
    backend,

    /**
     * Hands Skia a typeface. It ships with none, so text draws nothing until
     * a family the scene names has been registered — and it wants the raw
     * TTF/OTF bytes, not the woff2 a browser would take.
     */
    registerFont(family, bytes) {
      instance.registerFont(family, bytes);
    },

    resize(width, height, devicePixelRatio) {
      instance.resize(width, height, devicePixelRatio);
    },

    /**
     * Paints the given documents as frames laid out along one axis.
     *
     * `revision` only has to change when the scene does; the renderer uses it
     * to decide whether its resource cache is still valid.
     */
    async draw({
      docs,
      viewport,
      axis,
      resolveImageUrl,
      backgroundColor,
      revision,
    }) {
      const snapshot = {
        revision,
        backgroundColor: backgroundColor ?? "#1c1c1c",
        gridMode: "none",
        elements: documentsToScene(docs, { axis, resolveImageUrl }),
      };
      instance.updateResources(snapshot);
      // Pictures decode off-thread; drawing before they land paints holes.
      // The wait is bounded so one unreachable picture cannot stall the frame.
      await instance.waitForResources(snapshot, RESOURCE_TIMEOUT_MS);
      instance.render(snapshot, viewport);
      return snapshot;
    },

    dispose() {
      instance.dispose();
    },
  };
}
