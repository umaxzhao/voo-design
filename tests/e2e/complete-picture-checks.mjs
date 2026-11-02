import assert from "node:assert/strict";
import { imageAudit } from "./image-audit-fixture.mjs";

async function compareExact(page) {
  return page.evaluate(() => {
    const engine = window.__vooEditor, probe = window.__completePictureProbe;
    const canvas = document.querySelector('[data-testid="editor-artwork-fallback"]');
    const reference = document.createElement("canvas");
    probe.original(reference, engine.getDocument().nodes.map(node => node.id), {
      dpr: devicePixelRatio,
      stageWidth: parseFloat(canvas.style.width), stageHeight: parseFloat(canvas.style.height),
      viewport: { zoom: engine.getViewport().zoom, panX: -parseFloat(canvas.style.left), panY: -parseFloat(canvas.style.top) },
    });
    const actual = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const expected = reference.getContext("2d").getImageData(0, 0, reference.width, reference.height).data;
    return { equal: actual.length === expected.length && actual.every((value, i) => value === expected[i]),
      unchanged: engine.getDocument() === probe.doc, selected: engine.getSelectedIds(), dpr: devicePixelRatio };
  });
}

/** Real wheel input, clipped overflow and exact settled pixels at the chosen DPR. */
export async function verifyCompletePicture({ page }) {
  await page.waitForFunction(() => ["ready", "unavailable"].includes(
    document.querySelector('[data-testid="workspace-skia-canvas"]')?.dataset.rendererStatus));
  const sourceImage = await imageAudit(page, "complete-picture").seed();
  await page.evaluate(async sourceImage => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    const engine = window.__vooEditor;
    const frame = { ...createGroupNode({ x: 100, y: 100, width: 600, height: 400 }),
      id: "complete-frame", isFrame: true, clipContent: true, fill: "#123456", strokeWidth: 1 };
    const nodes = [frame, ...Array.from({ length: 600 }, (_, i) => ({
      ...createRectNode({ x: 80 + i % 30 * 24, y: 80 + Math.floor(i / 30) * 24,
        width: 18, height: 18, fill: i % 2 ? "#ff8800" : "#ffffff" }),
      id: `complete-${i}`, parentId: frame.id,
    })), { ...sourceImage, x: 140, y: 140, parentId: frame.id }];
    engine.selectExactly([]); engine.setTool("select");
    engine.setDoc({ ...engine.getDocument(), isCanvasRoot: true, width: 1000, height: 800, nodes });
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 180 }, pendingArtboardFitId: null });
    await document.fonts.ready;
  }, sourceImage);
  const artwork = page.getByTestId("editor-artwork-fallback");
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkWarm === "true");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkWarm === "true");
  await page.evaluate(() => {
    const engine = window.__vooEditor, original = engine.renderLayerPass;
    window.__completePictureProbe = { paints: 0, doc: engine.getDocument(), original };
    engine.renderLayerPass = (...args) => { window.__completePictureProbe.paints++; return original(...args); };
  });
  const box = await page.getByTestId("editor-pages").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  try { await page.mouse.wheel(0, 140); }
  finally { await page.keyboard.up("Control"); }
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await artwork.getAttribute("data-artwork-state"), "preview");
  assert.equal(await page.evaluate(() => window.__completePictureProbe.paints), 0,
    "Exposing empty workspace must not repaint a completely captured clipping frame");
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkState === "exact");
  const comparison = await compareExact(page);
  assert.equal(comparison.equal, true, "Settled clipped artwork must match a fresh full render byte for byte");
  assert.equal(comparison.unchanged, true);
  assert.deepEqual(comparison.selected, []);

  // An enlarged frame is only partially cached: fractional pan must keep the
  // backing size stable and reuse the existing overscan, without the full-scene shortcut.
  await page.evaluate(() => window.__vooEditor.updateNode("complete-frame", { width: 4000, height: 3000 }));
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkWarm === "true");
  const pan = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const base = useDesignStore.getState().editorCamera, probe = window.__completePictureProbe;
    probe.paints = 0; probe.doc = window.__vooEditor.getDocument();
    const widths = [], heights = [];
    for (let i = 0; i < 24; i += 1) {
      await new Promise(requestAnimationFrame);
      useDesignStore.getState().setEditorCamera({ ...base, panX: base.panX + i / 10, panY: base.panY + i / 10 });
      const canvas = document.querySelector('[data-testid="editor-artwork-fallback"]');
      widths.push(canvas.width); heights.push(canvas.height);
    }
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    return { paints: probe.paints, widths: new Set(widths).size, heights: new Set(heights).size };
  });
  assert.deepEqual(pan, { paints: 0, widths: 1, heights: 1 });
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkState === "exact");
  assert.deepEqual(await compareExact(page), { equal: true, unchanged: true, selected: [], dpr: comparison.dpr });
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("complete-frame").width), 600);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("complete-frame").width), 4000);
  await page.evaluate(() => { window.__vooEditor.renderLayerPass = window.__completePictureProbe.original; });
  console.log(`Complete picture: real zoom-out, clipped overflow, partial-scene fractional pan, exact pixels and undo/redo passed at DPR ${comparison.dpr}.`);
}
