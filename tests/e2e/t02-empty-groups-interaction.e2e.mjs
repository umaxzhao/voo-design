import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 real-UI interaction: empty Styles and Modifiers groups are header-only (41px, like
// Stroke/Effects/Export). Clicking the title add entry must reveal content, adding a
// modifier must leave the empty state, and one Undo / Redo must round-trip it.
const EMPTY_HEIGHT = 41;

const sectionBox = (page, testId) =>
  page.getByTestId(testId).evaluate((element) => {
    const section = element.closest("[data-inspector-section]") ?? element;
    return Math.round(section.getBoundingClientRect().height);
  });

const modifierCount = (page) =>
  page.evaluate(() => (window.__vooEditor.getDocument().modifiers ?? []).length);

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settlePanels(page);

  // Styles: header-only when nothing is applied; the + entry expands the type list.
  assert.equal(await sectionBox(page, "editor-style-section"), EMPTY_HEIGHT, "Styles empty must be header-only");
  await page.getByTestId("editor-style-section").getByRole("button").first().click();
  await settlePanels(page);
  const styleExpanded = await sectionBox(page, "editor-style-section");
  assert.ok(styleExpanded > EMPTY_HEIGHT, `Styles + must reveal content (height ${styleExpanded})`);

  // Modifiers: header-only with no stack or placeholder.
  assert.equal(await sectionBox(page, "editor-modifiers-section"), EMPTY_HEIGHT, "Modifiers empty must be header-only");
  assert.equal(await page.getByTestId("editor-modifiers-empty").count(), 0, "no placeholder body");
  assert.equal(await modifierCount(page), 0, "no modifiers before add");

  await page.getByTestId("editor-modifiers-add").getByRole("button").click();
  const pick = page.locator('[data-testid^="editor-modifier-add-"]:not([disabled])').first();
  await pick.waitFor();
  await pick.click();
  await page.getByTestId("editor-modifier-row").waitFor();
  await settlePanels(page);
  assert.equal(await modifierCount(page), 1, "adding a modifier must store it once");
  assert.equal(await page.getByTestId("editor-modifiers-empty").count(), 0, "content leaves the empty state");

  await page.keyboard.press("ControlOrMeta+Z");
  await settlePanels(page);
  assert.equal(await modifierCount(page), 0, "one Undo removes the added modifier");
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await settlePanels(page);
  assert.equal(await modifierCount(page), 1, "one Redo restores the added modifier");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 interaction ok: styleExpanded=${styleExpanded} modifierRoundTrip=1`);
}, { openDocument: true, mcpLink: true });
