import { workspacePictureBounds } from "../editor/workspace-picture-bounds.js";
import { isImagePaint } from "../editor/render-paint-style.js";

const MAX_SIDE = 512;
const covers = new WeakMap();

/** Reuse decoded live resources for a small cover; never resize the editing canvas. */
export function captureLiveProjectCover(engine) {
  const doc = engine?.getDocument?.();
  const bounds = workspacePictureBounds(doc);
  const stamp = engine?.getArtworkStamp?.();
  if (!bounds || !stamp || typeof document === "undefined" || !engine.renderLayerPass) return null;
  // An incomplete decode must not bake missing media into PNG. Image-paint
  // resources have no public readiness reader, so retain their portable path.
  for (const node of doc.nodes) {
    if ((node.kind === "image" || node.imageId || node.src) && !engine.getNodeBitmap?.(node)) return null;
    if (node.maskId && !engine.getNodeMask?.(node)) return null;
    if (isImagePaint(node.fill) || node.fills?.some(paint => paint.imageId || isImagePaint(paint.fill))) return null;
  }
  const cached = covers.get(engine);
  if (cached?.doc === doc && cached.stamp === stamp) return cached.preview;
  const scale = Math.min(1, MAX_SIDE / Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top));
  const canvas = document.createElement("canvas");
  try {
    engine.renderLayerPass(canvas, doc.nodes.map(node => node.id), {
      dpr: 1,
      stageWidth: Math.max(1, Math.round((bounds.right - bounds.left) * scale)),
      stageHeight: Math.max(1, Math.round((bounds.bottom - bounds.top) * scale)),
      viewport: { zoom: scale, panX: -bounds.left * scale, panY: -bounds.top * scale },
    });
    if (engine.getDocument() !== doc || engine.getArtworkStamp() !== stamp) return null;
    const preview = canvas.toDataURL("image/png");
    // Keep only the latest small PNG per engine, including across undo states.
    covers.set(engine, { doc, stamp, preview });
    return preview;
  } finally { canvas.width = canvas.height = 0; }
}
