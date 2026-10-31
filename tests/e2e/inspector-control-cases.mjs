import assert from "node:assert/strict";

/** Inspector-only presentation must preserve the existing editing commands. */
export async function runInspectorControlCases({ page, tool, mark, evidence }) {
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const select = async id => {
    await page.evaluate(id => window.__vooEditor.selectExactly([id]), id);
    await settle();
  };
  const styles = locator => locator.evaluate(async el => {
    // Compare the settled visual state, not frame zero of a color transition.
    await Promise.all(el.getAnimations().map(animation => animation.finished));
    const style = getComputedStyle(el);
    return { radius: parseFloat(style.borderRadius), height: el.getBoundingClientRect().height,
      background: style.backgroundColor, border: style.borderTopColor, borderWidth: style.borderTopWidth,
      fontSize: parseFloat(style.fontSize), font: style.fontFamily };
  });
  await select("audit-rect");
  const x = panel.getByRole("spinbutton", { name: "X", exact: true });
  const field = x.locator("..");
  assert.equal((await styles(field)).radius, 6, "Numeric fields should no longer look like capsules");
  assert.equal((await styles(field)).height, 32);
  assert.ok((await styles(panel)).radius >= 16, "Keep the large floating panel rounded");
  const original = await page.evaluate(() => window.__vooEditor.getNode("audit-rect"));
  await x.fill(String(original.x + 20)); await x.press("Enter"); await settle();
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("audit-rect").x), original.x + 20);
  await tool("undo"); await settle();
  assert.equal(await x.inputValue(), String(original.x));
  await x.fill(String(original.x + 50)); await x.press("Escape"); await settle();
  assert.equal(await x.inputValue(), String(original.x));
  const dropdown = panel.getByRole("button", { name: "Blend mode", exact: true });
  const dropdownStyle = await styles(dropdown);
  assert.equal(dropdownStyle.height, 32);
  assert.equal(dropdownStyle.radius, 6);
  assert.notEqual(dropdownStyle.background, (await styles(field)).background, "A dropdown has a distinct surface");
  assert.equal(dropdownStyle.borderWidth, "1px");
  await dropdown.focus(); await dropdown.press("ArrowDown");
  await page.getByRole("listbox", { name: "Blend mode", exact: true }).waitFor();
  await dropdown.press("Escape");
  assert.equal(await dropdown.getAttribute("aria-expanded"), "false");
  assert.equal(await dropdown.evaluate(el => el === document.activeElement), true);
  const rotate = panel.getByRole("button", { name: /Rotate 90/ });
  assert.equal((await styles(rotate)).background, "rgba(0, 0, 0, 0)", "Commands stay visually lighter than inputs");
  await rotate.click(); await tool("undo"); await settle();
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("audit-rect").rotation), original.rotation);
  await select("audit-frame");
  const horizontal = panel.getByRole("button", { name: "Horizontal", exact: true });
  const strip = horizontal.locator("..");
  assert.equal((await styles(strip)).radius, 8);
  await horizontal.click(); await settle();
  assert.equal(await horizontal.getAttribute("aria-pressed"), "true");
  assert.equal((await styles(panel.getByRole("spinbutton", { name: "W", exact: true }).locator("../.."))).radius, 6);
  const inactive = panel.getByRole("button", { name: "Vertical", exact: true });
  assert.notEqual((await styles(horizontal)).background, (await styles(inactive)).background);
  await tool("undo"); await settle();
  assert.equal(await horizontal.getAttribute("aria-pressed"), "false");
  mark("inspector fields, outlined dropdowns, grouped toggles and quiet commands are visually distinct; typed commit/cancel, keyboard dropdown focus, layout and one-step undo remain real");

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    for (const theme of ["dark", "light"]) for (const locale of ["en", "zh"]) {
      await page.evaluate(async ({ theme, locale }) => {
        const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
        const { setLocale } = await import("/src/shared/i18n.js");
        setEditorTheme(theme); await setLocale(locale);
      }, { theme, locale });
      await settle();
      const toggle = panel.locator(".editor-mobile-panel-toggle");
      if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      await settle();
      await x.scrollIntoViewIfNeeded();
      assert.equal((await styles(field)).radius, 6);
      assert.equal((await styles(field)).height, width < 768 ? 48 : 32);
      assert.ok((await styles(x)).fontSize >= 11, "Readable numeric values at every width");
      const anchorOverlaps = await panel.locator("[data-transform-position]").evaluate(el => {
        const anchor = el.querySelector('[role="radiogroup"]').getBoundingClientRect();
        const fields = el.querySelector('[data-transform-position-fields]').getBoundingClientRect();
        return anchor.right > fields.left && anchor.bottom > fields.top && anchor.top < fields.bottom;
      });
      assert.equal(anchorOverlaps, false, "Anchor buttons must not overlap numeric fields");
      const fields = await panel.locator('[data-inspector-control="field"]').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => {
        const box = el.getBoundingClientRect(); const parent = el.closest('[data-testid="editor-properties-panel"]').getBoundingClientRect();
        return box.x >= parent.x && box.right <= parent.right + 1 && box.width >= 24;
      }));
      assert.ok(fields.every(Boolean), `${width}/${theme}/${locale} fields fit the panel`);
      await panel.screenshot({ path: `${evidence}/controls-${width}-${theme}-${locale}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
    const { setLocale } = await import("/src/shared/i18n.js");
    setEditorTheme("dark"); await setLocale("en");
  });
  mark("inspector control hierarchy keeps large panel radii and usable values at 320/390/768/1440px in both themes and languages");
}
