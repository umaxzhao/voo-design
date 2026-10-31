import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { nestedObjectsFixture, nestedFrames, frame, shape } from "./nested-objects-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "nested-masks");
  const masked = () => [...nestedFrames(),
    shape("base", "inner", 180, 160, { kind: "ellipse", width: 120, height: 120, fill: "#ffffff" }),
    shape("paint", "inner", 150, 160, { width: 200, height: 120, clipTo: "base" })];
  await f.record("first-child-does-not-mask-against-other-frame", async () => {
    await f.seed([frame("first", 40, 40, 120, 120), shape("foreign", "first", 60, 60),
      frame("second", 220, 40, 180, 180), shape("paint", "second", 240, 60)], ["paint"]);
    const before = await f.snapshot();
    const index = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
    assert.equal(await page.evaluate(() => window.__vooEditor.createClippingMask()), false);
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), index);
    return { noCrossFrameMask: true, noEmptyHistory: true };
  });
  await f.record("locked-nested-layer-mask-refuses-mutation", async () => {
    await f.seed(masked().map(n => n.id === "inner" ? { ...n, locked: true } : n), ["paint"]);
    const before = await f.snapshot();
    assert.equal(await page.evaluate(() => window.__vooEditor.releaseClippingMask()), false);
    assert.deepEqual(await f.snapshot(), before);
    return { lockedAncestor: true };
  });
  await f.record("nested-ellipse-clipping-release-and-history-pixels", async () => {
    await f.seed(masked().map(n => n.id === "paint" ? { ...n, clipTo: null } : n), ["paint"]);
    const before = await f.snapshot();
    assert.equal(await f.pixel({ x: 165, y: 190 }), "#ff0000");
    await page.evaluate(() => window.__vooEditor.createClippingMask());
    assert.equal((await f.node("paint")).clipTo, "base");
    assert.equal(await f.pixel({ x: 240, y: 210 }), "#ff0000");
    assert.equal(await f.pixel({ x: 165, y: 190 }), "#ffffff");
    await f.history(before);
    const clipped = await f.snapshot();
    await page.evaluate(() => window.__vooEditor.releaseClippingMask());
    assert.equal(await f.pixel({ x: 165, y: 190 }), "#ff0000");
    await f.history(clipped);
    return { actualMaskAlpha: true, release: true, undoRedo: true };
  });
  await f.record("duplicate-inner-frame-remaps-mask-and-keeps-original-independent", async () => {
    await f.seed(masked(), ["inner"]);
    const before = await f.snapshot();
    await page.evaluate(() => window.__vooEditor.duplicateSelected());
    const added = (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(added.length, 3);
    const copiedFrame = added.find(n => n.isFrame);
    const copiedMask = added.find(n => n.kind === "ellipse");
    const copiedPaint = added.find(n => n.clipTo);
    assert.equal(copiedPaint.clipTo, copiedMask.id);
    assert.equal(copiedPaint.parentId, copiedFrame.id);
    await f.hierarchy(); await f.history(before);
    const duplicate = await f.snapshot();
    await page.evaluate(id => window.__vooEditor.updateNode(id, { fill: "#0000ff" }), copiedPaint.id);
    assert.equal((await f.node("paint")).fill, "#ff0000");
    assert.equal(await f.pixel({ x: 240, y: 210 }), "#0000ff");
    await f.history(duplicate);
    return { wholeSubtree: true, remappedMask: true, independentPixels: true, undoRedo: true };
  });
  await f.record("move-masked-inner-frame-as-unit", async () => {
    await f.seed(masked(), ["inner"]);
    const before = await f.snapshot();
    await f.drag({ x: 410, y: 340 }, { x: 450, y: 360 });
    assert.equal((await f.node("inner")).x, 160);
    assert.equal((await f.node("paint")).x, 190);
    assert.equal((await f.node("base")).x, 220);
    assert.equal((await f.node("paint")).clipTo, "base");
    assert.equal(await f.pixel({ x: 280, y: 230 }), "#ff0000");
    await f.hierarchy(); await f.history(before);
    return { pointerDrag: true, maskFollowsGeometry: true, undoRedo: true };
  });
  await f.record("delete-mask-base-releases-sibling-and-undo-restores-clip", async () => {
    await f.seed(masked(), ["base"]);
    const before = await f.snapshot();
    await f.focus(); await page.keyboard.press("Backspace"); await f.settle();
    assert.equal(await f.node("base"), null);
    assert.equal((await f.node("paint")).clipTo ?? null, null);
    assert.equal(await f.pixel({ x: 165, y: 190 }), "#ff0000");
    await f.hierarchy(); await f.history(before);
    return { keyboardDelete: true, releasedReference: true, restoredPixels: true };
  });
  await f.record("outer-clipping-controls-overflowing-inner-mask", async () => {
    await f.seed([frame("outer", 40, 40, 180, 220), frame("inner", 150, 80, 200, 160, { parentId: "outer" }),
      shape("base", "inner", 180, 100, { width: 140, height: 100, fill: "#ffffff" }),
      shape("paint", "inner", 180, 100, { width: 140, height: 100, clipTo: "base" })], ["outer"]);
    assert.equal(await f.pixel({ x: 240, y: 140 }), null);
    const before = await f.snapshot();
    await page.getByTestId("editor-properties-panel").getByRole("checkbox", { name: "Clip content", exact: true }).click();
    await page.waitForFunction(() => window.__vooEditor.getNode("outer").clipContent === false);
    assert.equal(await f.pixel({ x: 240, y: 140 }), "#ff0000");
    await f.history(before);
    return { inspectorToggle: true, ancestorIntersection: true, undoRedo: true };
  });
  await f.record("masked-out-pixels-do-not-capture-canvas-selection", async () => {
    await f.seed(masked());
    const point = await f.client({ x: 165, y: 190 });
    await page.mouse.click(point.x, point.y); await f.settle();
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["inner"]);
    const visible = await f.client({ x: 240, y: 210 });
    await page.mouse.click(visible.x, visible.y); await f.settle();
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["paint"]);
    return { actualMaskHitTesting: true, visibleContentStillSelectable: true };
  });
  await f.record("zero-coverage-mask-content-does-not-intercept-clicks", async () => {
    for (const patch of [{ maskType: "luminance", fill: "#000000" }, { fillHidden: true }]) {
      await f.seed(masked().map(n => n.id === "base" ? { ...n, maskBase: true, ...patch } : n));
      const p = await f.client({ x: 240, y: 210 });
      assert.equal(await f.pixel({ x: 240, y: 210 }), "#ffffff");
      await page.mouse.click(p.x, p.y); await f.settle();
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["inner"]);
    }
    return { luminanceCoverage: true, hiddenFillCoverage: true, invisibleMaskBaseNotSelectable: true };
  });
  await f.record("clipped-frame-contents-follow-the-frame-mask", async () => {
    await f.seed([frame("outer", 40, 40, 620, 440),
      shape("restriction", "outer", 150, 150, { width: 100, height: 100, fill: "#ffffff" }),
      shape("base", "outer", 150, 150, { width: 200, height: 120, fill: "#ffffff", clipTo: "restriction" }),
      frame("content", 120, 120, 250, 200, { parentId: "outer" }),
      shape("paint", "content", 120, 120, { width: 250, height: 200 })], ["content"]);
    const before = await f.snapshot();
    await page.evaluate(() => window.__vooEditor.createClippingMask());
    assert.equal(await f.pixel({ x: 200, y: 200 }), "#ff0000");
    assert.equal(await f.pixel({ x: 300, y: 200 }), "#ffffff");
    const exported = await page.evaluate(async () => {
      const e = window.__vooEditor;
      const png = e.exportSelectionPng(["outer"]).dataUrl;
      const svg = URL.createObjectURL(new Blob([e.getNodeSvg("outer")], { type: "image/svg+xml" }));
      const read = async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        return [[160, 160], [260, 160]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
      };
      try { return { png: await read(png), svg: await read(svg) }; }
      finally { URL.revokeObjectURL(svg); }
    });
    for (const format of ["png", "svg"]) assert.deepEqual(exported[format], [[255, 0, 0, 255], [255, 255, 255, 255]], format);
    await f.hierarchy(); await f.history(before);
    await page.evaluate(() => window.__vooEditor.updateNode("content", { opacity: 0.5 }));
    const half = await f.pixel({ x: 200, y: 200 });
    // Successive 8-bit alpha surfaces may round a channel once per composite.
    assert.equal(parseInt(half.slice(1, 3), 16), 255);
    assert.ok(Math.abs(parseInt(half.slice(3, 5), 16) - 128) <= 2, half);
    assert.ok(Math.abs(parseInt(half.slice(5, 7), 16) - 128) <= 2, half);
    await page.evaluate(() => window.__vooEditor.updateNode("base", { opacity: 0.5 }));
    const quarter = await f.pixel({ x: 200, y: 200 });
    assert.ok(Math.abs(parseInt(quarter.slice(3, 5), 16) - 191) <= 2, quarter);
    assert.ok(Math.abs(parseInt(quarter.slice(5, 7), 16) - 191) <= 2, quarter);
    return { frameContentAlpha: true, chainedMasks: true, fractionalMask: true, pngSvgPixels: true, singleOpacity: true, undoRedo: true };
  });
  await f.record("nested-mask-tree-is-unique-and-removes-replaced-layers", async () => {
    await f.seed(masked());
    const rows = page.locator("[data-layer-row-id]");
    await page.waitForFunction(() => document.querySelector('[data-layer-row-id="paint"]'));
    const ids = await rows.evaluateAll(elements => elements.map(el => el.dataset.layerRowId));
    assert.equal(ids.length, new Set(ids).size, "Clipped layers cannot produce duplicate React keys");
    assert.equal(ids.filter(id => id === "paint").length, 1);
    await f.seed([...nestedFrames(), shape("replacement", "inner", 180, 180)]);
    await page.waitForFunction(() => document.querySelector('[data-layer-row-id="replacement"]'));
    assert.equal(await page.locator('[data-layer-row-id="paint"]').count(), 0);
    assert.equal(await page.locator('[data-layer-row-id="base"]').count(), 0);
    return { uniqueLayerRows: true, noStaleReactChildren: true };
  });
  f.finish();
});
