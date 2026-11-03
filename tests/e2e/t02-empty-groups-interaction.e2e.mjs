import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// Empty groups are header-only: 24px action + equal 8px above/below + 1px divider.
// All five reported groups use the same compact rhythm as
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
  await page.evaluate(() => { const e = window.__vooEditor; e.setDoc({ ...e.getDocument(), colorVariables: [], variablesV2: undefined }); });
  await settlePanels(page);
  await page.getByTestId("editor-properties-panel").screenshot({ path: editorArtifactPath("panel-heading-rhythm.png") });

  for (const title of ["Color variables", "Stroke", "Effects", "Export", "Styles", "Modifiers"]) {
    const box = await page.getByTestId("editor-properties-panel")
      .locator(".inspector-section-title").filter({ hasText: new RegExp(`^${title}$`) })
      .evaluate((element) => {
        const section = element.closest(".border-t");
        const style = getComputedStyle(section);
        return { height: section.getBoundingClientRect().height,
          top: style.paddingTop, bottom: style.paddingBottom,
          folds: section.querySelectorAll(":scope > div:first-child [aria-expanded]").length };
      });
    assert.equal(box.folds, 0, `${title}: header has no fold button`);
    assert.equal(box.height, EMPTY_HEIGHT, `${title}: equal empty group height`);
    assert.equal(box.top, "8px", `${title}: top spacing`);
    assert.equal(box.bottom, "8px", `${title}: bottom spacing`);
  }

  // Read actual section geometry in both languages and themes, not a CSS string.
  const measurements = [];
  for (const width of [1440, 1100]) for (const theme of ["dark", "light"]) for (const locale of ["en", "zh"]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async ({ theme, locale }) => {
      (await import("/src/canvas/use_editor_theme.js")).setEditorTheme(theme);
      await (await import("/src/shared/i18n.js")).setLocale(locale);
    }, { theme, locale });
    await settlePanels(page);
    const sections = await page.evaluate(async () => {
      const { t } = await import("/src/shared/i18n.js");
      return ["editor.variables.title", "styles.title", "editor.props.effects", "editor.props.exportTitle", "editor.props.modifiers"].map(key => {
        const title = t(key);
        const label = [...document.querySelectorAll('[data-testid="editor-properties-panel"] .inspector-section-title')].find(el => el.textContent.trim() === title);
        if (!label) return { title, missing: true };
        const section = label.closest(".border-t"), style = getComputedStyle(section);
        return { title, height: section.getBoundingClientRect().height, top: style.paddingTop, bottom: style.paddingBottom,
          divider: style.borderTopWidth, folds: section.querySelectorAll(":scope > div:first-child [aria-expanded]").length, body: section.children.length > 1 };
      });
    });
    for (const section of sections) {
      assert.equal(section.missing, undefined, JSON.stringify(section));
      assert.deepEqual([section.height, section.top, section.bottom, section.divider, section.folds, section.body],
        [EMPTY_HEIGHT, "8px", "8px", "1px", 0, false], JSON.stringify({ width, theme, locale, section }));
    }
    measurements.push({ width, theme, locale, sections });
    await page.getByTestId("editor-modifiers-section").scrollIntoViewIfNeeded();
    await page.getByTestId("editor-properties-panel").screenshot({ path: editorArtifactPath(`panel-rhythm-${width}-${theme}-${locale}.png`) });
  }
  await writeFile(editorArtifactPath("panel-rhythm-measurements.json"), JSON.stringify(measurements, null, 2));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => { await (await import("/src/shared/i18n.js")).setLocale("en"); (await import("/src/canvas/use_editor_theme.js")).setEditorTheme("dark"); });
  await settlePanels(page);

  // An empty variable group retains both actions; creation reveals the binding
  // controls immediately and one undo returns to the compact empty header.
  const variables = page.getByTestId("editor-color-variables-section");
  await variables.getByRole("button").first().click();
  await page.getByTestId("editor-color-variable-select").waitFor();
  assert.ok(await sectionBox(page, "editor-color-variables-section") > EMPTY_HEIGHT);
  await page.keyboard.press("ControlOrMeta+Z"); await settlePanels(page);
  assert.equal(await sectionBox(page, "editor-color-variables-section"), EMPTY_HEIGHT);
  await page.getByTestId("editor-variables-manage").click();
  await page.getByTestId("editor-variables-panel").waitFor();
  await page.getByTestId("editor-variables-panel").getByRole("button", { name: "Close variables", exact: true }).click();

  // Styles: header-only when nothing is applied; the + entry expands the type list.
  assert.equal(await sectionBox(page, "editor-style-section"), EMPTY_HEIGHT, "Styles empty must be header-only");
  await page.getByTestId("editor-style-section").getByRole("button", { name: /^(Show all style types|显示全部样式类型)$/ }).click();
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
