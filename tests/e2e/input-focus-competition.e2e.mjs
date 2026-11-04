import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

/**
 * Regression for beta.3 item 1: a finishing rename restored focus with an
 * unconditional animation frame, so typing immediately after clicking another
 * input landed on the Layers list and became canvas shortcut keys.
 */
await withEditorBrowser(async ({ page }) => {
  const layers = page.getByTestId("editor-layers-panel");
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () => page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const active = () => page.evaluate(() => {
    const element = document.activeElement;
    return {
      tag: element?.tagName,
      label: element?.getAttribute("aria-label"),
      value: element?.value,
    };
  });

  await page.evaluate(() => {
    const editor = window.__vooEditor;
    editor.setDoc({
      ...editor.getDocument(), width: 600, height: 400, isCanvasRoot: true,
      backgroundColor: "#ffffff", nodes: [
        { id: "focus-rect", kind: "rect", visible: true, name: "Focus Rectangle", x: 100, y: 100, width: 160, height: 120, fill: "#ff0000", strokeWidth: 0 },
      ],
    });
    editor.selectExactly(["focus-rect"]);
    editor.setTool("select");
  });
  const nameButton = layers.getByText("Focus Rectangle", { exact: true });
  await nameButton.waitFor();

  // Double-click rename must own the keyboard immediately.
  await nameButton.dblclick();
  await page.keyboard.type("Renamed");
  assert.deepEqual(await active(), { tag: "INPUT", label: "Rename layer", value: "Renamed" });
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("focus-rect").x), 100,
    "rename characters must not become canvas shortcuts");

  // Leaving rename by clicking a numeric field: the pending focus restore must
  // not pull the caret back to the Layers list.
  const xField = panel.getByRole("spinbutton", { name: "X", exact: true });
  await xField.click();
  await settle();
  assert.deepEqual(await active(), { tag: "INPUT", label: "X", value: "100" },
    "the numeric field keeps focus after the rename commits");
  await page.keyboard.type("5");
  const typed = await page.evaluate(() => ({
    x: window.__vooEditor.getNode("focus-rect").x,
    tool: window.__vooEditor.getTool(),
    opacity: window.__vooEditor.getNode("focus-rect").opacity,
    name: window.__vooEditor.getNode("focus-rect").name,
  }));
  assert.equal(typed.x, 1005, "the digit belongs to the numeric field");
  assert.equal(typed.tool, "select", "a digit must not switch tools");
  assert.equal(typed.opacity, undefined, "a digit must not change layer opacity");
  assert.equal(typed.name, "Renamed", "the rename committed once when the field lost focus");

  // Clicking inside the rename field must not let the list's mousedown focus
  // handler blur it and silently commit.
  await layers.getByText("Renamed", { exact: true }).dblclick();
  const rename = layers.getByRole("textbox", { name: "Rename layer", exact: true });
  await rename.click();
  await settle();
  assert.deepEqual(await active(), { tag: "INPUT", label: "Rename layer", value: "Renamed" });
  await page.keyboard.type("!");
  assert.equal(await rename.inputValue(), "Renamed!", "typing continues inside the rename field");
  await rename.press("Escape");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("focus-rect").name), "Renamed");

  console.log("input focus competition: rename mount, cross-field commit and in-field click keep ownership");
});
