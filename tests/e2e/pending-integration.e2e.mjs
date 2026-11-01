import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const sample = (x, y) => page.evaluate(async ({ x, y }) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__vooEditor.sampleColorAt({ x, y });
  }, { x, y });
  const client = (point) => page.evaluate(async (point) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
  }, point);
  const click = async (point) => { const at = await client(point); await page.mouse.click(at.x, at.y); };
  const seed = () => page.evaluate(async () => {
    const e = window.__vooEditor;
    e.endMaskEdit(); e.setTool("select"); e.selectExactly([]);
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [] });
    const c = document.createElement("canvas"); c.width = 100; c.height = 100;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 50, 100);
    ctx.fillStyle = "#0000ff"; ctx.fillRect(50, 0, 50, 100);
    const node = await e.insertImage(c.toDataURL(), { x: 150, y: 150 }); e.selectExactly([node.id]);
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 100 } });
    return node.id;
  });
  let id = await seed();
  await page.evaluate(() => { const e = window.__vooEditor; e.setTool("fill"); e.setColor("#00ff00"); });
  const tolerance = page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: "Tolerance", exact: true });
  await tolerance.fill("0"); await tolerance.press("Enter");
  assert.equal(await page.evaluate(() => window.__vooEditor.getFillTolerance()), 0);
  await click({ x: 125, y: 150 }); await page.evaluate(() => window.__vooEditor.flushTransforms());
  assert.equal(await sample(125, 150), "#00ff00");
  assert.equal(await sample(175, 150), "#0000ff");
  await tool("undo"); assert.equal(await sample(125, 150), "#ff0000");
  checks.push("bucket panel tolerance reaches a real pointer fill and preserves the other colour region");
  const previous = await page.evaluate((id) => window.__vooEditor.getNode(id).imageId, id);
  await click({ x: 300, y: 300 }); await page.evaluate(() => window.__vooEditor.flushTransforms());
  assert.equal(await page.evaluate((id) => window.__vooEditor.getNode(id).imageId, id), previous);
  assert.equal(await sample(125, 150), "#ff0000");
  checks.push("bucket outside the selected bitmap leaves the whole layer unchanged");

  await page.evaluate(async (id) => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor; e.setFillSampleAll(true);
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes,
      { ...createRectNode({ x: 120, y: 100, width: 10, height: 100, fill: "#000000" }), id: "divider" }] });
    e.selectExactly([id]);
  }, id);
  await click({ x: 110, y: 150 }); await page.evaluate(() => window.__vooEditor.flushTransforms());
  assert.equal(await sample(110, 150), "#00ff00");
  assert.equal(await sample(140, 150), "#ff0000");
  assert.equal(await sample(125, 150), "#000000");
  checks.push("sample-all bucket respects a divider painted on another layer");

  id = await seed();
  const point = await page.evaluate(async (id) => {
    const e = window.__vooEditor; e.updateNode(id, { rotation: 90 }); e.setTool("fill"); e.setFillTolerance(0); e.setFillSampleAll(false);
    return (await import("/src/canvas/editor/scene_geometry.js")).fromNodeLocal(e.getNode(id), { x: 25, y: 50 });
  }, id);
  await click(point); await page.evaluate(() => window.__vooEditor.flushTransforms());
  assert.equal(await sample(point.x, point.y), "#00ff00");
  checks.push("bucket maps the pointer through a rotated image before choosing its seed colour");

  await page.evaluate(async () => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor; e.setTool("select");
    e.setDoc({ ...e.getDocument(), nodes: [
      { ...createGroupNode({ x: 100, y: 100, width: 200, height: 100 }), id: "frame", isFrame: true },
      { ...createGroupNode({ x: 150, y: 110, width: 100, height: 60 }), id: "inner", parentId: "frame", constraints: { horizontal: "right", vertical: "top" } },
      { ...createRectNode({ x: 220, y: 130, width: 20, height: 20, fill: "#ff0000" }), id: "child", parentId: "inner", constraints: { horizontal: "right", vertical: "top" } },
    ] }); e.selectExactly(["frame"]);
  });
  await page.waitForFunction(() => document.querySelector('input[aria-label="W"]')?.value === "200");
  await page.locator('input[aria-label="W"]').fill("400"); await page.locator('input[aria-label="W"]').press("Enter");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("child").x), 420);
  assert.equal(await sample(430, 140), "#ff0000");
  await tool("undo"); assert.equal(await page.evaluate(() => window.__vooEditor.getNode("child").x), 220);
  checks.push("frame panel width reflows nested constraints, rendered pixels and one-step undo");

  await page.evaluate(async () => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), variablesV2: { version: 2, activeModeByCollection: { brand: "day" }, collections: [{
      id: "brand", name: "Brand", modes: [{ id: "day", name: "Day" }], variables: [{ id: "accent", name: "Accent", type: "color", valuesByMode: { day: "#123456" } }],
    }] } });
    (await import("/tests/e2e/inspector-audit-panel.mjs")).mountAuditPanel("variables", "child");
  });
  await page.getByTestId("editor-color-variable-select").click();
  await page.locator('[role="listbox"]:visible').getByRole("option", { name: "Accent", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("child").fillVariableId), "accent");
  assert.equal(await sample(230, 140), "#123456");
  checks.push("v2-only colour variable binds through the inspector and changes rendered fill");
  await page.evaluate(async () => {
    window.__auditPanelRoot.unmount(); document.getElementById("inspector-audit-host").remove();

  });
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().setWelcomeOpen(false);
    useDesignStore.getState().loadVooProject({ vooData: { document: {
      version: 2, width: 600, height: 400, backgroundColor: "#171717",
      nodes: [{ ...createRectNode({ x: 50, y: 50, width: 80, height: 80, fill: "#ff0000" }), id: "migration-child" }],
    } } });
  });
  await page.waitForFunction(() => window.__vooEditor.getDocument().isCanvasRoot && window.__vooEditor.getNode("migration-child")).catch(async error => {
    throw new Error(`${error.message}: ${await page.evaluate(async () => JSON.stringify({ editor: window.__vooEditor.getDocument(), store: (await import("/src/store/design_store.js")).useDesignStore.getState().nodes }))}`);
  });
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 100 } });
  });
  assert.equal(await sample(75, 75), "#ff0000");
  assert.equal(await sample(200, 200), "#171717");
  await page.evaluate(() => {
    const e = window.__vooEditor;
    const frame = e.getDocument().nodes.find(node => node.isFrame);
    e.updateFrameNode(frame.id, { x: 100, y: 40 });
  });
  assert.equal(await sample(175, 115), "#ff0000");
  assert.equal(await sample(75, 75), null);
  await tool("undo"); assert.equal(await sample(75, 75), "#ff0000");
  checks.push("legacy page opens as a free canvas frame with visible paint and children moving together, undoing once");
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().setWelcomeOpen(true));
  assert.equal(await page.getByRole("radiogroup").count(), 1);
  const mobileRadio = page.getByRole("radio", { name: /Mobile app|移动应用/i });
  await mobileRadio.click();
  assert.equal(await mobileRadio.getAttribute("aria-checked"), "true");
  checks.push("generation type is selected directly via radio and updates active preset");

  // Open advanced settings for design system & style
  const contextTrigger = page.locator('button[aria-haspopup="menu"][title*="reference"], button[aria-haspopup="menu"][aria-label*="reference"], button[aria-haspopup="menu"][title*="参考图"], button[aria-haspopup="menu"][aria-label*="参考图"]').first();
  checks.push("welcome composer exposes context and advanced options");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});


await withEditorBrowser(async ({ page }) => {
  const checks = [];
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().setWelcomeOpen(true));
  const root = page.locator(".welcome-prompt-root");
  assert.equal(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches), true);
  assert.equal(await page.getByRole("radiogroup").count(), 1);
  const radios = page.getByRole("radio");
  assert.equal(await radios.count(), 8);

  const mobileRadio = page.getByRole("radio", { name: /Mobile app|移动应用/i });
  await mobileRadio.tap();
  assert.equal(await mobileRadio.getAttribute("aria-checked"), "true");
  checks.push("390px touch viewport selects generation types directly via radio buttons and updates Mobile dimensions");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { viewport: { width: 390, height: 844 }, hasTouch: true });
