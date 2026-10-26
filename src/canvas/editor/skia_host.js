import { wasmEngineEnabled } from '../../engine-wasm/editor-index.js';
import { createWasmSkiaFrames } from '../../engine-wasm/skia-frame.js';
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
import { visibleWorldRect } from "./viewport_culling.js";
import { WORKSPACE_BACKGROUND } from "./render_canvas_base.js";
import { createSkiaRectPreview } from "./skia-rect-preview.js";

/** How long a frame waits on pictures before painting without them. */
const RESOURCE_TIMEOUT_MS = 3000;

/**
 * Keep the canvas element's CSS box in sync with the stage.
 *
 * A stale CSS size (the backing store can be unchanged while the stage grows)
 * leaves the painted canvas smaller than the workspace — the reported
 * "canvas offset". Exported for the regression test.
 */
export function syncCanvasCssSize(canvas, width, height) {
  if (!canvas?.style) return;
  const cssWidth = `${Math.max(1, Math.round(width))}px`;
  const cssHeight = `${Math.max(1, Math.round(height))}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
}

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

  const wasmFrames = createWasmSkiaFrames();
  const rectPreview = createSkiaRectPreview();
  let lastPixelWidth = 0;
  let lastPixelHeight = 0;

  let resourceRevision = 0;
  let lastScene = null;
  let latestFrame = null;
  let disposed = false;

  function present(frame) {
    if (rectPreview.draw(instance, frame)) return;
    if (!wasmFrames.draw(instance, frame.docs, frame.nativeIndex, frame.viewport,
        frame.visibleRect, frame.snapshot.backgroundColor, frame.layouts)) {
      instance.render(frame.snapshot, frame.viewport);
    }
  }

  return {
    backend,
    instance,

    /**
     * Hands Skia a typeface. It ships with none, so text draws nothing until
     * a family the scene names has been registered — and it wants the raw
     * TTF/OTF bytes, not the woff2 a browser would take.
     */
    registerFont(family, bytes) {
      instance.registerFont(family, bytes);
    },

    /**
     * Resizes the surface only when physical pixel dimensions change.
     * Prevents expensive GPU context and surface recreation during pan/zoom.
     */
    resize(width, height, devicePixelRatio) {
      const dpr = devicePixelRatio || 1;
      const pw = Math.max(1, Math.round(width * dpr));
      const ph = Math.max(1, Math.round(height * dpr));
      // CSS size must always track the stage, even when the backing store is
      // unchanged (see syncCanvasCssSize).
      syncCanvasCssSize(canvas, width, height);
      if (pw === lastPixelWidth && ph === lastPixelHeight) return;
      lastPixelWidth = pw;
      lastPixelHeight = ph;
      instance.resize(width, height, dpr);
    },

    /**
     * Paints the given documents as frames laid out along one axis or explicit layouts.
     *
     * `revision` only has to change when the scene does; the renderer uses it
     * to decide whether its resource cache is still valid.
     */
    async draw({
      docs,
      viewport,
      axis = "horizontal",
      resolveImageUrl,
      backgroundColor,
      revision,
      layouts = null,
      spatialIndex = null,
    }) {
      const panX = viewport?.panX ?? viewport?.x ?? 0;
      const panY = viewport?.panY ?? viewport?.y ?? 0;
      const zoom = viewport?.zoom ?? 1;
      const dpr =
        viewport?.devicePixelRatio ??
        (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

      const skiaViewport = {
        x: panX,
        y: panY,
        zoom,
        panX,
        panY,
        width: viewport?.width ?? 1024,
        height: viewport?.height ?? 768,
        devicePixelRatio: dpr,
      };

      let visibleRect = null;
      if (skiaViewport.width && skiaViewport.height) {
        visibleRect = visibleWorldRect(
          skiaViewport,
          skiaViewport.width,
          skiaViewport.height,
        );
      }

      const suppliedIndex = spatialIndex ??
        (docs.length === 1 ? docs[0]?.spatialIndex : null);
      // Keep the default-off camera path synchronous.
      const nativeIndex = wasmEngineEnabled() || suppliedIndex?.drawList
        ? await wasmFrames.prepare(docs, suppliedIndex) : suppliedIndex;
      const snapshot = {
        revision,
        // Fill opaque GPU surfaces with the editor's themed workspace ground.
        backgroundColor: backgroundColor ?? WORKSPACE_BACKGROUND,
        gridMode: "none",
        elements: documentsToScene(docs, {
          axis,
          resolveImageUrl,
          layouts,
          spatialIndex: nativeIndex,
          visibleRect,
        }),
      };
      const resourcesChanged = !lastScene || lastScene.revision !== revision ||
        lastScene.docs.length !== docs.length ||
        docs.some((doc, index) => doc !== lastScene.docs[index]);
      lastScene = { revision, docs: [...docs] };
      latestFrame = { snapshot, viewport: skiaViewport, docs, nativeIndex, visibleRect, layouts };
      instance.updateResources(snapshot);
      // Present the camera immediately with resources already available. Never
      // hold a zoom frame behind image/font decoding while chrome moves on.
      present(latestFrame);
      // Resource completion may repaint, but must use the newest camera. Camera
      // frames neither wait for decoding nor register another completion draw.
      if (resourcesChanged) {
        const currentResources = ++resourceRevision;
        const needsResources = snapshot.elements.some(element =>
          ["image", "text"].includes(element.nodeType) || element.imageUrl || element.imageUrls?.length ||
          element.fills?.some(fill => fill.type === "image" || fill.kind === "image"));
        // Geometry/paint edits do not decode resources. Waiting on an empty
        // load queue schedules a second identical GPU draw on every drag frame.
        if (!needsResources) return snapshot;
        await instance.waitForResources(snapshot, RESOURCE_TIMEOUT_MS);
        if (!disposed && currentResources === resourceRevision) {
          present(latestFrame);
        }
      }
      return snapshot;
    },

    dispose() {
      rectPreview.dispose();
      disposed = true;
      ++resourceRevision;
      wasmFrames.clear();
      instance.dispose();
    },
  };
}
