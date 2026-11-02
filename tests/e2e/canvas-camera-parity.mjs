export async function verifyCameraPixels() {
  const { compareRasterPixels } = await import("/tests/e2e/canvas-pixel-comparison.mjs");
  const { draw } = await import("/src/canvas/editor/scene_renderer.js");
  const { createRectNode, createTextNode } = await import("/src/canvas/editor/scene_model.js");
  const { releaseStagePictureCache } = await import("/src/canvas/editor/stage_picture_cache.js");
  for (const [dpr, willReadFrequently] of [1, 1.25, 2].flatMap(d => [[d, true], [d, false]])) {
    const cached = document.createElement("canvas"), full = document.createElement("canvas");
    cached.width = full.width = Math.round(501 * dpr); cached.height = full.height = Math.round(401 * dpr);
    const parent = document.createElement("div");
    Object.assign(parent.style, { position: "fixed", left: "-10000px", top: "0", width: "501px", height: "401px" });
    cached.style.position = "absolute";
    parent.append(cached, full); document.body.append(parent);
    const ctx = cached.getContext("2d", { willReadFrequently });
    const nodes = [createRectNode({ x: 20, y: 30, width: 230, height: 200, fill: "#3366ff" }),
      createRectNode({ x: 100, y: 90, width: 220, height: 160, fill: "#ff6633", opacity: .5 }),
      { ...createTextNode({ x: 40, y: 65, text: "Wrapped text 你好 canvas", fill: "#102030", fontSize: 18 }),
        fontFamily: "sans-serif", width: 210, height: 100, boxWidth: 200 }];
    let options = { doc: { width: 500, height: 400, backgroundColor: "#ffffff", nodes },
      viewport: { zoom: 1, panX: 0, panY: 0 }, dpr, stageWidth: 501, stageHeight: 401,
      bitmapOf: () => null, maskOf: () => null, cullOffscreen: true };
    try {
      for (const zoom of [.67, 1.37, 2.1]) {
        for (let i = 0; i < 4; i++) draw(ctx, { ...options, cameraMoving: true,
          viewport: { zoom: zoom + i * .01, panX: 13.25 - i * 10, panY: -31.5 + i * 7 } });
        if (!parent.querySelector("[data-canvas-tile-layer]") || cached.style.visibility !== "hidden") throw new Error("Camera did not present independent tile layers");
        options = { ...options, viewport: { zoom, panX: 13.25, panY: -31.5 }, cameraMoving: false };
        for (const content of [nodes, [{ ...nodes[0], x: 45 }, ...nodes.slice(1)],
          [nodes[0], nodes[1], { ...nodes[2], text: "Edited paragraph with a new wrap width", boxWidth: 150 }], nodes]) {
          options = { ...options, doc: { ...options.doc, nodes: content, backgroundColor: zoom === 1.37 ? "#ddeeff" : "#ffffff" },
            selectionNode: content[0], selectionRect: { x: content[0].x, y: 30, width: 230, height: 200 } };
          draw(ctx, options);
          if (parent.querySelector("[data-canvas-tile-layer]")) throw new Error("Settled camera retained a preview layer");
          draw(full.getContext("2d", { willReadFrequently }), { ...options, cullOffscreen: false });
          if (cached.toDataURL() !== full.toDataURL()) {
            const a = ctx.getImageData(0, 0, cached.width, cached.height).data;
            const b = full.getContext("2d").getImageData(0, 0, full.width, full.height).data;
            const first = a.findIndex((v, i) => v !== b[i]);
            const delta = a.reduce((max, v, i) => Math.max(max, Math.abs(v - b[i])), 0);
            const count = a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
            const comparison = compareRasterPixels(a, b, cached.width);
            if (comparison.matches) continue;
            return { cached: cached.toDataURL(), full: full.toDataURL(), error: `Camera pixels differ: dpr=${dpr} zoom=${zoom} read=${willReadFrequently} delta=${delta} count=${count} unmatched=${comparison.unmatchedPixels} x=${Math.floor(first / 4) % cached.width} y=${Math.floor(first / 4 / cached.width)} cached=${a.slice(first-first%4,first-first%4+4)} full=${b.slice(first-first%4,first-first%4+4)}` };
          }
        }
      }
    } finally { releaseStagePictureCache(ctx); parent.remove(); cached.width = full.width = 0; }
  }
  return true;
}
