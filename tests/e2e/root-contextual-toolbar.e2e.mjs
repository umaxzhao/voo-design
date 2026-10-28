import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.isCanvasRoot);
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    const { useDesignStore } = await import("/src/store/design_store.js");
    window.__rootToolbarStore = useDesignStore;
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 260, panY: 100 } });
    e.setTool("select"); e.selectExactly([]);
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext("2d"); context.fillStyle = "#c09070"; context.fillRect(0, 0, 64, 64);
    const image = await e.insertImage(canvas.toDataURL(), { x: 400, y: 300 });
    e.updateNode(image.id, { x: 350, y: 250, width: 100, height: 100 });
    window.__rootToolbarImage = image.id;
    e.selectExactly([]);
  });
  await settle();
  const bars = page.locator('[data-testid="editor-contextual-taskbar"]:visible');
  assert.equal(await bars.count(), 0, "An empty selection on the real root canvas must have no persistent contextual bar");
  const point = (x, y) => page.evaluate(({ x, y }) => {
    const e = window.__vooEditor;
    const board = document.querySelector('[data-editor-artboard]').getBoundingClientRect();
    const doc = e.getDocument();
    return { x: board.left + x * board.width / doc.width, y: board.top + y * board.height / doc.height };
  }, { x, y });
  const center = await point(400, 300);
  await page.mouse.click(center.x, center.y);
  await bars.waitFor();
  assert.equal(await page.evaluate(() => window.__vooEditor.getSelected()?.id), await page.evaluate(() => window.__rootToolbarImage));
  assert.equal(await bars.count(), 1);
  await page.getByTestId("editor-taskbar-more").click();
  await page.getByTestId("more-retouch").waitFor();
  await page.getByTestId("more-retouch").click();
  await page.getByTestId("more-retouch-apply").waitFor();
  await page.getByTestId("editor-taskbar-more").click();
  checks.push("default New retains its root document, real image click exposes one toolbar and the actual portrait-retouch controls");

  const before = await bars.boundingBox();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 15, center.y + 10, { steps: 3 });
  await settle();
  const duringDrag = await bars.boundingBox();
  assert.ok(Math.abs(duringDrag.x - before.x - 15) < 1);
  assert.ok(Math.abs(duringDrag.y - before.y - 10) < 1);
  await page.mouse.move(center.x + 30, center.y + 20, { steps: 3 });
  await page.mouse.up();
  await settle();
  assert.deepEqual(await page.evaluate(() => { const n = window.__vooEditor.getNode(window.__rootToolbarImage); return [n.x, n.y]; }), [380, 270]);
  const moved = await bars.boundingBox();
  assert.ok(Math.abs(moved.x - before.x - 30) < 1, "Object movement must move its contextual bar horizontally");
  assert.ok(Math.abs(moved.y - before.y - 20) < 1, "Object movement must move its contextual bar vertically");
  await page.evaluate(() => {
    const store = window.__rootToolbarStore;
    const camera = store.getState().editorCamera;
    store.setState({ editorCamera: { ...camera, panX: camera.panX + 20, panY: camera.panY + 15 } });
  });
  await settle();
  const panned = await bars.boundingBox();
  assert.ok(Math.abs(panned.x - moved.x - 20) < 1);
  assert.ok(Math.abs(panned.y - moved.y - 15) < 1);
  await page.evaluate(() => {
    const store = window.__rootToolbarStore;
    store.setState({ editorCamera: { ...store.getState().editorCamera, zoom: 0.8 } });
  });
  await settle();
  const zoomed = await bars.boundingBox(), lower = await point(430, 370);
  assert.ok(Math.abs(zoomed.x + zoomed.width / 2 - lower.x) < 1);
  assert.ok(Math.abs(zoomed.y - lower.y - 6) < 2);
  checks.push("the single bar tracks object geometry, shared-camera pan and zoom rather than the whole page bounds");

  await page.evaluate(async () => {
    const e = window.__vooEditor;
    const { createRectNode } = await import("/src/canvas/editor/scene_model_node_builders.js");
    const other = { ...createRectNode({ x: 500, y: 270, width: 50, height: 50, fill: "#ffffff" }), id: "root-toolbar-other" };
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, other] });
    e.selectExactly([window.__rootToolbarImage, other.id]);
  });
  await settle();
  assert.equal(await bars.count(), 1);
  await page.getByTestId("editor-taskbar-alignment-menu").waitFor();
  checks.push("multi-selection reuses one contextual bar with the existing alignment menu");
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly([window.__rootToolbarImage]);
    e.selectAllPixels();
  });
  await settle();
  await page.getByTestId("editor-taskbar-deselect").waitFor();
  assert.equal(await bars.count(), 1);
  await page.getByTestId("editor-taskbar-deselect").click();
  await page.evaluate(() => { window.__vooEditor.selectExactly([]); window.__vooEditor.setTool("pen"); });
  await settle();
  await page.getByTestId("editor-taskbar-finishPath").waitFor();
  assert.equal(await bars.count(), 1);
  await page.evaluate(() => { window.__vooEditor.setTool("select"); window.__vooEditor.selectExactly([]); });
  await settle();
  assert.equal(await bars.count(), 0);
  checks.push("pixel and pen edit contexts remain reachable and clearing the selection returns the root canvas to a clean surface");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { openDocument: false });
