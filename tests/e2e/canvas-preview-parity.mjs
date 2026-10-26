/** Verify the 2D cache directly; a GPU editor's hidden canvas is chrome-only. */
export async function verifyPreviewPixels() {
  const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
  const { draw } = await import("/src/canvas/editor/scene_renderer.js");
  const { previewDirtyRect } = await import("/src/canvas/editor/preview_dirty_rect.js");
  const { releaseStagePictureCache } = await import("/src/canvas/editor/stage_picture_cache.js");
  for (const opacity of [1, 0.5]) {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const nodes = [
      { ...createRectNode({ x: 50, y: 50, width: 100, height: 100, fill: "#3366ff" }), opacity },
      { ...createRectNode({ x: 100, y: 90, width: 100, height: 100, fill: "#ff6633" }), opacity },
    ];
    const doc = { width: 500, height: 500, backgroundColor: "#ffffff", nodes };
    const options = { doc, viewport: { panX: 20, panY: 20, zoom: 1 }, dpr: 1,
      bitmapOf: () => null, maskOf: () => null, cullOffscreen: true,
      selectionNode: nodes[0], selectionRect: nodes[0] };
    try {
      draw(ctx, options);
      const moved = { ...nodes[0], x: 80, y: 70 };
      const next = { ...doc, nodes: [moved, nodes[1]] };
      const nextOptions = { ...options, doc: next, selectionNode: moved, selectionRect: moved };
      draw(ctx, { ...nextOptions, previewMotion: true, dirtyRects: previewDirtyRect(doc, next) });
      const partial = canvas.toDataURL();
      draw(ctx, { ...nextOptions, cullOffscreen: false });
      if (partial !== canvas.toDataURL()) return false;
    } finally {
      releaseStagePictureCache(ctx);
      canvas.width = canvas.height = 0;
    }
  }
  return true;
}
