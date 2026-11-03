import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
    const { drawNode } = await import("/src/canvas/editor/render_node_dispatch.js");
    const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry_transform.js");
    const { documentToScene, requiresCanvas2dMediaFallback } = await import("/src/canvas/editor/skia_scene_adapter.js");
    const { createSkiaHost } = await import("/src/canvas/editor/skia_host.js");
    const engine = window.__vooEditor;
    const source = (x, y, w = 100, h = 100) => ({ type: "rect", x, y, w, h });
    const base = { id: "combined", kind: "boolean", visible: true, x: 60, y: 60,
      width: 150, height: 140, fill: "#0000ff", stroke: "#ff0000", strokeWidth: 10,
      operation: "union", sources: [source(0, 0), source(50, 40)] };
    const rgba = (ctx, points) => points.map(([x, y]) => [...ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data]);
    async function pixels(node, points, crop = null, actualExport = false, background = "#ffffff") {
      const doc = { width: 320, height: 300, isCanvasRoot: false,
        backgroundColor: background, nodes: [node], crop };
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 300;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = background; ctx.fillRect(0, 0, 320, 300);
      if (crop) ctx.translate(-crop.x, -crop.y);
      drawNode(ctx, node, () => null);
      const svgImage = new Image();
      const url = URL.createObjectURL(new Blob([documentToSvg(doc)], { type: "image/svg+xml" }));
      svgImage.src = url; await svgImage.decode();
      const exported = document.createElement("canvas"); exported.width = 320; exported.height = 300;
      const svgCtx = exported.getContext("2d"); svgCtx.drawImage(svgImage, 0, 0); URL.revokeObjectURL(url);
      const result = { canvas: rgba(ctx, points), svg: rgba(svgCtx, points) };
      if (actualExport) {
        engine.setDoc({ ...engine.getDocument(), ...doc });
        const image = new Image(); image.src = await engine.exportFullResPng(); await image.decode();
        const png = document.createElement("canvas"); png.width = 320; png.height = 300;
        const pngCtx = png.getContext("2d"); pngCtx.drawImage(image, 0, 0);
        result.png = rgba(pngCtx, points);
      }
      return result;
    }
    const operations = [];
    const occupied = { union: [true, true, true], subtract: [true, false, false],
      intersect: [false, true, false], exclude: [true, false, true] };
    for (const [operation, expected] of Object.entries(occupied)) {
      const node = { ...base, operation, strokeWidth: 0 };
      operations.push({ operation, expected, result: await pixels(node, [[80, 80], [140, 120], [190, 140]], null, true) });
    }
    const alignments = [];
    for (const operation of Object.keys(occupied)) {
      const edge = operation === "intersect" ? [110, 130] : [60, 90];
      for (const strokeAlign of ["inside", "center", "outside"]) {
        const points = [-3, 3, 13].map(dx => [edge[0] + dx, edge[1]]);
        alignments.push({ operation, strokeAlign, result: await pixels({ ...base, operation, strokeAlign }, points, null, true) });
      }
    }
    const seam = await pixels({ ...base, strokeAlign: "inside" }, [[110, 120], [140, 100], [90, 90]], null, true);
    const hidden = await pixels({ ...base, strokeHidden: true }, [[65, 90], [90, 90]], null, true);
    const extras = await pixels({ ...base, strokeHidden: true,
      strokes: [{ stroke: "#00ff00", strokeWidth: 8, strokeAlign: "outside" },
        { stroke: "#ff00ff", strokeWidth: 30, visible: false }] }, [[55, 90], [65, 90]], null, true);
    const noFill = await pixels({ ...base, fill: "transparent", strokeHidden: true }, [[90, 90]], null, true);
    const alpha = await pixels({ ...base, opacity: 0.5, fillOpacity: 0.5,
      strokeOpacity: 0.5, strokeAlign: "inside" }, [[65, 90], [90, 90]], null, true);
    // Independent two-canvas reference: paint alpha belongs inside the layer,
    // and layer opacity belongs only to the final composite, including on PNG.
    const alphaPoints = [[65, 90], [90, 90], [10, 10]];
    function referenceAlpha(background, colorAlpha = false) {
      const layer = document.createElement("canvas"); layer.width = 320; layer.height = 300;
      const paint = layer.getContext("2d"); paint.globalAlpha = colorAlpha ? 1 : 0.5;
      paint.fillStyle = colorAlpha ? "#0000ff80" : "#0000ff"; paint.fillRect(60, 60, 100, 100);
      paint.fillStyle = colorAlpha ? "#ff000080" : "#ff0000"; paint.fillRect(60, 60, 10, 100);
      const output = document.createElement("canvas"); output.width = 320; output.height = 300;
      const ctx = output.getContext("2d"); ctx.fillStyle = background; ctx.fillRect(0, 0, 320, 300);
      ctx.globalAlpha = 0.5; ctx.drawImage(layer, 0, 0);
      return rgba(ctx, alphaPoints);
    }
    const alphaNode = { ...base, opacity: 0.5, fillOpacity: 0.5, strokeOpacity: 0.5, strokeAlign: "inside" };
    const colorAlphaNode = { ...alphaNode, fill: "#0000ff80", stroke: "#ff000080", fillOpacity: 1, strokeOpacity: 1 };
    const alphaTransparent = await pixels(alphaNode, alphaPoints, null, true, "transparent");
    const colorAlpha = await pixels(colorAlphaNode, alphaPoints, null, true, "transparent");
    const alphaReference = referenceAlpha("#ffffff").slice(0, 2);
    const transparentReference = referenceAlpha("transparent");
    const colorAlphaReference = referenceAlpha("transparent", true);
    const nested = await pixels({ ...base, sources: [
      { type: "boolean", x: 0, y: 0, w: 100, h: 100, booleanOperation: "subtract",
        booleanSources: [source(0, 0), source(25, 25, 50, 50)] }, source(120, 0, 20, 20)],
    strokeWidth: 8, strokeAlign: "inside" }, [[70, 70], [110, 110], [82, 110], [190, 70]], null, true);
    const far = { ...base, x: 80000, y: 90000, rotation: 33, shear: 13,
      flipH: true, strokeAlign: "outside", operation: "subtract" };
    const crop = { x: 79920, y: 89920, width: 320, height: 300 };
    const farPoints = [[-5, 30], [20, 20], [80, 60]].map(([x, y]) => {
      const point = fromNodeLocal(far, { x, y }); return [point.x - crop.x, point.y - crop.y];
    });
    const distant = await pixels(far, farPoints, crop, true);
    const rotatedSource = await pixels({ ...base, strokeWidth: 0,
      sources: [{ ...source(0, 0, 100, 50), rotation: 90 }, source(120, 0, 20, 20)] },
    [[110, 55], [65, 80], [190, 70]], null, true);
    // Rotating a 240x10 operand by 90 degrees puts its top at world y=35,
    // although the container's stored y range is only 150..160. The stroke
    // mask must contain the real contour, rather than just that stored box.
    const thinRotated = [];
    for (const strokeAlign of ["inside", "outside"]) {
      const node = { ...base, y: 150, width: 240, height: 10, strokeWidth: 2,
        strokeAlign, sources: [{ ...source(0, 0, 240, 10), rotation: 90 }, source(0, 0, 10, 10)] };
      thinRotated.push({ strokeAlign, result: await pixels(node, [[180, 34], [180, 36], [180, 45]], null, true) });
    }
    const curved = await pixels({ ...base, operation: "subtract", strokeAlign: "inside",
      sources: [{ type: "ellipse", x: 0, y: 0, w: 100, h: 100 }, source(40, 20, 80, 60)] },
    [[65, 110], [85, 110], [120, 110], [65, 65]], null, true);
    const triple = await pixels({ ...base, operation: "intersect", strokeWidth: 0,
      sources: [...base.sources, source(120, 0, 20, 20)] }, [[140, 120], [190, 70]], null, true);
    const unsupported = { ...base, strokeWidth: 0, sources: [
      { type: "path", x: 0, y: 0, w: 100, h: 100, baseWidth: 100, baseHeight: 100,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100, close: true }] }, source(120, 0, 20, 20)] };
    const fallbackDoc = { width: 320, height: 300, nodes: [unsupported] };
    let rejectsUnsupported = false;
    try { documentToScene(fallbackDoc, {}); } catch (error) { rejectsUnsupported = /Canvas2D/.test(error.message); }
    const fallback = { routed: requiresCanvas2dMediaFallback(fallbackDoc), rejectsUnsupported,
      pixels: await pixels(unsupported, [[70, 70], [140, 140], [190, 70]], null, true) };

    const gpuCanvas = document.createElement("canvas");
    gpuCanvas.style.cssText = "position:fixed;left:-10000px;top:0";
    document.body.append(gpuCanvas);
    const host = await createSkiaHost(gpuCanvas);
    let native;
    try {
      host.resize(320, 300, 1);
      async function skiaAlphaPixels(node, background, points) {
        const doc = { id: "boolean-alpha", width: 320, height: 300, isCanvasRoot: false,
          backgroundColor: background, nodes: [node] };
        const snapshot = await host.draw({ docs: [doc], revision: 2, backgroundColor: background,
          viewport: { zoom: 1, panX: 0, panY: 0, width: 320, height: 300, devicePixelRatio: 1 } });
        const bytes = await host.instance.exportSnapshot(snapshot, { format: "png", bounds: { x: 0, y: 0, width: 320, height: 300 } });
        const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        try {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 300;
          const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0); return rgba(ctx, points);
        } finally { URL.revokeObjectURL(url); }
      }
      alpha.skia = await skiaAlphaPixels(alphaNode, "#ffffff", alphaPoints.slice(0, 2));
      alphaTransparent.skia = await skiaAlphaPixels(alphaNode, "transparent", alphaPoints);
      colorAlpha.skia = await skiaAlphaPixels(colorAlphaNode, "transparent", alphaPoints);
      const gpuDoc = { id: "boolean-native", width: 320, height: 300, isCanvasRoot: true,
        nodes: [{ ...base, fill: "transparent", opacity: 0.5 }] };
      const snapshot = await host.draw({ docs: [gpuDoc], revision: 1, backgroundColor: "#ffffff",
        viewport: { zoom: 1, panX: 0, panY: 0, width: 320, height: 300, devicePixelRatio: 1 } });
      const bytes = await host.instance.exportSnapshot(snapshot, { format: "png", bounds: { x: 0, y: 0, width: 320, height: 300 } });
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      const image = new Image(); image.src = url; await image.decode();
      const c = document.createElement("canvas"); c.width = 320; c.height = 300;
      const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0); URL.revokeObjectURL(url);
      native = rgba(ctx, [[55, 90], [65, 90], [85, 90]]);
    } finally { host.dispose(); gpuCanvas.remove(); }

    const manyPoints = Array.from({ length: 150000 }, (_, index) => {
      const angle = index / 150000 * Math.PI * 2;
      return { x: 50 + Math.cos(angle) * 50, y: 50 + Math.sin(angle) * 50, close: index === 149999 };
    });
    const large = await pixels({ ...base, strokeAlign: "outside", sources: [
      { type: "path", x: 0, y: 0, w: 100, h: 100, points: manyPoints },
      { type: "path", x: 0, y: 0, w: 0, h: 0, points: [] }] }, [[55, 110], [85, 110]]);
    return { operations, alignments, seam, hidden, extras, noFill, alpha, alphaReference, alphaTransparent, transparentReference, colorAlpha, colorAlphaReference, nested, distant, rotatedSource, thinRotated, curved, triple, fallback, native, large };
  });
  const WHITE = [255, 255, 255, 255], BLUE = [0, 0, 255, 255], RED = [255, 0, 0, 255];
  const assertPixels = (actual, expected, label) => {
    for (const [backend, pixels] of Object.entries(actual)) {
      assert.deepEqual(pixels, expected, `${label} (${backend})`);
    }
  };
  for (const item of result.operations) {
    assertPixels(item.result, item.expected.map(inside => inside ? BLUE : WHITE), item.operation);
  }
  for (const item of result.alignments) {
    const expected = item.strokeAlign === "inside" ? [WHITE, RED, BLUE]
      : item.strokeAlign === "center" ? [RED, RED, BLUE] : [RED, BLUE, BLUE];
    assertPixels(item.result, expected, `${item.operation}/${item.strokeAlign}`);
  }
  assertPixels(result.seam, [BLUE, BLUE, BLUE], "operand seams have no internal strokes");
  assertPixels(result.hidden, [BLUE, BLUE], "hidden stroke retains fill");
  assertPixels(result.extras, [[0, 255, 0, 255], BLUE], "independent extra stroke");
  assertPixels(result.noFill, [WHITE], "transparent fill leaves no black silhouette");
  // STYLE contract: composite fill/stroke first, then apply layer opacity once.
  // Preserve the original one-channel rounding threshold across all backends.
  for (const [actual, expected, label] of [
    [result.alpha, result.alphaReference, "opacity"],
    [result.alphaTransparent, result.transparentReference, "transparent opacity"],
    [result.colorAlpha, result.colorAlphaReference, "source color alpha"],
  ]) {
    for (const [backend, pixels] of Object.entries(actual)) {
      for (const [i, pixel] of pixels.entries()) {
        pixel.forEach((value, channel) => assert.ok(Math.abs(value - expected[i][channel]) <= 1,
          `${label} ${backend}/${i}/${channel}: ${value} != ${expected[i][channel]}`));
      }
    }
  }
  assertPixels(result.nested, [BLUE, WHITE, RED, BLUE], "nested subtraction retains holes and inner border");
  assertPixels(result.distant, [RED, BLUE, WHITE], "distant transformed stroke and cutout");
  assertPixels(result.rotatedSource, [BLUE, WHITE, BLUE], "source rotation is retained");
  for (const item of result.thinRotated) {
    assertPixels(item.result, item.strokeAlign === "inside" ? [WHITE, RED, BLUE] : [RED, BLUE, BLUE],
      `thin rotated operand ${item.strokeAlign} stroke extends beyond container box`);
  }
  assertPixels(result.curved, [RED, BLUE, WHITE, WHITE], "curved operand outline and subtraction");
  assertPixels(result.triple, [WHITE, WHITE], "intersection includes every operand");
  assert.equal(result.fallback.routed, true);
  assert.equal(result.fallback.rejectsUnsupported, true);
  assertPixels(result.fallback.pixels, [BLUE, WHITE, BLUE], "unsupported native path operand uses Canvas2D");
  assert.deepEqual(result.native[0], WHITE);
  assert.deepEqual(result.native[2], WHITE);
  result.native[1].forEach((value, channel) => assert.ok(Math.abs(value - [255, 127, 127, 255][channel]) <= 1,
    `CanvasKit Boolean alpha channel ${channel}: ${value}`));
  assertPixels(result.large, [RED, BLUE], "150000-anchor outside stroke avoids argument-count overflow");
  console.log(JSON.stringify({ passed: [
    "all four Boolean fills agree between Canvas2D, engine PNG and SVG",
    "all four operations support inside, center and outside merged boundary strokes",
    "overlap seams are unstroked, hidden paint retains fill and extra strokes are independent",
    "opacity and transparent fill preserve compositing without black silhouettes",
    "nested subtraction holes and inner strokes survive SVG export",
    "far-coordinate rotation/shear/flip and individual source rotation preserve pixels",
    "thin rotated operands keep inside and outside strokes beyond the container box",
    "curved operands and all three intersection operands retain the correct silhouette",
    "CanvasKit retains inside default placement without multiplying node opacity twice",
    "unsupported native path operands route through Canvas2D and 150000-anchor borders remain drawable",
  ] }, null, 2));
});
