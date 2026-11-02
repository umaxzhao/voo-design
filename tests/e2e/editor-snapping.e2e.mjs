import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async (zoom, grid) => {
    await page.evaluate(async ({ zoom, grid }) => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const { setSetting } = await import("/src/shared/settings.js");
      const engine = window.__vooEditor;
      engine.setDoc({ ...engine.getDocument(), width: 600, height: 400, isCanvasRoot: false,
        backgroundColor: "#ffffff", nodes: [{ ...createRectNode({ x: 100, y: 100, width: 20, height: 20, fill: "#ff0000" }), id: "snap-target" }] });
      engine.setTool("select"); engine.selectExactly([]);
      if (!engine.getSnappingEnabled()) engine.toggleSnapping();
      engine.setGrid({ enabled: true, ...grid });
      setSetting("voo.editor.snapToGrid", true);
      useDesignStore.setState({ editorCamera: { zoom, panX: 350, panY: 150 } });
    }, { zoom, grid });
    await settled();
  };
  const client = point => page.evaluate(point => {
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: board.left + point.x * board.width / doc.width, y: board.top + point.y * board.height / doc.height };
  }, point);
  const dragTo = async point => {
    const start = await client({ x: 110, y: 110 });
    const end = await client({ x: point.x + 10, y: point.y + 10 });
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    await settled();
    await page.evaluate(() => window.__vooEditor.flushTransforms());
    return page.evaluate(() => {
      const { x, y } = window.__vooEditor.getNode("snap-target"); return { x, y };
    });
  };
  // Tiny selected objects are covered by screen-sized selection handles at 50%.
  // Read the actual document export so view overlays cannot replace artwork pixels.
  const pixel = (x, y) => page.evaluate(async ({ x, y }) => {
    const editor = window.__vooEditor;
    const url = await editor.exportFullResPng();
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(x, y, 1, 1).data;
      return "#" + [...rgba.subarray(0, 3)].map(value => value.toString(16).padStart(2, "0")).join("");
    } finally { bitmap.close(); }
  }, { x, y });

  await seed(0.5, { type: "isometric", size: 30 });
  const vertexX = 30 * Math.sqrt(3);
  const snapped = await dragTo({ x: vertexX, y: 69 });
  assert.ok(Math.abs(snapped.x - vertexX) < 1e-6);
  assert.equal(snapped.y, 60, "Zoomed-out snapping must consider the closer adjacent staggered row");
  assert.equal(await pixel(62, 70), "#ff0000");
  assert.equal(await pixel(110, 110), "#ffffff");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await pixel(110, 110), "#ff0000");
  assert.equal(await pixel(62, 70), "#ffffff");
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await pixel(62, 70), "#ff0000");
  checks.push("real pointer snaps to the nearest isometric vertex at 50% zoom, repaints and undoes/redoes once");

  await seed(1, { type: "isometric", size: 30 });
  const unsnapped = await dragTo({ x: 52, y: 69 });
  assert.deepEqual(unsnapped, { x: 52, y: 69 }, "Outside the screen-space tolerance, keep the pointer's position");
  assert.equal(await pixel(62, 79), "#ff0000");
  checks.push("the same isometric gesture outside acquisition tolerance stays at its actual pointer position");

  await seed(1, { type: "rectangular", size: 32 });
  assert.deepEqual(await dragTo({ x: 97, y: 97 }), { x: 96, y: 96 });
  assert.equal(await pixel(106, 106), "#ff0000");
  checks.push("persisted grid snapping still reaches actual rectangular-grid pointer movement");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { viewport: { width: 1440, height: 1000 } });
