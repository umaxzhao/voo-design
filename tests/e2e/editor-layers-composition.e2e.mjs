import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const panel = page.getByTestId("editor-layers-panel");
  const row = id => panel.locator(`#layer-row-${id}`);
  const selected = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: true, backgroundColor: "#ffffff", nodes: [
      { id: "base", kind: "rect", visible: true, name: "White backdrop", x: 0, y: 0, width: 600, height: 400, fill: "#ffffff", strokeWidth: 0 },
      { id: "folder", kind: "group", visible: true, name: "Folder", x: 40, y: 40, width: 200, height: 160 },
      { id: "red", kind: "rect", parentId: "folder", visible: true, name: "Red child", x: 50, y: 50, width: 70, height: 60, fill: "#ff0000", strokeWidth: 0 },
      { id: "green", kind: "rect", parentId: "folder", visible: true, name: "Green child", x: 150, y: 50, width: 70, height: 60, fill: "#00ff00", strokeWidth: 0 },
      { id: "top", kind: "rect", visible: true, name: "Top rectangle", x: 300, y: 80, width: 70, height: 60, fill: "#0000ff", strokeWidth: 0 },
      { id: "bottom", kind: "rect", visible: true, name: "Bottom rectangle", x: 300, y: 180, width: 70, height: 60, fill: "#ffff00", strokeWidth: 0 },
    ] }); e.selectExactly([]); e.setTool("select");
  });
  await row("red").getByText("Red child", { exact: true }).waitFor();
  await row("red").getByText("Red child", { exact: true }).click();
  assert.deepEqual(await selected(), ["red"]);
  await row("green").getByText("Green child", { exact: true }).click({ modifiers: ["Meta"] });
  assert.deepEqual(new Set(await selected()), new Set(["red", "green"]));
  await row("folder").getByText("Folder", { exact: true }).click();
  assert.deepEqual(new Set(await selected()), new Set(["red", "green"]));
  checks.push("real tree clicks select one child, Cmd-toggle siblings and select a complete folder");

  await row("folder").getByRole("button", { name: "Collapse group", exact: true }).click();
  await row("red").waitFor({ state: "hidden" });
  await panel.getByRole("button", { name: "Toggle layer search", exact: true }).click();
  const search = panel.getByRole("textbox", { name: "Filter layers", exact: true });
  await search.fill("Red child");
  await row("red").waitFor();
  assert.equal(await row("folder").count(), 1);
  assert.equal(await row("green").count(), 0);
  await search.press("Escape");
  await row("red").waitFor({ state: "hidden" });
  await search.press("Escape");
  await search.waitFor({ state: "hidden" });
  await row("folder").getByRole("button", { name: "Expand group", exact: true }).click();
  await row("red").waitFor();
  checks.push("search exposes matching descendants without losing the folder's stored collapsed state");

  await row("red").getByText("Red child", { exact: true }).dblclick();
  let rename = row("red").getByRole("textbox", { name: "Rename layer", exact: true });
  await rename.fill("Discarded rename"); await rename.press("Escape");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("red").name), "Red child");
  await row("red").getByText("Red child", { exact: true }).dblclick();
  rename = row("red").getByRole("textbox", { name: "Rename layer", exact: true });
  await rename.fill("Renamed red"); await rename.press("Enter");
  await row("red").getByText("Renamed red", { exact: true }).waitFor();
  await tool("undo");
  await row("red").getByText("Red child", { exact: true }).waitFor();
  checks.push("inline rename Escape cancels and Enter commits one undoable layer edit");

  await row("red").getByRole("button", { name: "Hide layer", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 80, y: 80 })), "#ffffff");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 80, y: 80 })), "#ff0000");
  await row("red").hover();
  await row("red").getByRole("button", { name: "Lock layer", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("red").locked), true);
  await tool("undo");
  assert.equal(await page.evaluate(() => Boolean(window.__vooEditor.getNode("red").locked)), false);
  checks.push("visibility changes real pixels and locking changes the actual node; each undoes once");

  const originalOrder = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id));
  const source = await row("bottom").boundingBox(), destination = await row("top").boundingBox();
  const dragStart = { x: source.x + source.width - 35, y: source.y + source.height / 2 };
  await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down();
  await page.mouse.move(dragStart.x, destination.y + destination.height - 1, { steps: 8 });
  await settle(); await page.mouse.up(); await settle();
  const order = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id));
  assert.notDeepEqual(order, originalOrder);
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("bottom").clipTo ?? null), null);
  await tool("undo");
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id)), originalOrder);
  checks.push("a real row pointer drag reorders root layers without accidental clipping and undoes once");

  await page.evaluate(async () => {
    const { mountLayerCompositionAudit } = await import("/tests/e2e/editor-layers-composition-harness.jsx");
    window.__layerComposition = mountLayerCompositionAudit();
  });
  const host = page.locator("#layers-composition-audit");
  await host.getByText("Second blue", { exact: true }).waitFor();
  await host.getByText("Second blue", { exact: true }).click();
  await page.waitForFunction(() => window.__layerComposition.active === "second");
  assert.deepEqual(await page.evaluate(() => window.__layerComposition.second.getSelectedIds()), ["second-blue"]);
  await host.locator("#layer-row-second-blue").getByRole("button", { name: "Hide layer", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__layerComposition.second.sampleColorAt({ x: 50, y: 50 })), "#ffffff");
  assert.equal(await page.evaluate(() => window.__layerComposition.first.getNode("red").visible), true);
  await page.evaluate(async () => { await window.__layerComposition.second.undo(); window.__layerComposition.render(); });
  assert.equal(await page.evaluate(() => window.__layerComposition.second.sampleColorAt({ x: 50, y: 50 })), "#0000ff");
  await host.getByText("First canvas", { exact: true }).click();
  await page.waitForFunction(() => window.__layerComposition.active === "first");
  assert.deepEqual(await page.evaluate(() => window.__layerComposition.focusEvents), ["second", "first"]);
  await page.evaluate(() => window.__layerComposition.close());
  checks.push("inactive-canvas rows focus their own real engine and subsequent layer edits stay on that canvas");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
