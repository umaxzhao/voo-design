import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

import { checkSelectionSizeLabels } from "./selection-size-label-checks.mjs";

const checks = [];
const settle = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const editor = window.__vooEditor;
    window.__frameLabelStore = useDesignStore;
    const frame = (id, name, x, y, width, height, parentId) => ({
      id, name, kind: "group", isFrame: true, frame: true,
      x, y, width, height, parentId, fill: "#eeeeee", visible: true, opacity: 1,
    });
    editor.setDoc({ ...editor.getDocument(), isCanvasRoot: true, nodes: [
      frame("label-frame-a", "FORM — Design Culture", 40, 50, 240, 220),
      { id: "label-child", kind: "rect", parentId: "label-frame-a", x: 80, y: 90,
        width: 40, height: 40, fill: "#ff0000", visible: true, opacity: 1 },
      frame("label-nested", "Nested frame", 140, 150, 80, 60, "label-frame-a"),
      frame("label-frame-b", "Second Frame", 330, 80, 180, 160),
    ] });
    editor.setTool("select");
    editor.selectExactly(["label-child"]);
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 300 }, pendingArtboardFitId: null });
    document.addEventListener("gotpointercapture", event => {
      window.__frameLabelCapture = event.target.getAttribute("data-testid");
    }, true);
  });
  const label = page.locator('[data-testid="editor-canvas-frame-label"][data-frame-id="label-frame-a"]');
  await label.waitFor();
  await settle(page);
  assert.equal(await page.getByTestId("editor-canvas-frame-label").count(), 2,
    "Nested frames retain their existing outer-label visibility policy");

  for (const zoom of [1, 0.5, 2]) {
    await page.evaluate(zoom => {
      window.__vooEditor.selectExactly(["label-child"]);
      window.__frameLabelStore.setState({ editorCamera: { zoom, panX: 400, panY: 300 } });
    }, zoom);
    await settle(page);
    const before = await page.evaluate(() => ({
      doc: JSON.stringify(window.__vooEditor.getDocument()),
      layout: JSON.stringify(window.__frameLabelStore.getState().editorArtboardLayouts),
      camera: { ...window.__frameLabelStore.getState().editorCamera },
    }));
    const text = await label.locator("span").boundingBox();
    assert.ok(text);
    const point = { x: text.x + Math.min(12, text.width / 2), y: text.y + text.height / 2 };
    const hit = await page.evaluate(point => {
      const element = document.elementFromPoint(point.x, point.y);
      return { tag: element?.tagName, frame: element?.closest("[data-frame-id]")?.getAttribute("data-frame-id") };
    }, point);
    assert.equal(hit.frame, "label-frame-a", "The visible name must be the actual pointer target");
    await page.mouse.click(point.x, point.y);
    await settle(page);
    const after = await page.evaluate(() => ({
      selected: window.__vooEditor.getSelectedIds(),
      doc: JSON.stringify(window.__vooEditor.getDocument()),
      layout: JSON.stringify(window.__frameLabelStore.getState().editorArtboardLayouts),
      camera: { ...window.__frameLabelStore.getState().editorCamera },
      pointerCapture: window.__frameLabelCapture,
    }));
    console.log(JSON.stringify({ frameLabelClick: { zoom, hit, selected: after.selected, pointerCapture: after.pointerCapture } }));
    assert.deepEqual(after.selected, ["label-frame-a"], "Clicking the Frame name selects that Frame instead of retaining its child");
    assert.equal(after.doc, before.doc, "Selecting a label must not edit artwork");
    assert.equal(after.layout, before.layout, "Selecting a label must not move the containing artboard");
    assert.deepEqual(after.camera, before.camera, "Selecting a label must not pan or fit the camera");
    checks.push(`Frame name click selects its Frame at ${zoom}x without document, layout or camera changes`);

    await page.evaluate(() => window.__vooEditor.selectExactly([]));
    const icon = await label.getByTestId("editor-canvas-frame-icon").boundingBox();
    assert.ok(icon);
    await page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2);
    await settle(page);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["label-frame-a"]);
  }
  checks.push("Frame icon and name use the same selection operation");

  await page.evaluate(() => {
    window.__vooEditor.selectExactly(["label-frame-a", "label-child"]);
    window.__frameLabelStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 300 } });
  });
  await settle(page);
  const second = page.locator('[data-testid="editor-canvas-frame-label"][data-frame-id="label-frame-b"]');
  await second.click();
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["label-frame-b"]);
  checks.push("A plain title click replaces a prior multiple selection with the target Frame");
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await label.focus();
  await page.keyboard.press("Enter");
  await settle(page);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["label-frame-a"]);
  checks.push("The same title is keyboard operable through its native button semantics");
  await checkSelectionSizeLabels(page);
});
console.log(JSON.stringify({ passed: checks }, null, 2));
