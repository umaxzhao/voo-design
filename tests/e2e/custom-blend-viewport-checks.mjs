import assert from "node:assert/strict";

export async function verifyCustomBlendViewport(page) {
  const result = await page.evaluate(async () => {
    const { drawCustomBlendNode } = await import("/src/canvas/editor/render_custom_blend.js");
    const { CUSTOM_BLEND_MODES, blendPixel } = await import("/src/canvas/editor/blend_math.js");
    const { clearRenderCaches } = await import("/src/canvas/editor/render_cache.js");
    const width = 100, height = 80;
    const make = (willReadFrequently = true) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      return canvas.getContext("2d", { willReadFrequently });
    };
    const cases = [
      { box: [-700, -300, 2000, 1400], matrix: [0.55, 0, 0, 0.65, -20, 5], alpha: 1 },
      { box: [5, 10, 90, 65], matrix: [0.8, 0.12, -0.07, 1.1, 25.25, 12.5], alpha: 0.5, clip: [10, 8, 74, 48] },
      { box: [8, 6, 64, 55], matrix: [1, 0, 0, 1, 0, 0], alpha: 0.5, transparent: true },
    ];
    let checked = 0, maxReadbackPixels = 0;
    for (const mode of Object.keys(CUSTOM_BLEND_MODES)) {
      for (const [index, sample] of cases.entries()) {
        clearRenderCaches();
        const actual = make(), expected = make(), source = make(false);
        const [x, y, w, h] = sample.box;
        const node = { id: `${mode}-${index}`, kind: "rect", visible: true, x, y, width: w, height: h, blendMode: mode };
        const background = sample.transparent ? "rgba(0,0,255,0.5)" : "#284568";
        actual.fillStyle = expected.fillStyle = background;
        actual.fillRect(0, 0, width, height); expected.fillRect(0, 0, width, height);
        if (sample.clip) { actual.beginPath(); actual.rect(...sample.clip); actual.clip(); }
        actual.globalAlpha = source.globalAlpha = sample.alpha;
        actual.setTransform(...sample.matrix); source.setTransform(...sample.matrix);
        const paint = ctx => {
          ctx.fillStyle = "rgba(90,160,40,0.625)"; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "rgba(180,50,110,0.75)"; ctx.fillRect(x + w * 0.3, y + h * 0.2, w * 0.4, h * 0.5);
        };
        paint(source);
        const read = actual.getImageData.bind(actual);
        const reads = [];
        actual.getImageData = (...args) => { reads.push(args); return read(...args); };
        const state = { docVersion: node.id, backdropGeneration: 1, outputKey: "viewport-proof" };
        drawCustomBlendNode(actual, node, paint, state);
        if (reads.some(([rx, ry, rw, rh]) => rx < 0 || ry < 0 || rx + rw > width || ry + rh > height)) {
          return { failure: "Custom blend must never read outside the destination canvas", mode, index, reads };
        }
        maxReadbackPixels = Math.max(maxReadbackPixels, ...reads.map(([, , rw, rh]) => rw * rh));
        const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({
          x: sample.matrix[0] * px + sample.matrix[2] * py + sample.matrix[4],
          y: sample.matrix[1] * px + sample.matrix[3] * py + sample.matrix[5],
        }));
        const originX = Math.floor(Math.min(...corners.map(p => p.x)));
        const originY = Math.floor(Math.min(...corners.map(p => p.y)));
        const dst = expected.getImageData(0, 0, width, height), src = source.getImageData(0, 0, width, height);
        for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
          if (sample.clip && (px < sample.clip[0] || py < sample.clip[1] || px >= sample.clip[0] + sample.clip[2] || py >= sample.clip[1] + sample.clip[3])) continue;
          const at = (py * width + px) * 4;
          const color = data => ({ r: data[at] / 255, g: data[at + 1] / 255, b: data[at + 2] / 255, a: data[at + 3] / 255 });
          const out = blendPixel(mode, color(dst.data), color(src.data), px - originX, py - originY);
          dst.data.set([out.r * 255, out.g * 255, out.b * 255, out.a * 255], at);
        }
        expected.putImageData(dst, 0, 0);
        const canonical = expected.getImageData(0, 0, width, height).data;
        const pixels = read(0, 0, width, height).data;
        const mismatch = pixels.findIndex((value, at) => value !== canonical[at]);
        if (mismatch >= 0) return { failure: "Transformed blend pixels differ from independent blendPixel reference", mode, index, mismatch, actual: pixels[mismatch], expected: canonical[mismatch] };
        // A cache hit must replace the same device pixels without reapplying the world transform or alpha.
        actual.save(); actual.setTransform(1, 0, 0, 1, 0, 0); actual.globalAlpha = 1;
        actual.clearRect(0, 0, width, height); actual.fillStyle = background; actual.fillRect(0, 0, width, height); actual.restore();
        drawCustomBlendNode(actual, node, paint, state);
        if (read(0, 0, width, height).data.some((value, at) => value !== canonical[at])) return { failure: "Cached device-space blend pixels differ", mode, index };
        checked++;
      }
    }
    const ctx = make(); ctx.translate(-500, -500);
    let painted = false;
    drawCustomBlendNode(ctx, { id: "outside", kind: "rect", x: 0, y: 0, width: 50, height: 40, blendMode: "linear-dodge" }, () => { painted = true; });
    return { checked, maxReadbackPixels, paintedOffscreen: painted };
  });
  assert.equal(result.failure, undefined, JSON.stringify(result));
  assert.equal(result.checked, 27);
  assert.ok(result.maxReadbackPixels <= 100 * 80);
  assert.equal(result.paintedOffscreen, false);
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 140, height: 100, isCanvasRoot: false, backgroundColor: "transparent", nodes: [
      { id: "blend-background", kind: "rect", x: 0, y: 0, width: 140, height: 100, fill: "#202020", visible: true },
      { id: "blend-source", kind: "rect", x: -100, y: 0, width: 150, height: 60, fill: "#400000", blendMode: "linear-dodge", visible: true },
    ] });
    e.selectExactly(["blend-source"]); document.activeElement?.blur();
  });
  const edge = () => page.evaluate(async () => {
    const canvas = await window.__vooEditor.exportPngCanvasAsync();
    return [...canvas.getContext("2d").getImageData(50, 20, 1, 1).data];
  });
  assert.deepEqual(await edge(), [32, 32, 32, 255]);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.__vooEditor.getNode("blend-source").x === -99);
  assert.deepEqual(await edge(), [96, 32, 32, 255]);
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("blend-source").x === -100);
  assert.deepEqual(await edge(), [32, 32, 32, 255]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.deepEqual(await edge(), [96, 32, 32, 255]);
  return "27 viewport-bounded blend references, exact cache/alpha/clip/dissolve pixels, offscreen rejection and real keyboard history";
}
