import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  await page.route("https://example.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Browser preview fixture</body></html>",
    }),
  );
  const trigger = page.getByTestId("titlebar-browser-button");
  const drawer = page.getByTestId("voo-browser-drawer");
  assert.ok(await trigger.locator("svg circle").count(), "Browser action uses the globe browser icon");
  await page.locator(".voo-ai-fab").click();
  await page.locator(".agent-composer").waitFor();
  await trigger.click();
  await drawer.waitFor();
  assert.equal(await drawer.evaluate(element => element.parentElement.dataset.testid), "editor-workspace-layout");
  assert.equal(await page.locator(".agent-composer").count(), 0, "Browser opening must close Agent");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("voo:open-agent-panel")));
  await page.locator(".agent-composer").waitFor();
  await drawer.waitFor({ state: "detached" });
  await trigger.click();
  await drawer.waitFor();
  assert.equal(await page.locator(".agent-composer").count(), 0);

  const editor = page.getByTestId("editor-shell");
  const desktopEditorBounds = await editor.boundingBox();
  const desktopBrowserBounds = await drawer.boundingBox();
  assert.ok(desktopEditorBounds.x + desktopEditorBounds.width <= desktopBrowserBounds.x + 1);
  await page.frameLocator('[data-testid="voo-browser-drawer"] iframe')
    .getByText("Browser preview fixture")
    .waitFor();
  assert.equal(await trigger.getAttribute("aria-pressed"), "true");
  // Rapid panel switching must finish the icon color transition before sampling it.
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="titlebar-browser-button"]');
    return getComputedStyle(button).backgroundColor === "rgb(178, 255, 214)" &&
      getComputedStyle(button.querySelector("svg")).color === "rgb(0, 0, 0)";
  });
  const colors = await trigger.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    icon: getComputedStyle(element.querySelector("svg")).color,
  }));
  assert.deepEqual(colors, {
    background: "rgb(178, 255, 214)",
    icon: "rgb(0, 0, 0)",
  });
  await page.screenshot({ path: editorArtifactPath("voo-browser-split.png") });
  await page.setViewportSize({ width: 390, height: 800 });
  const mobileEditorBounds = await editor.boundingBox();
  const mobileBrowserBounds = await drawer.boundingBox();
  assert.ok(mobileEditorBounds.height >= 200, "keep usable canvas space above the browser");
  assert.ok(mobileBrowserBounds.height >= 200, "keep usable preview space below the canvas");
  assert.ok(mobileBrowserBounds.y >= mobileEditorBounds.y + mobileEditorBounds.height - 1,
    "mobile browser must not cover the editor");
  assert.ok(Math.abs(mobileBrowserBounds.x - mobileEditorBounds.x) <= 1);
  assert.ok(mobileBrowserBounds.x + mobileBrowserBounds.width <= 390);
  await page.getByRole("button", { name: /Browser tools|浏览器工具/i }).click();
  await page.getByRole("menuitem", { name: /Open in default browser|在默认浏览器中打开/i }).waitFor();
  await page.screenshot({ path: editorArtifactPath("voo-browser-split-mobile.png") });
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  assert.equal(await trigger.getAttribute("aria-pressed"), "false");
  await trigger.click();
  await drawer.waitFor();
  await drawer
    .getByRole("button", { name: /Close Browser|关闭浏览器/i })
    .click();
  await drawer.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log(
    "Browser split pane: desktop side-by-side, mobile vertical split, page rendering, tools menu and Escape passed.",
  );
});
