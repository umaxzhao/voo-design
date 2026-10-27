import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const seed = (nodes) => page.evaluate(async (nodes) => {
    const { createRectNode, createGroupNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    editor.setDoc({ ...editor.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff",
      nodes: nodes.map((node) => ({ ...(node.kind === "group" ? createGroupNode(node) : createRectNode(node)), ...node })) });
    editor.selectExactly([]);
    editor.setTool("select");
    editor.zoomToFit();
  }, nodes);
  const node = (id) => page.evaluate((id) => window.__vooEditor.getNode(id), id);
  const pixel = (x, y) => page.evaluate(async ({ x, y }) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__vooEditor.sampleColorAt({ x, y });
  }, { x, y });

  await seed([
    { id: "group", kind: "group", x: 100, y: 100, width: 80, height: 80 },
    { id: "child", parentId: "group", x: 100, y: 100, width: 80, height: 80, fill: "#ff0000" },
    { id: "anchor", x: 300, y: 240, width: 80, height: 80, fill: "#0000ff" },
  ]);
  await tool("align_layers", { layerIds: ["group", "anchor"], align: "top" });
  assert.equal((await node("anchor")).y, 100);
  assert.equal(await pixel(340, 140), "#0000ff");
  await tool("align_layers", { layerIds: ["group"], align: "right", relativeTo: "parent" });
  assert.equal((await node("group")).x, 520);
  assert.equal((await node("child")).x, 520, "Aligning a container must move its child artwork");
  assert.equal(await pixel(550, 140), "#ff0000");
  await tool("undo");
  assert.equal((await node("child")).x, 100);
  await tool("redo");
  assert.equal(await pixel(550, 140), "#ff0000");
  checks.push("MCP group alignment moves descendants and pixels with one-step undo/redo");

  await seed([
    { id: "a", x: 100, y: 50, width: 40, height: 40, fill: "#ff0000" },
    { id: "group", kind: "group", x: 180, y: 120, width: 40, height: 40 },
    { id: "child", parentId: "group", x: 180, y: 120, width: 40, height: 40, fill: "#0000ff" },
    { id: "c", x: 400, y: 180, width: 40, height: 40, fill: "#00ff00" },
  ]);
  await tool("distribute_layers", { layerIds: ["a", "group", "c"], axis: "horizontal" });
  assert.equal((await node("child")).x, 250);
  assert.equal(await pixel(270, 140), "#0000ff");
  await tool("undo");
  assert.equal((await node("child")).x, 180);
  assert.equal(await pixel(200, 140), "#0000ff");
  checks.push("MCP distribution moves group artwork in one undo transaction");
  await page.evaluate(() => window.__vooEditor.selectExactly(["a", "c"]));
  await page.getByTestId("editor-taskbar-alignment-menu").click();
  await page.getByTestId("editor-taskbar-align-top").click();
  assert.equal((await node("c")).y, 50);
  assert.equal(await pixel(420, 70), "#00ff00");
  await tool("undo");
  assert.equal((await node("c")).y, 180);
  checks.push("quickbar alignment menu changes actual pixels and undoes in one step");

  await seed([{ id: "rotated", x: 100, y: 100, width: 100, height: 40, rotation: 90, fill: "#ff0000" }]);
  await tool("align_layers", { layerIds: ["rotated"], align: "left", relativeTo: "parent" });
  assert.equal((await node("rotated")).x, -30);
  assert.equal(await pixel(10, 120), "#ff0000", "Rotated visible bounds must align to the parent edge");
  assert.equal(await pixel(50, 120), "#ffffff");
  checks.push("rotated object aligns its visible bounds rather than its unrotated origin");

  await seed([
    { id: "frame", kind: "group", isFrame: true, x: 50, y: 50, width: 400, height: 200 },
    { id: "a", parentId: "frame", x: 80, y: 80, width: 40, height: 30, fill: "#ff0000" },
    { id: "b", parentId: "frame", x: 180, y: 120, width: 60, height: 50, fill: "#0000ff" },
  ]);
  await tool("mutate_auto_layout", { layerId: "frame", config: {
    enabled: true, direction: "horizontal", gap: 20, padding: 10,
  } });
  assert.equal((await node("a")).x, 60);
  assert.equal((await node("b")).x, 120);
  assert.equal(await pixel(70, 70), "#ff0000");
  assert.equal(await pixel(130, 70), "#0000ff");
  checks.push("Auto Layout positions actual child pixels using padding and gap");
  await tool("mutate_auto_layout", { layerId: "frame", config: { enabled: true, alignment: "center" } });
  assert.equal((await node("a")).y, 135);
  assert.equal((await node("b")).y, 125);
  assert.equal(await pixel(70, 145), "#ff0000");
  assert.equal((await node("frame")).autoLayout.gap, 20);
  checks.push("Auto Layout alignment alias changes cross-axis pixels and retains gap");
  await tool("batch_mutate_layers", { mutations: [
    { type: "autoLayout", layerId: "frame", patch: { enabled: false, direction: "horizontal" } },
  ] });
  assert.equal((await node("frame")).autoLayout, null, "Disabling Auto Layout must actually release its children");
  await page.evaluate(() => window.__vooEditor.updateNode("a", { x: 250 }));
  assert.equal((await node("a")).x, 250);
  assert.equal(await pixel(260, 145), "#ff0000");
  checks.push("disabling Auto Layout releases child positioning and pixels");

  await seed([
    { id: "base", x: 100, y: 100, width: 100, height: 100, fill: "#0000ff" },
    { id: "source", x: 150, y: 100, width: 100, height: 100, fill: "#ff0000" },
  ]);
  await page.evaluate(() => { const e = window.__vooEditor; e.selectExactly(["source"]); e.createClippingMask(); });
  assert.equal((await node("source")).clipTo, "base");
  assert.equal(await pixel(175, 150), "#ff0000");
  assert.equal(await pixel(225, 150), "#ffffff");
  await tool("undo");
  assert.equal(await pixel(225, 150), "#ff0000");
  await tool("redo");
  assert.equal(await pixel(225, 150), "#ffffff");
  checks.push("clipping mask restricts pixels and undo/redo restores visibility");
  for (const [operation, expected] of Object.entries({
    union: ["#ff0000", "#ff0000", "#ff0000"],
    subtract: ["#ff0000", "#ffffff", "#ffffff"],
    intersect: ["#ffffff", "#ff0000", "#ffffff"],
    exclude: ["#ff0000", "#ffffff", "#ff0000"],
  })) {
    await seed([
      { id: "a", x: 100, y: 100, width: 100, height: 100, fill: "#ff0000" },
      { id: "b", x: 150, y: 100, width: 100, height: 100, fill: "#ff0000" },
    ]);
    await page.evaluate(() => window.__vooEditor.selectExactly(["a", "b"]));
    await page.getByTestId("editor-taskbar-boolean-menu").click();
    await page.getByTestId(`editor-taskbar-boolean-${operation}`).click();
    const actual = await Promise.all([125, 175, 225].map((x) => pixel(x, 150)));
    assert.deepEqual(actual, expected, `${operation} must change the rendered overlap`);
    await tool("undo");
    assert.equal(await pixel(175, 150), "#ff0000");
    await tool("redo");
    assert.deepEqual(await Promise.all([125, 175, 225].map((x) => pixel(x, 150))), expected);
    checks.push(`quickbar Boolean ${operation} pixels and one-step undo/redo`);
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
