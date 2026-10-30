import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async () => {
    await page.evaluate(async () => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), isCanvasRoot: false, width: 600, height: 400,
        backgroundColor: "#ffffff", nodes: [{ ...createRectNode({ x: 10, y: 10, width: 20, height: 20, fill: "#0000ff" }), id: "existing" }] });
      e.selectExactly(["existing"]);
    });
    await settled();
  };
  const snapshot = () => page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
  const historyIndex = () => page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  const args = { nodes: [{
    type: "frame", name: "Stretch row", x: 60, y: 50, width: 300, height: 160,
    autoLayout: { direction: "horizontal", alignItems: "stretch", gap: 12, padding: 10 },
    children: [
      { type: "rect", name: "First card", x: 70, y: 60, width: 50, height: 30, fill: "#ff0000" },
      { type: "rect", name: "Second card", x: 132, y: 60, width: 50, height: 40, fill: "#00ff00" },
    ],
  }] };

  await seed();
  const before = await snapshot(), beforeIndex = await historyIndex();
  await tool("build_layout", args); await settled();
  assert.equal(await historyIndex(), beforeIndex + 1, "the complete build must add exactly one real history entry");
  const after = await snapshot();
  const boxes = await page.evaluate(() => {
    const e = window.__vooEditor, nodes = e.getDocument().nodes;
    const parent = nodes.find(node => node.name === "Stretch row");
    const children = nodes.filter(node => node.parentId === parent.id);
    return { align: parent.autoLayout.alignItems, count: nodes.length, children: children.map(node => ({ x: node.x, y: node.y, width: node.width, height: node.height })) };
  });
  assert.equal(boxes.align, "stretch"); assert.equal(boxes.count, 4); assert.equal(boxes.children.length, 2);
  const first = boxes.children[0];
  assert.equal(await page.evaluate(({ x, y }) => window.__vooEditor.sampleColorAt({ x, y }), {
    x: first.x + first.width / 2, y: first.y + first.height / 2,
  }), "#ff0000");
  await tool("undo"); assert.equal(await snapshot(), before);
  await tool("redo"); assert.equal(await snapshot(), after);
  checks.push("real MCP builds a visible stretch tree with one history entry and exact full-document undo/redo");

  await seed();
  const nestedBefore = await snapshot(), nestedIndex = await historyIndex();
  await page.evaluate(() => window.__vooEditor.beginBatch());
  try {
    await tool("build_layout", args);
    assert.equal(await historyIndex(), nestedIndex, "a nested build must not commit the outer batch");
  } finally {
    await page.evaluate(() => window.__vooEditor.endBatch());
  }
  await page.evaluate(() => window.__vooEditor.setDoc(window.__vooEditor.getDocument()));
  assert.equal(await historyIndex(), nestedIndex + 1);
  await tool("undo"); assert.equal(await snapshot(), nestedBefore);
  checks.push("a real outer history batch owns the single final build snapshot");

  for (const failure of ["first-patch", "second-child"]) {
    await seed();
    await tool("mutate_layer_style", { layerId: "existing", patch: { fill: "#00ffff" } });
    const future = await snapshot();
    await tool("undo");
    const original = await snapshot(), originalIndex = await historyIndex();
    await page.evaluate(failure => {
      const e = window.__vooEditor;
      const key = failure === "first-patch" ? "updateNode" : "addRectAt";
      const original = e[key]; let calls = 0;
      window.__restoreBuildLayoutFailure = () => { e[key] = original; delete window.__restoreBuildLayoutFailure; };
      e[key] = (...args) => {
        calls += 1;
        if (calls === (failure === "first-patch" ? 1 : 2)) throw new Error("injected-build-layout-failure");
        return original(...args);
      };
    }, failure);
    try { await assert.rejects(tool("build_layout", args), /injected-build-layout-failure/); }
    finally { await page.evaluate(() => window.__restoreBuildLayoutFailure()); }
    assert.equal(await snapshot(), original, `${failure} must roll back every partial node`);
    assert.equal(await historyIndex(), originalIndex, `${failure} must not add a failed history entry`);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["existing"]);
    await tool("redo"); assert.equal(await snapshot(), future, "a failed build must preserve the existing redo branch");
    await tool("undo"); assert.equal(await snapshot(), original);
    await tool("mutate_layer_style", { layerId: "existing", patch: { fill: "#00ff00" } });
    assert.equal(await historyIndex(), originalIndex + 1, "a failed build must release history batching");
    await tool("undo"); assert.equal(await snapshot(), original);
    checks.push(`${failure} restores document and selection without history, then the next ordinary edit remains undoable`);
  }

  const contexts = [];
  const context = () => page.evaluate(() => {
    const e = window.__vooEditor;
    return { selection: e.getSelection(), selectedGroup: e.getSelectedGroup()?.id ?? null,
      isolation: e.getIsolationGroupId(), tool: e.getTool() };
  });
  for (const mode of ["background", "isolation", "reset-context"]) {
    await seed();
    await page.evaluate(async mode => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      const group = (id, parentId) => ({ ...createRectNode({ x: 20, y: 20, width: 200, height: 200 }),
        id, kind: "group", ...(parentId ? { parentId } : {}) });
      e.setDoc({ ...e.getDocument(), nodes: [group("outer"), group("middle", "outer"), group("inner", "middle"),
        { ...createRectNode({ x: 40, y: 40, width: 30, height: 30 }), id: "leaf", parentId: "inner" }] });
      e.setTool("brush");
      if (mode === "background") e.selectBackground();
      else {
        e.enterGroup("leaf");
        if (mode === "reset-context") e.enterGroup("leaf");
      }
    }, mode);
    const beforeContext = await context(), beforeDoc = await snapshot(), beforeHistory = await historyIndex();
    await page.evaluate(mode => {
      const e = window.__vooEditor, original = e.updateNode;
      window.__restoreBuildLayoutFailure = () => { e.updateNode = original; delete window.__restoreBuildLayoutFailure; };
      e.updateNode = () => {
        if (mode === "reset-context") { e.exitGroup(); e.setTool("select"); }
        throw new Error("injected-build-layout-failure");
      };
    }, mode);
    try {
      await assert.rejects(tool("build_layout", { nodes: [{ type: "path", name: "Interrupted path",
        d: "M 0 0 L 40 0 L 40 40 Z", x: 100, y: 100, width: 40, height: 40, fill: "#ff0000" }] }), /injected-build-layout-failure/);
    } finally { await page.evaluate(() => window.__restoreBuildLayoutFailure()); }
    assert.equal(await snapshot(), beforeDoc);
    assert.equal(await historyIndex(), beforeHistory);
    contexts.push({ mode, before: beforeContext, after: await context() });
    checks.push(`${mode} context survives first-path creation failure with document, history and tool intact`);
  }
  assert.deepEqual(contexts.map(({ mode, after }) => ({ mode, context: after })),
    contexts.map(({ mode, before }) => ({ mode, context: before })));
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
