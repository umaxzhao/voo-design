import { nodeAABB } from "./scene_geometry.js";
import { isHiddenByGroup } from "./scene_model.js";
import { createFrameClipContext } from "./frame-clip-context.js";
import { createHitRegionCache } from "./hit-region-path.js";

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
function artworkHitPath(doc, surface, cachedPath) {
  const {
    zoom,
    panX,
    panY
  } = surface.viewport;
  let clips;
  return cachedPath(doc.nodes, JSON.stringify(surface), node => {
    if (node.visible === false || isHiddenByGroup(doc, node)) return null;
    const box = nodeAABB(node);
    if (![box?.x, box?.y, box?.width, box?.height].every(Number.isFinite)) return null;
    let left = box.x,
      top = box.y,
      right = box.x + box.width,
      bottom = box.y + box.height;
    clips ??= createFrameClipContext(doc.nodes);
    for (const ancestor of clips.framesOf(node)) {
      const clip = nodeAABB(ancestor);
      left = Math.max(left, clip.x);
      top = Math.max(top, clip.y);
      right = Math.min(right, clip.x + clip.width);
      bottom = Math.min(bottom, clip.y + clip.height);
    }
    if (right <= left || bottom <= top) return null;
    // Match the existing screen-space handle reach without giving a focused
    // document an opaque hit plane over every neighbouring document.
    left = left * zoom + panX - 8;
    top = top * zoom + panY - 8;
    right = right * zoom + panX + 8;
    bottom = bottom * zoom + panY + 8;
    if (right < 0 || bottom < 0 || left > surface.stageWidth || top > surface.stageHeight) return null;
    return {
      left,
      top,
      right,
      bottom
    };
  });
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
  const cachedPath = createHitRegionCache();
  const paint = () => {
    const surface = freeCanvasSurface(stage.getBoundingClientRect(), workspace.getBoundingClientRect(), engine.getViewport().zoom);
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
      hits.style.clipPath = artworkHitPath(doc, surface, cachedPath);
      previousDoc = doc;
      previousPathKey = pathKey;
    }
    if (paintArtwork) {
      engine.renderLayerPass(canvas, doc.nodes.map(node => node.id), surface);
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
  const unsubscribeEngine = engine.subscribeRender(paint);
  const unsubscribeStore = store.subscribe((state, previous) => {
    if (state.editorCamera !== previous.editorCamera) schedulePaint();
  });
  const observer = new ResizeObserver(paint);
  observer.observe(workspace);
  observer.observe(stage);
  paint();
  return {
    paint,
    dispose() {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      unsubscribeEngine();
      unsubscribeStore();
      observer.disconnect();
      hits.remove();
      for (const [index, key] of styleKeys.entries()) canvas.style[key] = originalStyles[index];
    }
  };
}
