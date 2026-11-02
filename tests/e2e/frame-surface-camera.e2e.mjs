import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const settled = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));

/** Sample the real compositor screenshot rather than an engine readback proxy. */
async function screenshotPixel(page, point) {
  const bytes = await page.screenshot({ clip: { x: Math.floor(point.x), y: Math.floor(point.y), width: 1, height: 1 } });
  return page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, bytes.toString("base64"));
}

await withEditorBrowser(async ({ page }) => {
  const ids = await page.evaluate(async () => {
    const { useDesignStore: store } = await import("/src/store/design_store.js");
    window.__surfaceReviewStore = store;
    const editor = window.__vooEditor;
    const first = store.getState().editingNodeId;
    const rect = (id, fill) => ({ id, kind: "rect", x: 30, y: 30, width: 180, height: 120,
      fill, visible: true, opacity: 1 });
    const doc = { ...editor.getDocument(), isCanvasRoot: true, width: 300, height: 200,
      crop: null, nodes: [rect("surface-first-rect", "#ff0000")] };
    editor.setDoc(doc); editor.selectExactly([]); editor.setTool("select");
    const second = "surface-second-page";
    const next = { id: second, type: "imageEditor", position: { x: 0, y: 0 }, data: {
      label: "Surface second page", canvasType: "design",
      editorDoc: { ...doc, canvasId: second, nodes: [rect("surface-second-rect", "#0000ff")] },
    } };
    store.setState(state => ({
      nodes: [...state.nodes.map(node => node.id === first ? { ...node, data: { ...node.data, editorDoc: doc } } : node), next],
      editingNodeIds: [first, second], editingNodeId: first, pendingArtboardFitId: null,
      editorCamera: { zoom: 1, panX: 300, panY: 250 },
      editorArtboardLayouts: {
        [first]: { x: 0, y: 0, width: 300, height: 200 },
        [second]: { x: 400, y: 0, width: 300, height: 200 },
      },
    }));
    return { first, second };
  });
  const secondPage = page.locator(`[data-editor-artboard][data-node-id="${ids.second}"]`);
  await secondPage.waitFor();
  await page.waitForFunction(id => window.__vooEditors?.[id]?.getNode("surface-second-rect"), ids.second);
  await page.locator('[data-testid="workspace-skia-canvas"][data-renderer-status="ready"]').waitFor({ state: "visible" });
  await settled(page);
  // Both pages are already visible in one shared view. Preserve that view on
  // focus instead of asking the switcher to fit a newly opened page mid-press.
  await page.evaluate(async ids => {
    const { useDesignStore: store } = await import("/src/store/design_store.js");
    const camera = { ...store.getState().editorCamera };
    store.setState({ editorPageCameras: { [ids.first]: camera, [ids.second]: camera }, pendingArtboardFitId: null });
  }, ids);
  const point = await secondPage.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 3, y: box.top + box.height * 0.45 };
  });
  assert.deepEqual(await screenshotPixel(page, point), [0, 0, 255, 255]);
  const beforeHit = await page.evaluate(point => {
    const element = document.elementFromPoint(point.x, point.y);
    return { testId: element?.getAttribute("data-testid"), pageId: element?.closest("[data-editor-artboard]")?.getAttribute("data-node-id") };
  }, point);
  console.log(JSON.stringify({ multiPageHit: { ids, point, beforeHit } }));
  assert.equal(beforeHit.pageId, ids.second, "A focused page's free-canvas surface must not cover visible artwork in another page");
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(id => window.__surfaceReviewStore.getState().editingNodeId === id, ids.second);
  await settled(page);
  assert.deepEqual(await page.evaluate(id => window.__vooEditors[id].getSelectedIds(), ids.second), ["surface-second-rect"]);
  console.log(JSON.stringify({ passed: ["the focused free-canvas hit surface leaves a neighbouring visible page directly selectable"] }));
});

await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { useDesignStore: store } = await import("/src/store/design_store.js");
    window.__surfaceCameraStore = store;
    const editor = window.__vooEditor;
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 80;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ff8800"; ctx.fillRect(0, 0, 80, 80);
    const image = await editor.insertImage(canvas.toDataURL(), { x: 50, y: 50 });
    editor.setDoc({ ...editor.getDocument(), isCanvasRoot: true, width: 600, height: 400,
      crop: null, nodes: [{ ...image, id: "surface-camera-image", x: -100, y: -100, width: 80, height: 80 }] });
    editor.selectExactly([]); editor.setTool("select");
  });
  await page.getByTestId("editor-artwork-fallback").waitFor();
  const point = () => page.evaluate(() => {
    const editor = window.__vooEditor, zoom = editor.getViewport().zoom, zero = editor.toDocPoint(0, 0);
    return { x: (-60 - zero.x) * zoom, y: (-60 - zero.y) * zoom };
  });
  const snapshots = [];
  for (const camera of [
    { zoom: 1, panX: 500, panY: 350 },
    { zoom: 2, panX: 600, panY: 400 },
    { zoom: 0.5, panX: 400, panY: 300 },
  ]) {
    await page.evaluate(camera => window.__surfaceCameraStore.setState({ editorCamera: camera, pendingArtboardFitId: null }), camera);
    await settled(page);
    const target = await point();
    const pixel = await screenshotPixel(page, target);
    snapshots.push({ camera, target, pixel });
    assert.deepEqual(pixel, [255, 136, 0, 255]);
    assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: -60, y: -60 })), "#ff8800");
    await page.mouse.click(target.x, target.y); await settled(page);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["surface-camera-image"]);
    await page.evaluate(() => window.__vooEditor.selectExactly([]));
  }
  await page.setViewportSize({ width: 1700, height: 1100 }); await settled(page);
  const resized = await point();
  assert.deepEqual(await screenshotPixel(page, resized), [255, 136, 0, 255]);
  await page.mouse.click(resized.x, resized.y); await settled(page);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["surface-camera-image"]);
  console.log(JSON.stringify({ passed: ["negative media pixels, sampling and direct selection follow pan and 0.5x/1x/2x zoom at DPR 2",
    "resizing retains the signed-coordinate artwork and hit target"], snapshots }));
}, { deviceScaleFactor: 2 });
