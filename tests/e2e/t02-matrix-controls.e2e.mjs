import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 matrix (1440 default theme): Modifiers with a non-empty stack must add, undo and redo one step
// at a time; reachability of Export and Modifiers depends on the selection kind (frame, multi-select).
const checks = [];

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const panel = page.getByTestId("editor-properties-panel");
  const modifierCount = () => page.evaluate(() => (window.__vooEditor.getDocument().modifiers ?? []).length);

  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = { ...createRectNode({ x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" }), id: "t02-rect" };
    e.setDoc({ ...e.getDocument(), nodes: [rect], colorVariables: [], variablesV2: undefined });
    e.selectExactly([rect.id]);
  });
  await settlePanels(page);

  // Modifiers: the engine allows one array per target (modifiers_section.jsx `add` guard), and the picker
  // disables every entry while one exists. A non-empty stack is therefore one modifier: add it, confirm the
  // picker is blocked, then one undo and one redo, each counted in the document.
  const modifierAddButton = page.getByTestId("editor-modifiers-add").getByRole("button");
  await modifierAddButton.click();
  await settlePanels(page);
  await page.locator('[data-testid^="editor-modifier-add-"]:not([disabled])').first().click();
  await settlePanels(page);
  assert.equal(await modifierCount(), 1, "first modifier stored once");
  assert.equal(await panel.getByTestId("editor-modifier-row").count(), 1, "one row rendered");
  await modifierAddButton.click();
  await settlePanels(page);
  const allBlocked = await page.locator('[data-testid^="editor-modifier-add-"]').evaluateAll(els => els.length === 3 && els.every(el => el.disabled));
  assert.ok(allBlocked, "every picker entry is disabled while a modifier exists");
  await modifierAddButton.click();
  await settlePanels(page);
  await page.keyboard.press("ControlOrMeta+Z");
  await settlePanels(page);
  assert.equal(await modifierCount(), 0, "one undo removes the modifier");
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await settlePanels(page);
  assert.equal(await modifierCount(), 1, "one redo restores the modifier");
  checks.push("Modifiers with a stored modifier: add, picker blocked while one exists, one undo and one redo counted in the document");

  // Frame: Export is offered; Modifiers stays hidden for frames (the modifiers section is for single non-frame shapes).
  await page.evaluate(async () => {
    const { createGroupNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const frame = { ...createGroupNode({ x: 100, y: 100, width: 200, height: 150 }), id: "t02-frame", isFrame: true };
    e.setDoc({ ...e.getDocument(), nodes: [frame] });
    e.selectExactly([frame.id]);
  });
  await settlePanels(page);
  assert.ok(await panel.getByText("Export", { exact: true }).count() >= 1, "Export title shows for a frame");
  assert.ok(await panel.getByRole("button", { name: "Add export settings", exact: true }).count() === 1, "Export add entry shows for a frame");
  assert.equal(await page.getByTestId("editor-modifiers-section").count(), 0, "Modifiers stays hidden for a frame");
  checks.push("Frame selection: Export title and add entry visible; Modifiers hidden by design");

  // Multi-select: two rectangles; Export title and add entry visible for the selection.
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const a = { ...createRectNode({ x: 100, y: 100, width: 60, height: 60, fill: "#ff0000" }), id: "t02-a" };
    const b = { ...createRectNode({ x: 220, y: 100, width: 60, height: 60, fill: "#00ff00" }), id: "t02-b" };
    e.setDoc({ ...e.getDocument(), nodes: [a, b] });
    e.selectExactly([a.id, b.id]);
  });
  await settlePanels(page);
  assert.ok(await panel.getByText("Export", { exact: true }).count() >= 1, "Export title shows for a multi-selection");
  assert.ok(await panel.getByRole("button", { name: "Add export settings", exact: true }).count() === 1, "Export add entry shows for a multi-selection");
  checks.push("Multi-selection: Export title and add entry visible");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 matrix ok:\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
