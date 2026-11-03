import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 Styles apply and clear (default theme, width from T02_WIDTH): save the selection as a paint style,
// apply it, then detach it. Each step gets one undo and one redo, checked against node.styleIds.paintId.
const WIDTH = Number(process.env.T02_WIDTH ?? 1440);
const THEME = process.env.T02_THEME ?? "dark";
const checks = [];

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: WIDTH, height: 1000 });
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, THEME);
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = { ...createRectNode({ x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" }), id: "t02-rect" };
    e.setDoc({ ...e.getDocument(), nodes: [rect], colorVariables: [], variablesV2: undefined });
    e.selectExactly([rect.id]);
  });
  await settlePanels(page);

  const panel = page.getByTestId("editor-properties-panel");
  const styleSection = panel.getByTestId("editor-style-section");
  const paintId = () => page.evaluate(() => window.__vooEditor.getNode("t02-rect").styleIds?.paintId ?? null);
  const paintStyleIds = () => page.evaluate(() => (window.__vooEditor.getDocument().styles?.paint ?? []).map(s => s.id));
  const undo = async () => { await page.keyboard.press("ControlOrMeta+Z"); await settlePanels(page); };
  const redo = async () => { await page.keyboard.press("ControlOrMeta+Shift+Z"); await settlePanels(page); };

  await styleSection.getByRole("button", { name: "Show all style types", exact: true }).click();
  await settlePanels(page);
  await panel.getByTestId("editor-style-save-paint").click();
  await settlePanels(page);
  const nameInput = styleSection.locator('input[type="text"]').first();
  await nameInput.fill("Brand");
  await nameInput.press("Enter");
  await settlePanels(page);
  const [styleId] = await paintStyleIds();
  assert.ok(styleId, "save stores a paint style");
  assert.equal(await paintId(), null, "saving does not apply the style to the node");
  checks.push("saved paint style stored; node not applied by saving");

  // Apply from the dropdown, then one undo and one redo.
  await panel.getByTestId("editor-style-paint").click();
  await page.getByRole("option", { name: "Brand", exact: true }).click();
  await settlePanels(page);
  assert.equal(await paintId(), styleId, "apply sets node.styleIds.paintId to the style");
  await undo();
  assert.equal(await paintId(), null, "one undo removes the applied style");
  await redo();
  assert.equal(await paintId(), styleId, "one redo re-applies the style");
  checks.push("apply Brand: node bound; one undo unbinds; one redo rebinds");

  // Clear (detach keeps the values): one undo rebinds, one redo detaches again.
  await styleSection.getByRole("button", { name: "Detach style", exact: true }).click();
  await settlePanels(page);
  assert.equal(await paintId(), null, "detach clears node.styleIds.paintId");
  await undo();
  assert.equal(await paintId(), styleId, "one undo restores the detached binding");
  await redo();
  assert.equal(await paintId(), null, "one redo detaches again");
  checks.push("detach (clear): unbinds; one undo rebinds; one redo unbinds again");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 style apply ok (${WIDTH}px, ${THEME}):\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
