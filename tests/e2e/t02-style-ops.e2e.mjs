import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 Styles paint-style operations (default theme): save the selection as a paint style, rename it,
// delete it. Each step gets one undo and one redo, checked against doc.styles.paint.
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
  const paintStyles = () => page.evaluate(() => (window.__vooEditor.getDocument().styles?.paint ?? []).map(s => s.name));
  const undo = async () => { await page.keyboard.press("ControlOrMeta+Z"); await settlePanels(page); };
  const redo = async () => { await page.keyboard.press("ControlOrMeta+Shift+Z"); await settlePanels(page); };
  const styleSection = panel.getByTestId("editor-style-section");

  // With nothing applied the group is header-only; its "Show all style types" entry reveals the type rows.
  await styleSection.getByRole("button", { name: "Show all style types", exact: true }).click();
  await settlePanels(page);

  // Save the selection as a paint style.
  await panel.getByTestId("editor-style-save-paint").click();
  await settlePanels(page);
  const nameInput = styleSection.locator('input[type="text"]').first();
  await nameInput.fill("Brand");
  await nameInput.press("Enter");
  await settlePanels(page);
  assert.deepEqual(await paintStyles(), ["Brand"], "save stores one paint style named Brand");
  checks.push("save current as paint style: stored as Brand");

  // Apply the saved style from the paint dropdown; rename and update need an applied style.
  await panel.getByTestId("editor-style-paint").click();
  await page.getByRole("option", { name: "Brand", exact: true }).click();
  await settlePanels(page);

  // Rename: Brand -> Accent, then one undo and one redo.
  // After Enter the create field closes, so the applied style's rename field is the only text input.
  const renameInput = styleSection.locator('input[type="text"]').first();
  await renameInput.fill("Accent");
  await renameInput.press("Tab");
  await settlePanels(page);
  assert.deepEqual(await paintStyles(), ["Accent"], "rename stores Accent");
  await undo();
  assert.deepEqual(await paintStyles(), ["Brand"], "one undo restores the name Brand");
  await redo();
  assert.deepEqual(await paintStyles(), ["Accent"], "one redo restores the name Accent");
  checks.push("rename Brand -> Accent stored; one undo restores Brand; one redo restores Accent");

  // Delete the style, then one undo restores it and one redo deletes it again.
  await panel.getByTestId("editor-style-delete-paint").click();
  await settlePanels(page);
  assert.deepEqual(await paintStyles(), [], "delete removes the paint style");
  await undo();
  assert.deepEqual(await paintStyles(), ["Accent"], "one undo restores the deleted style");
  await redo();
  assert.deepEqual(await paintStyles(), [], "one redo deletes it again");
  checks.push("delete: removed; one undo restores it; one redo deletes it again");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 style ops ok (${WIDTH}px, ${THEME}):\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
