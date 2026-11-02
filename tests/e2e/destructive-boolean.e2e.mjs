import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const seed = () => page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    const nodes = [
      { ...createRectNode({ x: 40, y: 50, width: 100, height: 100, fill: "#ff0000" }), id: "a", strokeWidth: 0 },
      { ...createRectNode({ x: 100, y: 80, width: 100, height: 100, fill: "#0000ff" }), id: "b", strokeWidth: 0 },
    ];
    editor.setDoc({ ...editor.getDocument(), width: 400, height: 300, isCanvasRoot: false, backgroundColor: "#ffffff", nodes });
    editor.selectExactly(["a", "b"]);
    editor.setTool("select");
  });
  const sample = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return [[70, 110], [120, 110], [170, 110]].map(([x, y]) => window.__vooEditor.sampleColorAt({ x, y }));
  });
  const outcomes = {
    union: ["#ff0000", "#ff0000", "#ff0000"],
    subtract: ["#ff0000", "#ffffff", "#ffffff"],
    intersect: ["#ffffff", "#ff0000", "#ffffff"],
    exclude: ["#ff0000", "#ffffff", "#ff0000"],
  };

  for (const [operation, expected] of Object.entries(outcomes)) {
    await seed();
    assert.deepEqual(await sample(), ["#ff0000", "#0000ff", "#0000ff"]);
    // Public serialization folds neutral/default-only renderer metadata.
    const before = await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise().nodes));
    const result = await page.evaluate(operation => {
      const editor = window.__vooEditor;
      const returned = editor.destructiveBoolean(operation);
      return { returned, immediateNodeCount: editor.getDocument().nodes.length, id: editor.getDocument().nodes[0].id,
        kind: editor.getDocument().nodes[0].kind, selected: editor.getSelectedIds() };
    }, operation);
    assert.equal(result.returned, true, "The public engine method must finish synchronously");
    assert.equal(result.immediateNodeCount, 1);
    assert.equal(result.kind, "path");
    assert.equal(result.selected.length, 1);
    assert.deepEqual(await sample(), expected);
    await page.evaluate(() => window.__vooEditor.undo());
    assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise().nodes)), before);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["a", "b"]);
    assert.deepEqual(await sample(), ["#ff0000", "#0000ff", "#0000ff"]);
    await page.evaluate(() => window.__vooEditor.redo());
    assert.deepEqual(await sample(), expected);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), [result.id]);
    checks.push(`destructive ${operation} changes actual path pixels synchronously and restores all source nodes in one undo`);
  }

  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    editor.setDoc({ ...editor.getDocument(), nodes: [
      { ...createRectNode({ x: 100, y: 80, width: 100, height: 100, fill: "transparent" }), id: "stroke", stroke: "#0000ff", strokeWidth: 20, strokeAlign: "center" },
    ] });
    editor.selectExactly(["stroke"]);
  });
  const outline = await page.evaluate(() => {
    const editor = window.__vooEditor;
    const before = JSON.stringify(editor.serialise().nodes);
    const returned = editor.expandSelectedStroke();
    const result = editor.getNode("stroke");
    return { before, returned, kind: result.kind, pen: result.pen, fill: result.fill };
  });
  assert.deepEqual([outline.returned, outline.kind, outline.pen, outline.fill], [true, "path", true, "#0000ff"]);
  const outlinePixels = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return [[95, 130], [150, 130], [205, 130]].map(([x, y]) => window.__vooEditor.sampleColorAt({ x, y }));
  });
  assert.deepEqual(await outlinePixels(), ["#0000ff", "#ffffff", "#0000ff"]);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise().nodes)), outline.before);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["stroke"]);
  assert.deepEqual(await outlinePixels(), ["#0000ff", "#ffffff", "#0000ff"]);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("stroke").kind), "path");
  assert.deepEqual(await outlinePixels(), ["#0000ff", "#ffffff", "#0000ff"]);
  checks.push("Expand Stroke retains its rendered outline and hollow centre through a single undo/redo");

  await seed();
  await page.evaluate(() => {
    window.__vooEditor.selectExactly(["a"]);
    window.__vooEditor.removeNode("a");
  });
  assert.deepEqual(await sample(), ["#ffffff", "#0000ff", "#0000ff"]);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), []);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await sample(), ["#ff0000", "#0000ff", "#0000ff"]);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["a"]);
  await page.evaluate(async () => {
    await window.__vooEditor.redo();
    window.__vooEditor.selectExactly(["b"]);
    await window.__vooEditor.undo();
  });
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["a"]);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["b"]);
  assert.deepEqual(await sample(), ["#ffffff", "#0000ff", "#0000ff"]);
  checks.push("ordinary deletion prunes only the new history selection while explicit selection edits remain undo/redo-aware");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
