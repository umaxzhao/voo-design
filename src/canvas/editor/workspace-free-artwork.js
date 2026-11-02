import { artworkHitPath } from "./free-artwork-hit-regions.js";
import { createArtworkPicture } from "./workspace-artwork-picture.js";

/** A free document keeps world coordinates; only its raster window follows the camera. */
export function freeCanvasSurface(page, workspace, zoom) {
  const left = Math.floor(workspace.left - page.left);
  const top = Math.floor(workspace.top - page.top);
  return {
    left,
    top,
    stageWidth: Math.max(1, Math.ceil(workspace.right - page.left) - left),
    stageHeight: Math.max(1, Math.ceil(workspace.bottom - page.top) - top),
    viewport: {
      zoom,
      panX: -left,
      panY: -top
    }
  };
}
/** The transparent surface also routes signed-coordinate hits to the unchanged stage origin. */
export function attachFreeCanvasArtwork({
  canvas,
  engine,
  store,
  paintArtwork
}) {
  const stage = canvas.parentElement;
  const workspace = stage?.closest('[data-testid="editor-pages"]');
  if (!workspace) throw new Error("Free-canvas artwork requires its workspace viewport");
  const styleKeys = ["left", "top", "right", "bottom", "width", "height", "pointerEvents"];
  const originalStyles = styleKeys.map(key => canvas.style[key]);
  const hits = canvas.ownerDocument.createElement("div");
  hits.setAttribute("aria-hidden", "true");
  hits.setAttribute("data-free-canvas-hits", "");
  Object.assign(hits.style, {
    position: "absolute",
    pointerEvents: "auto"
  });
  stage.insertBefore(hits, canvas);
  let pendingFrame = 0;
  let previousDoc, previousPathKey;
  const picture = paintArtwork ? createArtworkPicture(canvas, engine) : null;
  const paint = (forceExact = false) => {
    const zoom = store.getState?.().editorCamera?.zoom ?? engine.getViewport().zoom;
    const surface = freeCanvasSurface(stage.getBoundingClientRect(), workspace.getBoundingClientRect(), zoom);
    const style = {
      left: `${surface.left}px`,
      top: `${surface.top}px`,
      right: "auto",
      bottom: "auto",
      width: `${surface.stageWidth}px`,
      height: `${surface.stageHeight}px`
    };
    Object.assign(canvas.style, style, {
      pointerEvents: "none"
    });
    Object.assign(hits.style, style);
    const doc = engine.getDocument();
    const pathKey = JSON.stringify(surface);
    if (previousDoc !== doc || previousPathKey !== pathKey) {
      hits.style.clipPath = artworkHitPath(doc, surface);
      previousDoc = doc;
      previousPathKey = pathKey;
    }
    if (paintArtwork) {
      picture.paint(surface, forceExact);
    } else if (canvas.width || canvas.height) {
      // React can retain this canvas when a decoded-media document returns to
      // native vectors. Its previous bitmap must not cover the shared GPU pass.
      canvas.width = canvas.height = 0;
    }
  };
  const schedulePaint = () => {
    if (pendingFrame) return;
    // Store listeners also move the artboard DOM. Read geometry after all of
    // them finish, so the raster and pointer plane use the same camera frame.
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      paint();
    });
  };
  const unsubscribeEngine = engine.subscribeRender(event => paint(event?.readback === true));
  const unsubscribeStore = store.subscribe((state, previous) => {
    if (state.editorCamera !== previous.editorCamera) schedulePaint();
  });
  const observer = new ResizeObserver(schedulePaint);
  observer.observe(workspace);
  observer.observe(stage);
  paint();
  return {
    paint: () => paint(true),
    dispose() {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      unsubscribeEngine();
      unsubscribeStore();
      observer.disconnect();
      picture?.dispose();
      hits.remove();
      for (const [index, key] of styleKeys.entries()) canvas.style[key] = originalStyles[index];
    }
  };
}
