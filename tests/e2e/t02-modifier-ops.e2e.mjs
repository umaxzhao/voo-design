import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 Modifiers single-item operations (1440 default theme): with one stored modifier, edit its count and
// step, remove it, and check one undo and one redo for each step. Each value is read from the document.
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
  const stored = () => page.evaluate(() => {
    const mod = (window.__vooEditor.getDocument().modifiers ?? []).find(m => m.targetId === "t02-rect");
    return mod ? { count: mod.count, stepX: mod.step?.x ?? null, stepY: mod.step?.y ?? null } : null;
  });
  const undo = async () => { await page.keyboard.press("ControlOrMeta+Z"); await settlePanels(page); };
  const redo = async () => { await page.keyboard.press("ControlOrMeta+Shift+Z"); await settlePanels(page); };
  const commitField = async (testId, value) => {
    const field = panel.getByTestId(testId);
    await field.fill(String(value));
    await field.press("Tab");
    await settlePanels(page);
  };

  // Add one linear array (the only modifier this target can hold).
  await page.getByTestId("editor-modifiers-add").getByRole("button").click();
  await settlePanels(page);
  await page.getByTestId("editor-modifier-add-linearArray").click();
  await settlePanels(page);
  const initial = await stored();
  assert.ok(initial, "add stores one linear array");
  checks.push(`add linear array stored: count=${initial.count}`);

  // Edit count: 2 -> 5, one undo and one redo.
  await commitField("editor-linear-array-count", 5);
  assert.equal((await stored()).count, 5, "count edit stored");
  await undo();
  assert.equal((await stored()).count, initial.count, "one undo restores count");
  await redo();
  assert.equal((await stored()).count, 5, "one redo restores edited count");
  checks.push("count edit 5 stored; one undo restores the prior count, one redo restores 5");

  // Edit step X: set to 40, one undo and one redo.
  await commitField("editor-linear-array-step-x", 40);
  assert.equal((await stored()).stepX, 40, "step X edit stored");
  await undo();
  assert.equal((await stored()).stepX, initial.stepX, "one undo restores step X");
  await redo();
  assert.equal((await stored()).stepX, 40, "one redo restores step X 40");
  checks.push("step X edit 40 stored; one undo and one redo verified");

  // Remove via the Modifiers row remove button, one undo restores it, one redo removes it again.
  await page.getByTestId("editor-modifier-remove").click();
  await settlePanels(page);
  assert.equal(await stored(), null, "remove deletes the modifier");
  await undo();
  assert.ok(await stored(), "one undo restores the removed modifier");
  await redo();
  assert.equal(await stored(), null, "one redo removes it again");
  checks.push("remove: deleted; one undo restores it; one redo removes it again");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 modifier ops ok (${WIDTH}px, ${THEME}):\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
