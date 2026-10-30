import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(
  async ({ page, errors }) => {
    page.setDefaultTimeout(10000);
    const trigger = page.locator(
      '.welcome-composer-model-select button[aria-haspopup="listbox"]',
    );
    await trigger.click();
    const menu = page.getByRole("listbox");
    await menu.waitFor();
    assert.equal(
      await menu.evaluate((el) => el.parentElement === document.body),
      true,
    );
    await page.keyboard.press("Escape");

    // Reproduce a tall model list inside a clipped, isolated composer container.
    await page.evaluate(async () => {
      const { mountModelMenuRegression } = await import("/tests/e2e/welcome-model-menu-harness.jsx");
      mountModelMenuRegression();
    });
    const testTrigger = page.getByRole("button", {
      name: "Regression models",
      exact: true,
    });
    const testMenu = page.getByRole("listbox", {
      name: "Regression models",
      exact: true,
    });
    const host = page.locator("#model-menu-regression");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 500 });
      for (const top of [40, 420]) {
        await host.evaluate((el, y) => {
          el.style.top = `${y}px`;
        }, top);
        await testTrigger.click();
        await testMenu.waitFor();
        const box = await testMenu.boundingBox();
        const anchor = await testTrigger.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        assert.ok(box.y >= 0 && box.y + box.height <= 500);
        assert.ok(
          top === 40
            ? box.y >= anchor.y + anchor.height
            : box.y + box.height <= anchor.y,
        );
        assert.ok(
          await testMenu.evaluate((el) => el.scrollHeight > el.clientHeight),
        );
        const last = testMenu.getByRole("option").last();
        await last.scrollIntoViewIfNeeded();
        assert.equal(
          await last.evaluate((el) => {
            const bounds = el.getBoundingClientRect();
            return el.contains(
              document.elementFromPoint(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
              ),
            );
          }),
          true,
        );
        await last.click();
        assert.equal(
          await host.getAttribute("data-selected"),
          "claude:model-39",
        );
        await testMenu.waitFor({ state: "detached" });
      }
    }
    await testTrigger.click();
    await page.keyboard.press("Escape");
    await testMenu.waitFor({ state: "detached" });
    await testTrigger.click();
    await page.mouse.click(2, 2);
    await testMenu.waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(
      "Welcome model menu: portal, clipping, viewport edges, scrolling, selection and dismissal passed.",
    );
  },
  { openDocument: false, mcpLink: false },
);
