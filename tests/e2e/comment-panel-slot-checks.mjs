import assert from "node:assert/strict";

/** A single shared inspector rail must survive resize, close and launcher-host remount. */
export async function checkCommentPanelSlot(page) {
  const editor = page.getByTestId("design-editor");
  const rail = page.getByTestId("editor-properties-panel");
  const panel = page.getByTestId("editor-comments-panel");
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const width of [1600, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await settle();
    const before = await page.evaluate(() => ({ doc: JSON.stringify(window.__vooEditor.getDocument()), ids: window.__vooEditor.getSelectedIds() }));
    const launcher = page.getByTestId("editor-comments-toggle");
    assert.equal(await launcher.count(), 1);
    const button = await launcher.boundingBox();
    const title = await page.locator('[data-page-switcher-trigger]').boundingBox();
    assert.ok(button.x >= title.x + title.width && button.x + button.width <= width);
    assert.ok(Math.abs(button.y + button.height / 2 - title.y - title.height / 2) < 2);
    await launcher.click();
    await panel.waitFor();
    assert.equal(await rail.count(), 1);
    assert.equal(await panel.locator("xpath=ancestor::aside").getAttribute("data-testid"), "editor-properties-panel");
    assert.equal(await rail.getByRole("spinbutton", { name: "W", exact: true, includeHidden: true }).count(), 0);
    const bounds = await rail.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900,
      `Shared comment rail remains in the viewport at ${width}px: ${JSON.stringify(bounds)}`);
    if (width === 390) {
      assert.equal(await editor.getByTestId("editor-layers-panel").isVisible(), false);
      const close = panel.getByRole("button", { name: "Close comments", exact: true });
      const box = await close.boundingBox();
      assert.ok(box.width >= 48 && box.height >= 48);
      await close.tap();
    } else {
      await panel.getByRole("button", { name: "Close comments", exact: true }).click();
    }
    await panel.waitFor({ state: "hidden" });
    await rail.getByRole("spinbutton", { name: "W", exact: true, includeHidden: true }).waitFor({ state: "attached" });
    assert.deepEqual(await page.evaluate(() => ({ doc: JSON.stringify(window.__vooEditor.getDocument()), ids: window.__vooEditor.getSelectedIds() })), before);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  const history = page.getByTestId("editor-history-panel");
  const toggleHistory = () => page.evaluate(() => window.dispatchEvent(new CustomEvent("voo:editor-toggle-history")));
  await toggleHistory(); await history.waitFor();
  await page.getByTestId("editor-comments-toggle").click(); await panel.waitFor();
  assert.equal(await history.count(), 0);
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
  await history.waitFor();
  await page.getByTestId("editor-comments-toggle").click(); await panel.waitFor();
  await toggleHistory(); await history.waitFor();
  assert.equal(await panel.count(), 0, "History replaces Comments through its common command");
  await toggleHistory(); await history.waitFor({ state: "hidden" });
  // Use the public store action instead of treating portal DOM as editor-owned state.
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().setBrowserDrawerOpen(true);
  });
  await page.getByTestId("page-switcher").waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("editor-comments-toggle").count(), 0);
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().setBrowserDrawerOpen(false);
  });
  await page.getByTestId("editor-comments-toggle").waitFor();
  assert.equal(await page.getByTestId("editor-comments-toggle").count(), 1);
  console.log("Comments share one right-panel slot at 1600/900/390px, restore the inspector and selection, support touch close, switch with History and remount one page-row launcher.");
}
