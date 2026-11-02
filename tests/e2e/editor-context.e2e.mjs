import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  await page.evaluate(async () => {
    const engine = window.__vooEditor;
    engine.setDoc({ ...engine.getDocument(), isCanvasRoot: false, width: 600, height: 400, backgroundColor: "#ffffff",
      stroke: "#123456", strokeWidth: 3, strokeHidden: true, strokes: [], nodes: [
        { id: "pinned", kind: "rect", x: 480, y: 300, width: 60, height: 40, fill: "#ff0000",
          constraints: { horizontal: "right", vertical: "bottom" } },
      ] });
    engine.selectExactly([]);
    const { mountEditorContextAudit } = await import("/tests/e2e/editor-context-harness.jsx");
    window.__context = mountEditorContextAudit();
  });
  await page.waitForFunction(() => window.__context?.current && window.__context.master.ready);
  assert.deepEqual(await page.evaluate(() => ({ hidden: window.__context.current.frame.frameObject.strokeHidden,
    extra: window.__context.current.frame.frameObject.strokes })), { hidden: true, extra: [] });
  await page.locator("#context-resize").click();
  await page.waitForFunction(() => window.__vooEditor.getDocument().width === 800);
  assert.deepEqual(await page.evaluate(() => {
    const doc = window.__vooEditor.getDocument(), child = doc.nodes.find(node => node.id === "pinned");
    return { width: doc.width, height: doc.height, x: child.x, y: child.y, background: doc.backgroundColor,
      layout: window.__context.layouts.get("host") };
  }), { width: 800, height: 500, x: 680, y: 400, background: "#abcdef", layout: { x: 80, y: 90, width: 800, height: 500 } });
  await tool("undo");
  assert.deepEqual(await page.evaluate(() => {
    const doc = window.__vooEditor.getDocument();
    return [doc.width, doc.height, doc.nodes[0].x, doc.nodes[0].y, doc.backgroundColor];
  }), [600, 400, 480, 300, "#ffffff"]);
  checks.push("frame mutation keeps resize constraints and chosen anchor in sync with one real-engine undo");

  await page.locator("#context-variable").click();
  const variable = await page.evaluate(() => {
    const doc = window.__vooEditor.getDocument();
    return { variable: doc.colorVariables[0], binding: doc.nodes[0].fillVariableId };
  });
  assert.equal(variable.variable.value, "#ff0000");
  assert.equal(variable.binding, variable.variable.id);
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes[0].fillVariableId), undefined);
  await page.locator("#context-style").click();
  const styleId = await page.evaluate(() => window.__vooEditor.getDocument().styles.paint[0].id);
  await page.evaluate((styleId) => {
    const api = window.__context;
    api.hostEngine.updateNode("pinned", { fill: "#0000ff" });
    api.current.libraries.styleActions.actions.apply("paint", styleId);
  }, styleId);
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("pinned").fill), "#ff0000");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("pinned").fill), "#0000ff");
  checks.push("focused variables and paint styles update the real document and preserve single-step history");

  await page.evaluate(() => {
    const api = window.__context;
    api.hostEngine.updateDocument({ components: { embedded: { canvasId: "embedded-canvas", width: 10, height: 10, nodes: [] } } });
    api.storeDocument("stored-page", { canvasId: "stored-canvas", width: 20, height: 20, nodes: [] });
  });
  assert.deepEqual(await page.evaluate(() => {
    const resolve = window.__context.current.components.resolveCanvas;
    return ["embedded", "master", "master-canvas", "snapshot", "snapshot-canvas", "stored-canvas", "absent"].map(id => resolve(id)?.canvasId ?? null);
  }), ["embedded-canvas", "master-canvas", "master-canvas", "snapshot-canvas", "snapshot-canvas", "stored-canvas", null]);
  checks.push("component resolution preserves embedded, live, snapshot and store source fallbacks");

  await page.evaluate(() => {
    const api = window.__context, doc = api.hostEngine.getDocument();
    api.hostEngine.setDoc({ ...doc, nodes: [...doc.nodes, { id: "instance", kind: "canvasInstance", sourceCanvasId: "master-canvas", x: 100, y: 80, width: 120, height: 80 }] });
    api.hostEngine.selectExactly([]);
    api.setNested({ instanceId: "instance", sourceCanvasId: "master-canvas", nodeIds: ["master-child"] });
  });
  await page.waitForFunction(() => window.__context.current.components.nestedNode?.id === "master-child");
  assert.deepEqual(await page.evaluate(() => window.__context.master.engine.getSelectedIds()), ["master-child"]);
  assert.equal(await page.evaluate(() => window.__context.current.components.canvasPages.find(page => page.id === "master").componentUses), 1);
  await page.evaluate(() => window.__context.hostEngine.selectExactly(["pinned"]));
  await page.waitForFunction(() => window.__context.current.nestedSelection === null);
  assert.equal(await page.evaluate(() => window.__context.current.components.nestedNode), undefined);
  checks.push("nested child selection reaches the live master engine and clears when host selection changes");
  await page.evaluate(() => {
    const api = window.__context;
    api.hostEngine.selectExactly([]);
    api.setNested({ instanceId: "instance", sourceCanvasId: "master-canvas", nodeId: "master-child" });
  });
  await page.waitForFunction(() => window.__context.current.components.nestedNode?.id === "master-child");
  await page.evaluate(() => window.__context.render({ focusedId: "master" }));
  await page.waitForFunction(() => window.__context.current.nestedSelection === null);
  assert.equal(await page.evaluate(() => window.__context.current.components.nestedNode), undefined);
  checks.push("changing the focused page also clears nested instance selection");
  await page.evaluate(() => window.__context.close());
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
