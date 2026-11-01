import assert from "node:assert/strict";
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
  await toggleBtn.waitFor();
  const sidebar = page.getByTestId("welcome-sidebar");
  assert.equal(await sidebar.isVisible(), true, "1440px desktop: sidebar is visible by default");

  // Verify toggle button does not overlap search input when sidebar is expanded on desktop
  const searchInput = page.locator("[data-search-field]");
  const btnBox1440 = await toggleBtn.boundingBox();
  const searchBox1440 = await searchInput.boundingBox();
  const overlapsSearch = !(
    btnBox1440.x + btnBox1440.width <= searchBox1440.x ||
    searchBox1440.x + searchBox1440.width <= btnBox1440.x ||
    btnBox1440.y + btnBox1440.height <= searchBox1440.y ||
    searchBox1440.y + searchBox1440.height <= btnBox1440.y
  );
  assert.equal(overlapsSearch, false, "Toggle button and search input do not overlap in 1440px expanded state");

  const searchCenterTarget = await page.evaluate(({ x, y }) => {
    return document.elementFromPoint(x, y)?.getAttribute("data-search-field");
  }, { x: searchBox1440.x + searchBox1440.width / 2, y: searchBox1440.y + searchBox1440.height / 2 });
  assert.equal(searchCenterTarget, "true", "Center of search box hits search input itself");

  // Toggle to collapse
  await toggleBtn.click();
  await page.waitForTimeout(200);
  assert.equal(await sidebar.isVisible(), false, "Sidebar collapses after clicking toggle button");
  assert.equal(await toggleBtn.getAttribute("aria-expanded"), "false");

  // Verify preference remembered in localStorage
  const storedValue = await page.evaluate(() => localStorage.getItem("voo-welcome-sidebar-expanded"));
  assert.equal(storedValue, "false", "Collapse preference persisted to localStorage");

  // Toggle to expand again
  await toggleBtn.click();
  await page.waitForTimeout(200);
  assert.equal(await sidebar.isVisible(), true, "Sidebar expands after clicking toggle button again");

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
  console.log("Welcome sidebar collapse/expand, 590px overlay and focus management passed.");
});
