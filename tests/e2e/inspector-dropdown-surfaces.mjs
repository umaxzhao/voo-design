import assert from "node:assert/strict";

const TRIGGERS =
  '[data-inspector-control="select"], [data-typography-field] button[aria-haspopup="dialog"]';

/** Inspect the actual panel, including font dialogs and embedded choices. */
export async function verifyInspectorDropdownSurfaces({
  page,
  evidence,
  mark,
}) {
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const rows = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const theme of ["dark", "light"])
      for (const locale of ["en", "zh"]) {
        await page.evaluate(
          async ({ theme, locale }) => {
            const { setEditorTheme } =
              await import("/src/canvas/use_editor_theme.js");
            const { setLocale } = await import("/src/shared/i18n.js");
            setEditorTheme(theme);
            await setLocale(locale);
          },
          { theme, locale },
        );
        for (const id of [
          "audit-rect",
          "audit-frame",
          "audit-text",
          "audit-image",
        ]) {
          await page.evaluate(
            (id) =>
              window.__vooEditor.selectExactly([
                id === "audit-image" ? window.__auditImageId : id,
              ]),
            id,
          );
          await settle();
          const toggle = panel.locator(".editor-mobile-panel-toggle");
          if (
            (await toggle.isVisible()) &&
            (await toggle.getAttribute("aria-expanded")) === "false"
          )
            await toggle.click();
          const controls = await panel
            .locator(TRIGGERS)
            .evaluateAll((elements) =>
              elements
                .filter((el) => el.getClientRects().length)
                .map((el) => {
                  const style = getComputedStyle(el);
                  return {
                    label: el.getAttribute("aria-label"),
                    text: el.textContent,
                    borders: [
                      style.borderTopWidth,
                      style.borderRightWidth,
                      style.borderBottomWidth,
                      style.borderLeftWidth,
                    ],
                    radius: parseFloat(style.borderRadius),
                    height: el.getBoundingClientRect().height,
                  };
                }),
            );
          assert.ok(controls.length > 0, `${id} must expose actual dropdowns`);
          if (width === 1440 && locale === "en")
            await panel.screenshot({
              path: `${evidence}/dropdown-${theme}-${id}.png`,
            });
          for (const control of controls) {
            assert.deepEqual(
              control.borders,
              ["0px", "0px", "0px", "0px"],
              `${width}/${theme}/${locale}/${id}/${control.label}: dropdown triggers must have no persistent border`,
            );
            assert.equal(
              control.radius,
              12,
              "Keep the existing large control corners",
            );
            assert.equal(control.height, width < 768 ? 48 : 32);
          }
          rows.push({ width, theme, locale, id, controls });
        }
      }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
    const { setLocale } = await import("/src/shared/i18n.js");
    setEditorTheme("dark");
    await setLocale("en");
    window.__vooEditor.selectExactly(["audit-rect"]);
  });
  await settle();
  const dropdown = panel.getByRole("button", {
    name: "Blend mode",
    exact: true,
  });
  const before = await page.evaluate(() =>
    window.__vooEditor.getNode("audit-rect"),
  );
  await dropdown.hover();
  assert.equal(
    await dropdown.evaluate((el) => getComputedStyle(el).borderTopWidth),
    "0px",
  );
  await dropdown.click();
  assert.equal(
    await dropdown.evaluate((el) => getComputedStyle(el).outlineStyle),
    "none",
    "Pointer input must not add a focus rim",
  );
  const menu = page.getByRole("listbox", { name: "Blend mode", exact: true });
  await menu.waitFor();
  assert.equal(
    await menu.evaluate((el) => getComputedStyle(el).borderTopWidth),
    "1px",
    "Floating menus retain their subtle panel edge",
  );
  await page.keyboard.press("Escape");
  await dropdown.focus();
  await dropdown.press("ArrowDown");
  await menu.waitFor();
  await dropdown.press("Escape");
  assert.equal(
    await dropdown.evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(
    await dropdown.evaluate((el) => getComputedStyle(el).outlineWidth),
    "2px",
    "Keyboard navigation retains visible focus",
  );
  assert.equal(
    await dropdown.evaluate((el) => getComputedStyle(el).borderTopWidth),
    "0px",
  );
  await dropdown.press("Delete");
  await dropdown.press("Backspace");
  const after = await page.evaluate(() =>
    window.__vooEditor.getNode("audit-rect"),
  );
  assert.deepEqual(
    after,
    before,
    "Dropdown navigation must not nudge or change the selected artwork",
  );
  mark(
    `borderless dropdowns and font triggers: ${rows.length} actual shape/Frame/text/image contexts across desktop/mobile, light/dark and English/Chinese; pointer/hover stays flat, keyboard focus and floating panel edge remain`,
  );
}
