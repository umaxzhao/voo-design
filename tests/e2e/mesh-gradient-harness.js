/** Compare the real painters to the browser's existing mesh SVG semantics. */
export async function meshPainterMatrix() {
  const { formatGradient } = await import("/src/canvas/color_picker/gradient_fill.js");
  const { drawNode } = await import("/src/canvas/editor/render_node_dispatch.js");
  const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
  const { createSkiaHost } = await import("/src/canvas/editor/skia_host.js");
  const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry_transform.js");
  const { requiresCanvas2dMediaFallback } = await import("/src/canvas/editor/skia_scene_adapter.js");
  const points = [
    { x: 10, y: 10, color: "#ff0000", opacity: 80 },
    { x: 80, y: 20, color: "#0000ff", opacity: 65 },
    { x: 45, y: 85, color: "#00ff00", opacity: 90 },
  ];
  const fill = formatGradient("mesh", undefined, undefined, { points, blur: 47 });
  const createCanvas = () => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 300;
    return canvas;
  };
  const rgba = (canvas, probes) => probes.map(([x, y]) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data]);
  const readImage = async (src, probes) => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = createCanvas(); canvas.getContext("2d").drawImage(image, 0, 0);
    return rgba(canvas, probes);
  };
  const base = { id: "mesh", kind: "rect", visible: true, x: 70, y: 60,
    width: 160, height: 120, fill, strokeWidth: 0 };
  const cases = [
    ["rectangle", base],
    ["ellipse", { ...base, kind: "ellipse" }],
    ["closed pen path", { ...base, kind: "path", pen: true, baseWidth: 160, baseHeight: 120,
      points: [{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 0, y: 120, close: true }] }],
    ["fill/node alpha", { ...base, opacity: 0.5, fillOpacity: 0.5 }],
    ["rotated/flipped ellipse", { ...base, kind: "ellipse", rotation: 27, flipH: true, opacity: 0.7 }],
    ["stacked fill opacity", { ...base, fills: [
      { fill: "#0000ff", opacity: 1 }, { fill, opacity: 0.35 }, { fill: "#000000", visible: false },
    ] }, true],
  ];
  const gpuCanvas = createCanvas(); gpuCanvas.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.append(gpuCanvas);
  const host = await createSkiaHost(gpuCanvas);
  const output = [];
  try {
    host.resize(400, 300, 1);
    let revision = 0;
    for (const [label, node, expectedFallback = false] of cases) {
      const doc = { id: "mesh-page", width: 400, height: 300, isCanvasRoot: true, nodes: [node] };
      const probes = [[30, 25], [65, 25], [45, 55], [120, 90], [3, 3]].map(([x, y]) => {
        const mapped = fromNodeLocal(node, { x, y }); return [Math.floor(mapped.x), Math.floor(mapped.y)];
      });
      const canvas = createCanvas(), ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 400, 300);
      drawNode(ctx, node, () => null);
      const svgDoc = { ...doc, isCanvasRoot: false, backgroundColor: "#ffffff" };
      const url = URL.createObjectURL(new Blob([documentToSvg(svgDoc)], { type: "image/svg+xml" }));
      let expected;
      try { expected = await readImage(url, probes); } finally { URL.revokeObjectURL(url); }
      let skia = null;
      if (!expectedFallback) {
        const snapshot = await host.draw({ docs: [doc], revision: ++revision, backgroundColor: "#ffffff",
          viewport: { zoom: 1, panX: 0, panY: 0, width: 400, height: 300, devicePixelRatio: 1 } });
        const bytes = await host.instance.exportSnapshot(snapshot, { format: "png", bounds: { x: 0, y: 0, width: 400, height: 300 } });
        const gpuUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        try { skia = await readImage(gpuUrl, probes); } finally { URL.revokeObjectURL(gpuUrl); }
      }
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), ...svgDoc });
      output.push({ label, expectedFallback, fallback: requiresCanvas2dMediaFallback(doc), expected,
        canvas: rgba(canvas, probes), skia, png: await readImage(await e.exportFullResPng(), probes) });
    }
  } finally { host.dispose(); gpuCanvas.remove(); }
  return output;
}

/** Bound allocations and encode once even when camera/bounds/opacity change. */
export async function meshCacheContract() {
  const { meshCanvasPattern, meshSceneFill } = await import("/src/canvas/editor/mesh-gradient-paint.js");
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  const create = document.createElement;
  const encode = HTMLCanvasElement.prototype.toDataURL;
  const allocated = [];
  let encoded = 0;
  const parsed = { type: "mesh", blur: 63, points: [
    { x: 9.341, y: 10, color: "#123456", opacity: 65 },
    { x: 82, y: 79, color: "#456789", opacity: 95 },
  ] };
  document.createElement = (...args) => {
    const element = create.apply(document, args);
    if (args[0] === "canvas") allocated.push(element);
    return element;
  };
  HTMLCanvasElement.prototype.toDataURL = function (...args) { encoded++; return encode.apply(this, args); };
  try {
    const first = meshSceneFill(parsed, 1);
    for (let i = 0; i < 20; i++) meshCanvasPattern(ctx, parsed, i * 100, i * 200, 1e7, 1e7, 1);
    const second = meshSceneFill(parsed, 0.5);
    const reused = { encoded, allocated: allocated.length, sameResource: first.imageUrl === second.imageUrl };
    for (let i = 0; i < 33; i++) meshSceneFill({ ...parsed, blur: 10 + i }, 1);
    const beforeReload = allocated.length;
    meshSceneFill(parsed, 1);
    return { reused, evicted: allocated.length === beforeReload + 1,
      bounded: allocated.every(item => item.width <= 256 && item.height <= 256) };
  } finally {
    document.createElement = create;
    HTMLCanvasElement.prototype.toDataURL = encode;
  }
}

/** Exercise glyphs and outlines, which use the explicit Canvas2D route. */
export async function meshTextStrokeMatrix() {
  const { formatGradient } = await import("/src/canvas/color_picker/gradient_fill.js");
  const { drawNode } = await import("/src/canvas/editor/render_node_dispatch.js");
  const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
  const { applyNodeTransform } = await import("/src/canvas/editor/render_custom_blend.js");
  const fill = formatGradient("mesh");
  const extra = formatGradient("mesh", undefined, undefined, { blur: 63 });
  const base = { id: "mesh", visible: true, x: 20, y: 20, width: 260, height: 100,
    kind: "text", text: "MMMM", fontFamily: "Arial", fontWeight: 700, fontSize: 64, fill };
  const cases = [
    ["mesh glyph", base, 255],
    ["mesh glyph alpha", { ...base, fillOpacity: 0.4, opacity: 0.5 }, 51],
    ["mesh glyph stroke alpha", { ...base, fill: "transparent", stroke: fill,
      strokeWidth: 4, strokeOpacity: 0.4, opacity: 0.5 }, 51],
    ["mesh rectangle stroke alpha", { ...base, kind: "rect", fill: "transparent", stroke: fill,
      strokeWidth: 12, strokeAlign: "center", strokeOpacity: 0.6, opacity: 0.5 }, 77],
    ["mesh additional vector stroke", { ...base, kind: "rect", fill: "transparent", strokeHidden: true,
      strokes: [{ stroke: extra, strokeWidth: 12, strokeOpacity: 0.4, strokeAlign: "inside" }] }, 102],
    ["mesh additional glyph stroke", { ...base, fill: "transparent", strokeHidden: true,
      strokes: [{ stroke: extra, strokeWidth: 4, strokeOpacity: 0.4 }] }, 102],
    ["mesh path glyph alpha", { ...base, fillOpacity: 0.4, opacity: 0.5,
      textPath: { points: [{ x: 20, y: 70 }, { x: 280, y: 70 }] } }, 51],
    ["rotated mesh path glyph alpha", { ...base, fillOpacity: 0.4, opacity: 0.5, rotation: 23,
      textPath: { points: [{ x: 20, y: 70 }, { x: 280, y: 70 }] } }, 51],
    ["mesh ribbon stroke alpha", { ...base, kind: "path", pen: true, fill: "transparent",
      baseWidth: 260, baseHeight: 100, points: [{ x: 10, y: 20 }, { x: 240, y: 80 }],
      stroke: fill, strokeWidth: 16, strokeWidthProfile: "taperBoth", strokeOpacity: 0.4 }, 102],
    ["mesh arrow stroke", { ...base, kind: "path", pen: true, fill: "transparent",
      baseWidth: 260, baseHeight: 100, points: [{ x: 10, y: 20 }, { x: 240, y: 80 }],
      stroke: fill, strokeWidth: 12, arrow: true, arrowCap: "triangle" }, 255],
  ];
  const createCanvas = () => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 200;
    return canvas;
  };
  const statistics = canvas => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, 400, 200).data;
    let coloured = 0, alpha = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      alpha = Math.max(alpha, pixels[i + 3]);
      if (pixels[i + 3] > 0 && Math.max(...pixels.slice(i, i + 3)) - Math.min(...pixels.slice(i, i + 3)) > 20) coloured++;
    }
    return { coloured, alpha };
  };
  const results = [];
  const svgCanvas = async node => {
    const markup = documentToSvg({ width: 400, height: 200, nodes: [node] });
    const image = new Image(); image.src = `data:image/svg+xml,${encodeURIComponent(markup)}`;
    await image.decode();
    const canvas = createCanvas(); canvas.getContext("2d").drawImage(image, 0, 0);
    return { canvas, markup };
  };
  const transformedDifference = (actual, unrotated, node, alpha) => {
    const reference = createCanvas(), ctx = reference.getContext("2d");
    applyNodeTransform(ctx, node); ctx.drawImage(unrotated, 0, 0);
    const pixels = actual.getContext("2d").getImageData(0, 0, 400, 200).data;
    const expected = ctx.getImageData(0, 0, 400, 200).data;
    let probes = 0, error = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // Exclude glyph antialiasing; compare interior colour after moving the
      // whole text as one bitmap, independently of the per-glyph paint path.
      if (pixels[i + 3] < alpha - 1 || expected[i + 3] < alpha - 1) continue;
      probes++;
      error += Math.abs(pixels[i] - expected[i]) + Math.abs(pixels[i + 1] - expected[i + 1]) + Math.abs(pixels[i + 2] - expected[i + 2]);
    }
    return { probes, meanError: error / Math.max(1, probes * 3) };
  };
  for (const [label, node, expectedAlpha] of cases) {
    const canvas = createCanvas(); drawNode(canvas.getContext("2d"), node, () => null);
    const { canvas: exported, markup } = await svgCanvas(node);
    let transform;
    if (node.rotation) {
      const plain = { ...node, rotation: 0 }, unrotated = createCanvas();
      drawNode(unrotated.getContext("2d"), plain, () => null);
      transform = { canvas: transformedDifference(canvas, unrotated, node, expectedAlpha),
        svg: transformedDifference(exported, (await svgCanvas(plain)).canvas, node, expectedAlpha) };
    }
    results.push({ label, expectedAlpha, canvas: statistics(canvas), svg: statistics(exported), transform,
      rawPaint: /(?:fill|stroke)="url\(&quot;data:/.test(markup) });
  }
  return results;
}
