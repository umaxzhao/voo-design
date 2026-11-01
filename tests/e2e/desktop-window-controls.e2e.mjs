import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Renderer contract for desktop bridges; actual Linux host behavior is checked separately.
await withEditorBrowser(async ({ page, errors }) => {
  const controls = page.getByTestId("desktop-window-controls");
  await controls.waitFor();
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const min = controls.getByRole("button", { name: "Minimize window" });
  const max = controls.getByRole("button", { name: "Maximize window" });
  const close = controls.getByRole("button", { name: "Close window" });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await controls.boundingBox(), settingsBounds = await settings.boundingBox();
    assert.ok(bounds.x >= settingsBounds.x + settingsBounds.width);
    assert.ok(bounds.x + bounds.width <= width && bounds.y >= 0);
    for (const button of [min, max, close]) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 48 && box.height >= 36);
      assert.equal(await button.evaluate(el => getComputedStyle(el).getPropertyValue("-webkit-app-region")), "no-drag");
    }
  }
  await min.click();
  assert.equal(await page.evaluate(() => window.__windowCalls.minimize), 1);
  await max.click();
  await controls.getByRole("button", { name: "Restore window" }).click();
  assert.equal(await page.evaluate(() => window.__windowCalls.maximize), 2);
  // A compositor restore must beat an older, late initial state query.
  await page.evaluate(() => { window.__nativeState(true); window.__nativeState(false); window.__initialState(true); });
  await controls.getByRole("button", { name: "Maximize window" }).waitFor();
  await close.click();
  assert.equal(await page.evaluate(() => window.__windowCalls.close), 1);
  await page.evaluate(() => window.__vooEditor.setTool("rect"));
  await page.evaluate(() => {
    window.vooDesktop = { platform: "darwin", windowControls: { supported: false } };
    window.electronAPI = { platform: "darwin" };
    window.__vooStore.setWelcomeOpen(true);
  });
  await controls.waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("editor-top-bar").evaluate(el => getComputedStyle(el).paddingLeft), "96px");
  await page.evaluate(() => {
    delete window.vooDesktop; delete window.electronAPI;
    window.__vooStore.setWelcomeOpen(false);
  });
  assert.equal(await controls.count(), 0);
  assert.equal(await page.getByTestId("editor-top-bar").evaluate(el => getComputedStyle(el).paddingRight), "16px");
  assert.deepEqual(errors, []);
  console.log("Desktop window controls: ordering, 1024px fit, no-drag hit targets, minimize, maximize/restore, external state, close and macOS/browser isolation passed");
}, { preparePage: page => page.addInitScript(() => {
  let maximized = false;
  window.__windowCalls = { minimize: 0, maximize: 0, close: 0 };
  window.vooDesktop = { platform: "linux", windowControls: {
    supported: true,
    isMaximized: () => new Promise(resolve => { window.__initialState = resolve; }),
    onMaximizedChange: listener => { window.__nativeState = listener; return () => { window.__nativeState = null; }; },
    minimize: async () => { window.__windowCalls.minimize++; },
    toggleMaximize: async () => {
      window.__windowCalls.maximize++; maximized = !maximized;
      window.__nativeState(maximized); return { maximized };
    },
    close: async () => { window.__windowCalls.close++; },
  } };
}) });
