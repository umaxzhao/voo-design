import assert from "node:assert/strict";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  // 1. Desktop viewport (1440px): sidebar is expanded by default
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().setWelcomeOpen(true);
  });
  await page.waitForTimeout(400);

  const toggleBtn = page.getByTestId("welcome-sidebar-toggle");
  const sidebar = page.getByTestId("welcome-sidebar");
  await sidebar.waitFor();
  await page.screenshot({ path: editorArtifactPath("welcome-wide-before-check.png") });
  assert.equal(await toggleBtn.isVisible(), false, "1440px desktop: compact menu is absent");
  assert.equal(await sidebar.isVisible(), true, "1440px desktop: navigation remains available");
  const searchInput = page.locator("[data-search-field]");
  const searchBox1440 = await searchInput.boundingBox();
  const searchCenterTarget = await page.evaluate(({ x, y }) => {
    return document.elementFromPoint(x, y)?.getAttribute("data-search-field");
  }, { x: searchBox1440.x + searchBox1440.width / 2, y: searchBox1440.y + searchBox1440.height / 2 });
  assert.equal(searchCenterTarget, "true", "Center of search box hits search input itself");

  // A legacy desktop collapse preference cannot strand navigation after its
  // compact entry is removed. Test boundary transitions even when expanded
  // state stays false: responsive layout must still update.
  await page.evaluate(() => localStorage.setItem("voo-welcome-sidebar-expanded", "false"));
  for (const width of [850, 769, 768, 767, 390, 769, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(expected => document.querySelector('.welcome-dashboard')?.dataset.sidebarExpanded === String(expected), width > 768);
    assert.equal(await toggleBtn.isVisible(), width <= 768, `${width}: compact entry follows the existing768 breakpoint`);
    assert.equal(await sidebar.isVisible(), width > 768, `${width}: default sidebar layout`);
    if (width <= 768) {
      const box = await toggleBtn.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${width}: 44px target including breakpoint`);
      assert.equal(await toggleBtn.locator("svg [stroke], svg[stroke]").count(), 0, "filled glyph has no stroked geometry");
      assert.equal(await toggleBtn.locator("svg rect").count(), 2, "filled navigation blocks");
    }
    await page.screenshot({ path: editorArtifactPath(`welcome-menu-${width}.png`) });
  }
  assert.equal(await page.evaluate(() => localStorage.getItem("voo-welcome-sidebar-expanded")), "false", "legacy preference is preserved, not erased");

  // 2. Narrow screen and 590px: default collapsed with circular button
  await page.setViewportSize({ width: 590, height: 800 });
  await page.waitForTimeout(400);

  assert.equal(await sidebar.isVisible(), false, "590px narrow window: sidebar is collapsed by default");
  const btnBox = await toggleBtn.boundingBox();
  assert.ok(btnBox.width >= 44 && btnBox.height >= 44, "Toggle button touch target is >= 44px on mobile/narrow screen");

  // Verify file cards width in content area is >= 120px and not squeezed
  const card = page.locator(".welcome-home-projects .grid > div").first();
  if (await card.count()) {
    const cardBox = await card.boundingBox();
    assert.ok(cardBox.width >= 120, `Card width must be >= 120px without vertical distortion (got ${cardBox.width}px)`);
  }

  // Click toggle to open overlay drawer
  await toggleBtn.click();
  await page.waitForTimeout(200);
  assert.equal(await sidebar.isVisible(), true, "Sidebar drawer opens as an overlay on click");
  const backdrop = page.getByTestId("welcome-sidebar-backdrop");
  assert.equal(await backdrop.isVisible(), true, "Backdrop is visible when overlay drawer is open");

  // Press Escape to dismiss overlay
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await sidebar.isVisible(), false, "Sidebar closes on Escape");
  assert.equal(await backdrop.isVisible(), false, "Backdrop disappears on Escape");

  // Focus restored to toggle button
  const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(focusedTestId, "welcome-sidebar-toggle", "Focus is restored to toggle button after closing");

  // Click toggle again and click backdrop to close
  await toggleBtn.click();
  await page.waitForTimeout(200);
  await backdrop.click();
  await page.waitForTimeout(200);
  assert.equal(await sidebar.isVisible(), false, "Sidebar closes when backdrop is clicked");

  // Click toggle again and select a navigation item to auto-close
  await toggleBtn.click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /Drafts|草稿/i }).click();
  await page.waitForTimeout(200);
  assert.equal(await sidebar.isVisible(), false, "Sidebar automatically closes after selecting a nav item on narrow screen");

  assert.deepEqual(errors, []);
  console.log("Desktop compact-entry visibility, filled glyph, resize boundaries, legacy preference safety and unchanged590px overlay/focus routes passed.");
});
