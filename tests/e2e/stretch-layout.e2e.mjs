import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async (mode = "horizontal") => {
    await page.evaluate(async mode => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      const wrap = mode === "wrap", vertical = mode === "vertical";
      const frame = { ...createRectNode({ x: 80, y: 80, width: wrap ? 130 : 220, height: 140, fill: "#ffffff" }),
        id: "stretch-frame", kind: "group", isFrame: true,
        autoLayout: { direction: vertical ? "vertical" : "horizontal", gap: 10, crossGap: 8, padding: 10,
          alignItems: "start", wrap, heightMode: mode === "hug" ? "hug" : "fixed" } };
      const a = { ...createRectNode({ x: 90, y: 90, width: 50, height: 20, fill: "#ff0000" }), id: "stretch-a", parentId: frame.id };
      const b = { ...createRectNode({ x: 150, y: 90, width: 50, height: 40, fill: "#00ff00" }), id: "stretch-b", parentId: frame.id };
      const c = { ...createRectNode({ x: 90, y: 140, width: 50, height: 30, fill: "#0000ff" }), id: "stretch-c", parentId: frame.id };
      e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false,
        backgroundColor: "#ffffff", nodes: wrap ? [frame, a, b, c] : [frame, a, b] });
      e.selectExactly([frame.id]); e.setTool("select");
    }, mode);
    await settled();
  };
  const snapshot = () => page.evaluate(() => JSON.stringify(window.__vooEditor.serialise().nodes));
  const historyIndex = () => page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  const boxes = () => page.evaluate(() => window.__vooEditor.getDocument().nodes
    .filter(n => n.id.startsWith("stretch-"))
    .map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));

  await seed();
  const before = await snapshot(), beforeIndex = await historyIndex();
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 100, y: 190 })), "#ffffff");
  const panel = page.getByTestId("editor-properties-panel");
  const selector = page.getByTestId("editor-auto-layout-alignItems");
  assert.equal(await selector.isVisible(), false, "stretch must stay behind the existing advanced entry");
  await panel.getByRole("button", {name:"Auto layout settings",exact:true}).click();
  await selector.click();
  await page.getByRole("option", { name: "Stretch", exact: true }).click();
  await settled();
  assert.equal(await historyIndex(), beforeIndex + 1);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 100, y: 190 })), "#ff0000");
  assert.deepEqual((await boxes()).slice(1).map(n => n.height), [120, 120]);
  const after = await snapshot();
  await tool("undo"); assert.equal(await snapshot(), before);
  await tool("redo"); assert.equal(await snapshot(), after);
  checks.push("the existing advanced inspector changes real stretch pixels and restores the exact subtree with one undo/redo");

  for (const mode of ["horizontal", "vertical", "wrap", "hug"]) {
    await seed(mode);
    const before = await snapshot(), beforeIndex = await historyIndex();
    await tool("mutate_auto_layout", { layerId: "stretch-frame", config: { enabled: true, alignment: "stretch" } });
    assert.equal(await historyIndex(), beforeIndex + 1);
    const result = await boxes();
    if (mode === "horizontal") assert.deepEqual(result.slice(1).map(n => n.height), [120, 120]);
    if (mode === "vertical") assert.deepEqual(result.slice(1).map(n => n.width), [200, 200]);
    if (mode === "wrap") {
      assert.deepEqual(result.slice(1).map(n => [n.y, n.height]), [[90, 40], [90, 40], [138, 30]]);
    }
    if (mode === "hug") {
      assert.equal(result[0].height, 60);
      assert.deepEqual(result.slice(1).map(n => n.height), [20, 40]);
    }
    const after = await snapshot();
    await tool("undo"); assert.equal(await snapshot(), before);
    await tool("redo"); assert.equal(await snapshot(), after);
    checks.push(`real MCP stretch alias preserves ${mode} layout geometry and one-step history`);
  }

  await tool("build_layout", { nodes: [{ type: "frame", name: "Built stretch", x: 350, y: 80, width: 120, height: 160,
    autoLayout: { direction: "vertical", alignItems: "stretch", padding: 10 },
    children: [{ type: "rect", name: "Built child", x: 360, y: 90, width: 30, height: 20, fill: "#ff0000" }] }] });
  const builtIds = await page.evaluate(() => window.__vooEditor.getDocument().nodes
    .filter(n => ["Built stretch", "Built child"].includes(n.name)).map(n => n.id));
  assert.equal(builtIds.length, 2);
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(n => n.name === "Built child").width), 100);
  checks.push("build_layout accepts stretch and creates a genuinely stretched editable child");
  const persistedGeometry = () => page.evaluate(ids => window.__vooEditor.serialise().nodes.filter(n => ids.includes(n.id))
    .map(({ id, x, y, width, height, autoLayout }) => ({ id, x, y, width, height, autoLayout })), builtIds);
  const persistedBefore = await persistedGeometry();
  const reopened = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { buildProjectVooFile, openVooProject } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const store = useDesignStore.getState(), id = store.editingNodeId;
    const engines = new Map(Object.entries(window.__vooEditors).map(([key, engine]) => [key, { engine, ready: true }]));
    const { vooFile } = await buildProjectVooFile({ store, enginesRef: { current: engines } });
    window.__stretchOldEngine = window.__vooEditor;
    const result = await openVooProject({ store: useDesignStore.getState(), fileOrPath: new File([encodeVooBinary(vooFile)], "StretchLayout.voo") });
    return { success: result.success, id };
  });
  assert.equal(reopened.success, true);
  await page.waitForFunction(id => window.__vooEditors?.[id] && window.__vooEditors[id] !== window.__stretchOldEngine, reopened.id);
  assert.deepEqual(await persistedGeometry(), persistedBefore);
  checks.push("actual project save/reopen retains stretch configuration and resolved geometry");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
