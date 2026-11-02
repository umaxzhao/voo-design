/** Read a tiny composited window, independent of the document-origin bitmap. */
export function sampleFreeCanvas(engine, point, radius, dpr) {
  const canvas = document.createElement("canvas");
  const size = radius * 2 + 1;
  const { zoom } = engine.getViewport();
  try {
    engine.renderLayerPass(canvas, engine.getDocument().nodes.map(node => node.id), {
      stageWidth: size / dpr, stageHeight: size / dpr,
      viewport: { zoom, panX: radius / dpr - point.x * zoom, panY: radius / dpr - point.y * zoom },
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Free-canvas sampling requires a 2D context");
    return ctx.getImageData(0, 0, size, size);
  } finally { canvas.width = canvas.height = 0; }
}
