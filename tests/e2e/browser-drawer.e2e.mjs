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
  await trigger.click();
  await drawer.waitFor();
  const editor = page.getByTestId("editor-shell");
  const desktopEditorBounds = await editor.boundingBox();
  const desktopBrowserBounds = await drawer.boundingBox();
  assert.ok(desktopEditorBounds.x + desktopEditorBounds.width <= desktopBrowserBounds.x + 1);
  await page.frameLocator('[data-testid="voo-browser-drawer"] iframe')
    .getByText("Browser preview fixture")
    .waitFor();
  assert.equal(
    await drawer.getByRole("button", { name: /Pick Element|选取元素/i }).count(),
    1,
    "element picking should be directly available beside the browser menu",
  );
  assert.equal(
    await drawer.getByRole("button", { name: /Import Page|导入整页/i }).count(),
    1,
    "full-page import should be directly available beside the browser menu",
  );
  assert.equal(await trigger.getAttribute("aria-pressed"), "true");
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('[data-testid="titlebar-browser-button"]'),
      ).backgroundColor === "rgb(178, 255, 214)",
  );
  const colors = await trigger.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    icon: getComputedStyle(element.querySelector("svg")).color,
  }));
  assert.deepEqual(colors, {
    background: "rgb(178, 255, 214)",
    icon: "rgb(0, 0, 0)",
  });
  await page.screenshot({ path: "/private/tmp/voo-browser-split.png" });
  await page.setViewportSize({ width: 390, height: 800 });
  const mobileEditorBounds = await editor.boundingBox();
  const mobileBrowserBounds = await drawer.boundingBox();
  assert.ok(mobileEditorBounds.y + mobileEditorBounds.height <= mobileBrowserBounds.y + 1);
  assert.equal(mobileBrowserBounds.x, mobileEditorBounds.x);
  assert.ok(mobileBrowserBounds.x + mobileBrowserBounds.width <= 390);
  await page.getByRole("button", { name: /Browser tools|浏览器工具/i }).click();
  const toolsMenu = drawer.getByRole("menu", { name: /Browser tools|浏览器工具/i });
  assert.equal(await toolsMenu.getByRole("menuitem", { name: /Pick Element|选取元素/i }).count(), 0);
  assert.equal(await toolsMenu.getByRole("menuitem", { name: /Import Page|导入整页/i }).count(), 0);
  await page.getByRole("menuitem", { name: /Open in default browser|在默认浏览器中打开/i }).waitFor();
  await page.screenshot({ path: "/private/tmp/voo-browser-split-mobile.png" });
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
    "Browser split pane: desktop side-by-side, mobile stacked, page rendering, tools menu and Escape passed.",
  );
});
