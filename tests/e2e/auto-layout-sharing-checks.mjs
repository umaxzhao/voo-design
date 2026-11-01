import assert from "node:assert/strict";

/** Actual engine edits must keep static effect caches without changing cold pixels. */
export async function verifyAutoLayoutSharing(page, tool) {
  const warm = await page.evaluate(() => {
    const e = window.__vooEditor;
    const rect = (id, x, y, patch = {}) => ({ id, kind: "rect", visible: true,
      x, y, width: 40, height: 30, fill: "#ff5500", strokeWidth: 0, ...patch });
    e.selectExactly([]);
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: true,
      backgroundColor: "transparent", crop: null, nodes: [
        rect("layout-cache-frame", 0, 0, { kind: "group", isFrame: true, width: 120, height: 40,
          autoLayout: { direction: "horizontal" } }),
        rect("layout-cache-child", 0, 0, { parentId: "layout-cache-frame" }),
        rect("layout-cache-paint", 20, 80, { width: 96, height: 64,
          effects: { innerShadow: { enabled: true, color: "#001144", opacity: 80, offsetX: 5, offsetY: 3, blur: 4 } } }),
        rect("layout-cache-control", 350, 220),
      ] });
    const canvas = document.createElement("canvas");
    const draw = target => e.renderLayerPass(target, e.getDocument().nodes.map(n => n.id), {
      stageWidth: 600, stageHeight: 400, viewport: { zoom: 1, panX: 0, panY: 0 },
    });
    const original = CanvasRenderingContext2D.prototype.getImageData;
    let reads = 0;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      reads++; return original.apply(this, args);
    };
    const stable = e.getNode("layout-cache-paint");
    let afterWarm, afterEdits;
    try {
      draw(canvas); afterWarm = reads;
      for (let i = 0; i < 6; i += 1) {
        e.updateNode("layout-cache-control", { x: 351 + i });
        draw(canvas);
      }
      afterEdits = reads;
    } finally { CanvasRenderingContext2D.prototype.getImageData = original; }
    window.__layoutSharingColdPixels = () => {
      const session = e.captureDocumentSession();
      draw(canvas);
      const actual = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      const reference = document.createElement("canvas");
      try {
        e.setDoc({ ...e.getDocument(), nodes: e.getDocument().nodes.map(n => ({ ...n })) }, { commit: false });
        draw(reference);
        const expected = reference.getContext("2d").getImageData(0, 0, reference.width, reference.height).data;
        return { equal: actual.length === expected.length && actual.every((v, i) => v === expected[i]),
          width: canvas.width, height: canvas.height };
      } finally { e.restoreDocumentSession(session); }
    };
    return { afterWarm, additionalReads: afterEdits - afterWarm,
      stableReference: e.getNode("layout-cache-paint") === stable,
      cold: window.__layoutSharingColdPixels() };
  });
  assert.ok(warm.afterWarm > 0, "The non-empty effect must rasterize on a cold node");
  assert.equal(warm.stableReference, true, "Unrelated layout edits must retain the effected node");
  assert.equal(warm.additionalReads, 0, "Six unrelated edits must not read the unchanged alpha plane again");
  assert.deepEqual(warm.cold, { equal: true, width: 600, height: 400 });

  await page.locator('[data-layer-row-id="layout-cache-paint"]').getByTitle("Rename layer", { exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.__vooEditor.getNode("layout-cache-paint").x === 21);
  assert.equal(await page.evaluate(() => window.__layoutSharingColdPixels().equal), true);
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("layout-cache-paint").x === 20);
  await tool("mutate_layer_style", { layerId: "layout-cache-paint", patch: { fill: "#3388ff", opacity: .5 } });
  assert.equal(await page.evaluate(() => window.__layoutSharingColdPixels().equal), true);
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("layout-cache-paint").fill === "#ff5500");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("layout-cache-paint").fill === "#3388ff");
  assert.equal(await page.evaluate(() => window.__layoutSharingColdPixels().equal), true);
  await page.evaluate(() => { delete window.__layoutSharingColdPixels; });
  return "Auto Layout retains static effect identity/readbacks; real nudge, Agent styles and keyboard history match exact cold pixels";
}
