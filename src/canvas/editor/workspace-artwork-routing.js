import { requiresCanvas2dMediaFallback } from "./skia_scene_adapter.js";

/** Bitmaps outlive temporary URLs; browser fonts are not registered in the GPU host. */
export function requiresWorkspaceCanvas2d(doc) {
  return requiresCanvas2dMediaFallback(doc) || Boolean(doc?.nodes?.some(node => node.kind === "image" || node.kind === "text"));
}

/** Keep the frame in Skia while its unsupported artwork uses the live 2D pass. */
export function workspaceSkiaDocument(doc) {
  if (!requiresWorkspaceCanvas2d(doc)) return doc;
  return { ...doc, nodes: [], timeline: null };
}

/** Paint decoded resources and gesture previews from the same live document. */
export function attachArtboardArtwork({ canvas, engine, includeFrame = false }) {
  const paint = () => {
    if (includeFrame) {
      engine.renderArtwork(canvas);
      return;
    }
    const doc = engine.getDocument();
    engine.renderLayerPass(canvas, doc.nodes.map(node => node.id));
  };
  const unsubscribe = engine.subscribeRender(paint);
  paint();
  return { paint, dispose: unsubscribe };
}
