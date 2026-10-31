import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  await page.route("https://www.awwwards.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Browser preview fixture</body></html>",
    }),
  );
  const trigger = page.getByTestId("titlebar-browser-button");
  const drawer = page.getByTestId("voo-browser-drawer");
  await trigger.click();
  await drawer.waitFor();
  assert.equal(
    await drawer.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + 20),
      );
    }),
    true,
    "Browser toolbar must be above the editor",
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
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const bounds = await drawer.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(
      await drawer.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.right - 18, box.top + 20),
        );
      }),
      true,
      "Close button stays reachable",
    );
  }
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
    "Browser drawer: foreground hit targets, mint/black toggle, viewport bounds, Escape and reopen passed.",
  );
});
