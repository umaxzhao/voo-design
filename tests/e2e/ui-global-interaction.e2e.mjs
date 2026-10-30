import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Fresh documents exercise the shipped UI without changing the user's open file.
await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const engine = window.__vooEditor;
    const doc = engine.getDocument();
    const frame = doc.nodes.find((node) => node.isFrame);
    engine.setDoc({ ...doc, nodes: [...doc.nodes, {
      ...createTextNode({ text: "Hello VOO", x: 50, y: 50, fontSize: 24 }),
      id: "global-ui-text", parentId: frame.id,
    }] });
  });

  await page.keyboard.press("Control+f");
  const search = page.getByTestId("find-replace-bar");
  await search.getByRole("textbox", { name: "Find text", exact: true }).fill("Hello");
  await page.waitForFunction(() => window.__vooEditor.getSelectedIds().includes("global-ui-text"));
  await search.getByRole("button", { name: "Match case", exact: true }).focus();
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "detached" });
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["global-ui-text"]);

  await page.keyboard.press("Control+f");
  await search.getByRole("textbox", { name: "Find text", exact: true }).fill("Hello");
  await search.getByRole("textbox", { name: "Replace with", exact: true }).fill("Welcome");
  await search.getByRole("button", { name: "Replace all", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.find((node) => node.id === "global-ui-text").text === "Welcome VOO");
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "detached" });
  await page.evaluate(() => window.__vooEditor.undo());
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.find((node) => node.id === "global-ui-text").text === "Hello VOO");

  await page.evaluate(async () => {
    const { mountAutosaveAudit } = await import("/tests/e2e/ui-autosave-harness.jsx");
    window.__autosaveUi = mountAutosaveAudit();
  });
  await page.waitForFunction(() => window.__autosaveUi.version > 0);
  await page.evaluate(() => window.__autosaveUi.saver.flush());
  assert.equal(await page.evaluate(() => window.__autosaveUi.writes.length), 0);
  await page.evaluate(() => window.__autosaveUi.render(false));
  await page.waitForFunction(() => document.querySelector('[data-autosave-disabled="false"]'));
  await page.evaluate(() => window.__autosaveUi.saver.flush());
  assert.equal(await page.evaluate(() => window.__autosaveUi.writes.length), 1);
  await page.evaluate(() => window.__autosaveUi.render(true));
  await page.waitForFunction(() => document.querySelector('[data-autosave-disabled="true"]'));
  await page.evaluate(() => window.__autosaveUi.saver.flush());
  assert.equal(await page.evaluate(() => window.__autosaveUi.writes.length), 1);
  assert.deepEqual(await page.evaluate(() => window.__autosaveUi.errors), []);
  await page.evaluate(() => window.__autosaveUi.close());

  const opener = page.getByRole("button", { name: "Settings", exact: true });
  await opener.focus();
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  const commandInput = palette.getByRole("combobox");
  await commandInput.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "combobox");
  const close = palette.getByRole("button", { name: "esc close", exact: true });
  await commandInput.press("Shift+Tab");
  assert.equal(await close.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await commandInput.evaluate((element) => element === document.activeElement), true);
  await commandInput.fill("not-a-real-command-9z");
  assert.equal(await palette.getByRole("option").count(), 0);
  await close.focus();
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  assert.equal(await opener.evaluate((element) => element === document.activeElement), true);

  // Trigger the existing image-export entry through its real command palette action.
  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("Export");
  await palette.getByRole("option").filter({ hasText: /^Export$/ }).click();
  const exportDialog = page.getByTestId("design-export-dialog");
  await exportDialog.waitFor();
  assert.equal(await exportDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await page.keyboard.press("Control+k");
  await palette.waitFor();
  await palette.getByRole("combobox").fill("missing-nested-command");
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  assert.equal(await exportDialog.count(), 1, "closing the top dialog must retain the export underneath");
  assert.equal(await exportDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await exportDialog.getByRole("button", { name: "JPEG", exact: false }).click();
  const transparency = exportDialog.getByRole("checkbox");
  assert.equal(await transparency.isDisabled(), true);
  await exportDialog.getByRole("button", { name: "PNG", exact: false }).click();
  assert.equal(await transparency.isEnabled(), true);
  await exportDialog.getByRole("button", { name: "Export", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await exportDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await exportDialog.waitFor({ state: "detached" });

  await page.setViewportSize({ width: 320, height: 568 });
  const more = page.getByTestId("editor-top-bar-actions").getByRole("button", { name: "More actions", exact: true });
  await more.waitFor({ state: "visible" });
  await more.click();
  const menu = page.locator("#titlebar-more-menu");
  const items = menu.getByRole("menuitem");
  assert.equal(await items.first().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("End");
  assert.equal(await items.last().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Home");
  assert.equal(await items.first().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(await more.evaluate((element) => element === document.activeElement), true);
}, { hasTouch: true });
console.log("UI global interaction audit passed: search/replace/undo, modal focus, export states, mobile title menu.");
