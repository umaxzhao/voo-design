import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// Precision canvas handles/pins have their own tests and equivalent inspector
// fields. This gate owns the ordinary navigation and command targets only.
for (const hasTouch of [false, true]) {
  await withEditorBrowser(async ({ page }) => {
    await seedResponsiveDocument(page);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await settlePanels(page);
      const controls = page.locator([
        '.app-title-brand-row > button',
        '[data-testid="mobile-project-switcher"]',
        '[data-testid="editor-toolbar"] button:not(.editor-toolbar-menu-trigger)',
        '[data-testid="editor-contextual-taskbar"] button',
        '[data-testid="editor-contextual-taskbar"] input[type="color"]',
        '.editor-mobile-panel-toggle',
        '[data-testid="editor-panel-tabs"] [role="tab"]',
        '[data-testid="editor-layers-tabs"] [role="tab"]',
        '[data-page-switcher-trigger]',
      ].join(","));
      let checked = 0;
      for (const control of await controls.all()) {
        if (!await control.isVisible() || await control.isDisabled()) continue;
        const geometry = await control.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, name: element.getAttribute("aria-label") || element.dataset.testid };
        });
        assert.ok(geometry.width >= 48 && geometry.height >= 48,
          `${width}px touch=${hasTouch}: ${JSON.stringify(geometry)}`);
        checked++;
      }
      assert.ok(checked >= 20, `target coverage unexpectedly empty: ${checked}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.screenshot({ path: `/private/tmp/voo-mobile-targets-${hasTouch}.png` });
    console.log(`320/390/768px ordinary navigation/toolbar/panel targets: 48px, touch=${hasTouch}`);
  }, { viewport: { width: 390, height: 900 }, hasTouch });
}
