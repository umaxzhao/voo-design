import { createAuthoredFrame } from "./authored-frame-fixture.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const features = /\/(?:raster-(?:matting-actions|selection-actions|repaint-actions|outpaint-action|image-actions)|portrait_retouch)\.js(?:\?|$)/;
const mockInference = `
export const MATTE_REFINE_TOO_LARGE = 'large';
export function isLocalMattingSupported() { return true; }
export async function isModelCached() { return true; }
export async function runLocalMatting(bitmap, { onProgress } = {}) {
  window.__mattingInferenceCount = (window.__mattingInferenceCount ?? 0) + 1;
  onProgress?.({ phase: 'inference', loaded: 1, total: 1 });
  if (window.__holdMatting) await window.__holdMatting;
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width / 2, canvas.height);
  return { blob: await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), refinement: {} };
}
export async function runRegionMatting(bitmap, _selection, options) { return runLocalMatting(bitmap, options); }
`;
const checks = [];

async function prepare(page, { canvasRoot = false, harness = true } = {}) {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.isCanvasRoot);
  if (canvasRoot) await createAuthoredFrame(page);
  await page.evaluate(async (canvasRoot) => {
    const e = window.__vooEditor;
    const initial = e.getDocument();
    const frame = canvasRoot ? initial.nodes.find(node => node.isFrame) : null;
    if (canvasRoot && (!initial.isCanvasRoot || !frame)) throw new Error("The authored fixture must retain a canvas root containing a Frame");
    const nodes = frame ? [{ ...frame, x: 0, y: 0, width: 400, height: 300, clipContent: true,
      fill: "#ffffff", fills: [{ fill: "#ffffff", opacity: 1, visible: true }], fillOpacity: 1, fillHidden: false }] : [];
    e.setDoc({ ...initial, width: canvasRoot ? initial.width : 400, height: canvasRoot ? initial.height : 300, isCanvasRoot: canvasRoot,
      backgroundColor: canvasRoot ? "transparent" : "#ffffff", nodes });
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#c09070"; ctx.fillRect(0, 0, 32, 32);
    const first = await e.insertImage(canvas.toDataURL(), { x: 116, y: 116 });
    e.updateNode(first.id, { x: 100, y: 100, width: 32, height: 32, ...(frame ? { parentId: frame.id } : {}) });
    ctx.fillStyle = "#408020"; ctx.fillRect(0, 0, 32, 32);
    const second = await e.insertImage(canvas.toDataURL(), { x: 216, y: 116 });
    e.updateNode(second.id, { x: 200, y: 100, width: 32, height: 32, ...(frame ? { parentId: frame.id } : {}) });
    e.selectExactly(canvasRoot ? [] : [first.id]);
    e.setTool("select");
    window.__rasterNodes = { first: first.id, second: second.id, frame: frame?.id };
  }, canvasRoot);
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name));
  assert.deepEqual(resources.filter(name => features.test(name)), [], "Opening an ordinary canvas must defer raster implementations");
  if (harness) {
    await page.evaluate(async () => (await import("/tests/e2e/raster-action-harness.mjs")).mountRasterHarness());
    await page.locator("#raster-action-harness button").first().waitFor();
  }
}
const state = page => page.locator("#raster-action-harness [data-raster-state]").getAttribute("data-raster-state").then(JSON.parse);
const color = (page, x, y) => page.evaluate(point => window.__vooEditor.sampleColorAt(point), { x, y });

await withEditorBrowser(async ({ page }) => {
  await page.route("**/src/canvas/editor/local_matting.js*", route => route.fulfill({ contentType: "application/javascript", body: mockInference }));
  let featureStarted, releaseMatting;
  const began = new Promise(resolve => { featureStarted = resolve; });
  const mattingReady = new Promise(resolve => { releaseMatting = resolve; });
  await page.route("**/raster-matting-actions.js*", async route => {
    featureStarted(); await mattingReady; await route.continue();
  });
  await prepare(page);
  checks.push("first canvas defers optional raster action implementations and portrait pixel engine");
  await page.locator("#raster-action-harness").getByRole("button", { name: "Mask", exact: true }).click();
  await began;
  assert.equal((await state(page)).maskBusy, true, "Cold import must immediately show busy state");
  await page.evaluate(() => window.__vooEditor.selectExactly([window.__rasterNodes.second]));
  releaseMatting();
  await page.waitForFunction(() => !window.__rasterTrace.raster.maskBusy && Boolean(window.__vooEditor.getNode(window.__rasterNodes.first).maskId));
  assert.equal(await color(page, 108, 116), "#c09070");
  assert.equal(await color(page, 124, 116), "#ffffff");
  assert.equal(await color(page, 224, 116), "#408020");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await color(page, 124, 116), "#c09070");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode(window.__rasterNodes.first).maskId ?? null), null);
  checks.push("cold matting retains the click target, applies actual mask pixels and undoes in one step");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    const nodeId = window.__rasterNodes.first;
    window.__mattingInferenceCount = 0;
    window.__strokeClearCount = 0;
    const clear = e.clearPendingObjectStroke.bind(e);
    e.clearPendingObjectStroke = () => { window.__strokeClearCount += 1; clear(); };
    e.selectExactly([nodeId]);
    window.__rasterTrace.setProps({ pendingObjectStroke: { nodeId, points: [[101, 101], [110, 125]], intent: "select", mode: "replace", size: 10 } });
  });
  await page.waitForFunction(() => window.__vooEditor.getPixelSelection() && !window.__rasterTrace.raster.lassoBusy);
  await page.evaluate(() => { for (let index = 0; index < 5; index += 1) window.__rasterTrace.refresh(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.__mattingInferenceCount), 1);
  assert.equal(await page.evaluate(() => window.__strokeClearCount), 1);
  checks.push("pending object stroke is consumed once across render and busy-state changes");

  await page.evaluate(() => {
    window.__heldInferenceCount = window.__mattingInferenceCount;
    window.__heldInferenceHistory = JSON.stringify(window.__vooEditor.captureDocumentSession().history);
    window.__holdMatting = new Promise(resolve => { window.__releaseMatting = resolve; });
  });
  await page.locator("#raster-action-harness").getByRole("button", { name: "Mask", exact: true }).click();
  await page.waitForFunction(() => window.__mattingInferenceCount > window.__heldInferenceCount);
  await page.locator("#raster-action-harness").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(async () => { window.__releaseMatting(); await window.__rasterTrace.lastAction; window.__holdMatting = null; });
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode(window.__rasterNodes.first).maskId ?? null), null);
  assert.equal(await color(page, 124, 116), "#c09070");
  assert.equal((await state(page)).maskError, false);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.captureDocumentSession().history)),
    await page.evaluate(() => window.__heldInferenceHistory));
  checks.push("canceling an already running inference discards the late matte without pixel/history mutation");

  let imageFeatureStarted, releaseImage;
  const imageBegan = new Promise(resolve => { imageFeatureStarted = resolve; });
  const imageReady = new Promise(resolve => { releaseImage = resolve; });
  await page.route("**/raster-image-actions.js*", async route => {
    imageFeatureStarted(); await imageReady; await route.continue();
  });
  await page.locator("#raster-action-harness").getByRole("button", { name: "Retouch", exact: true }).click();
  await imageBegan;
  assert.equal((await state(page)).retouchBusy, true);
  await page.locator("#raster-action-harness").getByRole("button", { name: "Cancel", exact: true }).click();
  releaseImage();
  await page.evaluate(async () => await window.__rasterTrace.lastAction);
  await page.waitForFunction(() => performance.getEntriesByType("resource").some(entry => entry.name.includes("raster-image-actions.js")));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal((await state(page)).retouchBusy, false);
  assert.equal(await page.evaluate(() => window.__rasterTrace.outputs.length), 0);
  assert.equal(await color(page, 108, 116), "#c09070");
  checks.push("cancel while an optional module loads does not run or materialize the old action");

  await page.locator("#raster-action-harness").getByRole("button", { name: "Retouch", exact: true }).click();
  await page.waitForFunction(() => window.__rasterTrace.outputs.length === 1 && !window.__rasterTrace.raster.retouchBusy);
  const result = await page.evaluate(async () => {
    const output = window.__rasterTrace.outputs[0];
    const img = await createImageBitmap(await (await fetch(output.asset.dataUrl)).blob());
    const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
    const pixel = [...ctx.getImageData(8, 16, 1, 1).data]; img.close();
    return { pixel, operation: output.operation, source: output.sourceSceneNodeId,
      workflow: output.sourceWorkflowNodeId, patch: output.scenePatch, width: output.sourceSnapshot.width };
  });
  assert.equal(result.operation, "aiRepair");
  assert.equal(result.workflow, await page.evaluate(() => window.__rasterTrace.sourceWorkflowNodeId));
  const candidate = await page.evaluate(async () => {
    const state = (await import("/src/store/design_store.js")).useDesignStore.getState();
    const output = window.__rasterTrace.materialized[0];
    const page = state.nodes.find(node => node.id === output.candidateNodeId);
    return { id: page?.id, sourceId: window.__rasterTrace.sourceWorkflowNodeId,
      target: page?.data?.editorDoc?.nodes.find(node => node.id === window.__rasterNodes.first) };
  });
  assert.ok(candidate.id && candidate.id !== candidate.sourceId, "The real store sink must create a separate candidate page");
  assert.ok(candidate.target?.imageId, "Candidate image bytes must have a persistent image ID");
  assert.equal(result.width, 400);
  assert.deepEqual(result.patch, { type: "replaceBitmap" });
  assert.notDeepEqual(result.pixel, [192, 144, 112, 255], "Actual CPU retouch must change candidate pixels");
  assert.equal(await color(page, 108, 116), "#c09070", "Candidate generation must not overwrite the source");
  checks.push("on-demand CPU retouch materializes a real persisted candidate page without changing source pixels");
}, { openDocument: false, mcpLink: false });

await withEditorBrowser(async ({ page }) => {
  let releaseFeature, featureStarted;
  const began = new Promise(resolve => { featureStarted = resolve; });
  const ready = new Promise(resolve => { releaseFeature = resolve; });
  await page.route("**/raster-image-actions.js*", async route => {
    featureStarted(); await ready; await route.continue();
  });
  await prepare(page);
  await page.evaluate(() => {
    window.__rasterOriginalEngine = window.__vooEditor;
    window.__rasterOriginalNodes = JSON.stringify(window.__vooEditor.getDocument().nodes);
  });
  await page.locator("#raster-action-harness").getByRole("button", { name: "Retouch", exact: true }).click();
  await began;
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().addEditorPage());
  await page.waitForFunction(() => window.__vooEditor && window.__vooEditor !== window.__rasterOriginalEngine);
  await page.evaluate(() => window.__rasterTrace.setProps({ engine: window.__vooEditor }));
  await page.waitForFunction(() => !window.__rasterTrace.raster.retouchBusy);
  releaseFeature();
  await page.evaluate(async () => await window.__rasterTrace.lastAction);
  await page.waitForFunction(() => performance.getEntriesByType("resource").some(entry => entry.name.includes("raster-image-actions.js")));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.__rasterTrace.outputs.length), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__rasterOriginalEngine.getDocument().nodes) === window.__rasterOriginalNodes), true);
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.some(node => node.kind === "image")), false);
  checks.push("changing to another real editor engine during cold loading discards the old action without touching either document");
}, { openDocument: false, mcpLink: false });

await withEditorBrowser(async ({ page }) => {
  await prepare(page, { canvasRoot: true, harness: false });
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 450, panY: 450 } });
    window.__uiRetouchSourceEngine = window.__vooEditor;
    window.__uiRetouchSourceId = useDesignStore.getState().editingNodeId;
    window.__rasterUiStore = useDesignStore;
    const doc = window.__vooEditor.getDocument();
    if (!doc.isCanvasRoot || !doc.nodes.find(node => node.id === window.__rasterNodes.frame)?.isFrame) {
      throw new Error("The real UI scenario must retain its authored canvas root and Frame");
    }
    if (doc.nodes.filter(node => node.parentId === window.__rasterNodes.frame && node.kind === "image").length !== 2) {
      throw new Error("Both images must be children of the real Frame");
    }
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const imagePoint = await page.evaluate(() => {
    const rect = document.querySelector(`[data-editor-artboard][data-node-id="${window.__uiRetouchSourceId}"]`).getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + 116 * rect.width / doc.width, y: rect.top + 116 * rect.height / doc.height };
  });
  await page.mouse.click(imagePoint.x, imagePoint.y);
  await page.waitForFunction(() => window.__vooEditor.getSelected()?.id === window.__rasterNodes.first);
  assert.equal(await color(page, 50, 50), "#ffffff", "The actual Frame fill must be visible inside the free canvas");
  const more = page.getByTestId("editor-taskbar-more").first();
  await more.waitFor({ state: "visible" });
  await more.click();
  await page.getByTestId("more-retouch").click();
  await page.getByTestId("more-retouch-apply").click();
  await page.waitForFunction(() => {
    const state = window.__rasterUiStore.getState();
    const candidate = state.nodes.find(node => node.data?.generatedOutput?.operation === "aiRepair");
    return candidate && state.editingNodeId === candidate.id && window.__vooEditor &&
      window.__vooEditor !== window.__uiRetouchSourceEngine &&
      window.__vooEditor.getNode(window.__rasterNodes.first)?.imageId;
  });
  const visible = await page.evaluate(async () => {
    const state = (await import("/src/store/design_store.js")).useDesignStore.getState();
    const candidate = state.nodes.find(node => node.id === state.editingNodeId);
    return { candidateId: candidate.id, sourceId: window.__uiRetouchSourceId,
      sourcePixel: window.__uiRetouchSourceEngine.sampleColorAt({ x: 108, y: 116 }),
      candidatePixel: window.__vooEditor.sampleColorAt({ x: 108, y: 116 }),
      unchangedSibling: window.__vooEditor.sampleColorAt({ x: 224, y: 116 }),
      persisted: Boolean(candidate.data.generatedOutput?.imageId) };
  });
  assert.notEqual(visible.candidateId, visible.sourceId);
  assert.equal(visible.sourcePixel, "#c09070");
  assert.notEqual(visible.candidatePixel, "#c09070");
  assert.equal(visible.unchangedSibling, "#408020");
  assert.equal(visible.persisted, true);
  const screenPixel = await page.evaluate(() => {
    const rect = document.querySelector(`[data-editor-artboard][data-node-id="${window.__rasterUiStore.getState().editingNodeId}"]`).getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + 108 * rect.width / doc.width, y: rect.top + 116 * rect.height / doc.height };
  });
  const screenshot = await page.screenshot({ clip: { x: Math.floor(screenPixel.x), y: Math.floor(screenPixel.y), width: 1, height: 1 } });
  const displayed = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, screenshot.toString("base64"));
  const hex = visible.candidatePixel.slice(1);
  assert.deepEqual(displayed, [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255],
    "The candidate's actual displayed pixel must match its changed image, not only the engine sample");
  checks.push("New canvas root with an authored Frame supports pointer-selected image Retouch/Apply and automatically displays the persisted candidate while preserving source and sibling pixels");
}, { openDocument: false, mcpLink: false });

console.log(JSON.stringify({ passed: checks }, null, 2));
