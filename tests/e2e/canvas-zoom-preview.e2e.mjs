import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    window.__zoomStore = useDesignStore;
    const e = window.__vooEditor;
    const nodes = Array.from({ length: 600 }, (_, i) => ({ id: `zoom-${i}`, kind: "rect", visible: true,
      x: (i % 30) * 35, y: Math.floor(i / 30) * 28, width: 24, height: 20,
      fill: "#ff8800", fills: [{ fill: "#ff8800", opacity: 1 }], opacity: 1 }));
    e.setDoc({ ...e.getDocument(), isCanvasRoot: true, width: 1200, height: 800, nodes });
    e.selectExactly([]); e.setTool("select");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 180 }, pendingArtboardFitId: null });
  });
  const artwork = page.getByTestId("editor-artwork-fallback");
  await artwork.waitFor();
  const baseline = await page.evaluate(() => {
    const e = window.__vooEditor, original = CanvasRenderingContext2D.prototype.clearRect;
    let measurement;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (!measurement && !this.canvas.isConnected) measurement = this;
      return original.apply(this, args);
    };
    try { e.prepareCanvasReadback(); }
    finally { CanvasRenderingContext2D.prototype.clearRect = original; }
    if (!measurement) throw new Error("No explicit measurement readback context");
    const probe = window.__zoomProbe = { invisiblePaints: 0, artworkPaints: 0, originalDoc: e.getDocument() };
    const clear = measurement.clearRect;
    measurement.clearRect = function (...args) { probe.invisiblePaints++; return clear.apply(this, args); };
    const render = e.renderLayerPass;
    e.renderLayerPass = (...args) => { probe.artworkPaints++; return render(...args); };
    return { zoom: e.getViewport().zoom };
  });
  const box = await page.getByTestId("editor-pages").boundingBox();
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .55);
  await page.keyboard.down("Control");
  try { await page.mouse.wheel(0, -40); }
  finally { await page.keyboard.up("Control"); }
  await page.waitForFunction(before => window.__vooEditor.getViewport().zoom !== before, baseline.zoom);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.__zoomProbe.invisiblePaints), 0,
    "Shared workspace zoom must not repaint the invisible measurement canvas");

  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkWarm === "true");
  const before = await page.evaluate(() => window.__zoomProbe.artworkPaints);
  await page.keyboard.down("Control");
  try {
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -20);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
  } finally { await page.keyboard.up("Control"); }
  assert.equal(await artwork.getAttribute("data-artwork-state"), "preview");
  assert.equal(await page.evaluate(() => window.__zoomProbe.artworkPaints), before,
    "Continuous covered zoom must reuse artwork instead of rasterizing the layer tree");
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkState === "exact");
  const pixels = await page.evaluate(() => {
    const e = window.__vooEditor, canvas = document.querySelector('[data-testid="editor-artwork-fallback"]');
    const reference = document.createElement("canvas"), left = parseFloat(canvas.style.left), top = parseFloat(canvas.style.top);
    e.renderLayerPass(reference, e.getDocument().nodes.map(n => n.id), {
      stageWidth: parseFloat(canvas.style.width), stageHeight: parseFloat(canvas.style.height),
      viewport: { zoom: e.getViewport().zoom, panX: -left, panY: -top },
    });
    const a = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const b = reference.getContext("2d").getImageData(0, 0, reference.width, reference.height).data;
    return { equal: a.length === b.length && a.every((v, i) => v === b[i]),
      unchanged: window.__zoomProbe.originalDoc === e.getDocument() };
  });
  assert.deepEqual(pixels, { equal: true, unchanged: true });
  await page.keyboard.down("Control");
  try { await page.mouse.wheel(0, -20); }
  finally { await page.keyboard.up("Control"); }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 10, y: 10 }));
  assert.equal(await artwork.getAttribute("data-artwork-state"), "exact", "Pixel readback must flush the preview immediately");
  await page.evaluate(() => window.__vooEditor.updateNode("zoom-0", {
    fill: "#0088ff", fills: [{ fill: "#0088ff", opacity: 1 }],
  }));
  await page.waitForFunction(() => window.__vooEditor.getNode("zoom-0").fill === "#0088ff");
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 10, y: 10 })), "#0088ff");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 10, y: 10 })), "#ff8800");
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 10, y: 10 })), "#0088ff");
  assert.deepEqual(errors, []);
  console.log("Real zoom: no invisible painting, motion reuse, exact settled pixels, readback flush, edit invalidation and undo/redo passed.");
});
