import { createAuthoredFrame } from "./authored-frame-fixture.mjs";
import assert from "node:assert/strict";

/** Exercise actual right-click, pointer traversal, keyboard navigation and menu actions. */
export async function checkContextSubmenus(page) {
  await createAuthoredFrame(page);
  await page.setViewportSize({ width: 800, height: 900 });
  const open = async () => {
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.setTool("select");
      e.selectExactly([e.getDocument().nodes.find((n) => n.isFrame).id]);
    });
    const rect = await page.locator("[data-editor-artboard]").boundingBox();
    await page.mouse.click(
      Math.min(rect.x + rect.width * 0.5, 760),
      rect.y + rect.height * 0.6,
      { button: "right" },
    );
    await page
      .getByRole("menu", { name: "Context menu", exact: true })
      .waitFor();
  };
  await open();
  const root = page.getByRole("menu", { name: "Context menu", exact: true });
  const same = page.getByTestId("editor-menu-select-same-submenu");
  assert.equal(
    await same.count(),
    1,
    "Select-same actions must be collapsed behind one group",
  );
  assert.equal(
    await page.getByTestId("editor-menu-select-same-fill").count(),
    0,
  );
  assert.ok(
    (await root.boundingBox()).height < 600,
    "Default menu should fit without the former tall list",
  );
  assert.equal(
    await root.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.right - 18, r.bottom - 18),
      );
    }),
    true,
    "Floating Agent launcher must not cover menu actions",
  );
  await same.hover();
  const sameOptions = page.getByTestId("editor-menu-select-same-options");
  await sameOptions.waitFor();
  const rootBox = await root.boundingBox(),
    childBox = await sameOptions.boundingBox();
  assert.ok(
    childBox.x >= 8 &&
      childBox.y >= 8 &&
      childBox.x + childBox.width <= 792 &&
      childBox.y + childBox.height <= 892,
  );
  if (rootBox.x + rootBox.width + childBox.width + 8 > 800)
    assert.ok(
      childBox.x < rootBox.x,
      "Submenu flips left at the viewport edge",
    );
  await page.getByTestId("editor-menu-select-same-kind").hover();
  assert.equal(
    await sameOptions.isVisible(),
    true,
    "Crossing into the portaled submenu keeps it open",
  );
  await page.getByTestId("editor-menu-properties-submenu").hover();
  assert.equal(await sameOptions.count(), 0, "Only one group stays expanded");
  await page.getByTestId("editor-menu-properties-submenu").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByTestId("editor-menu-copy-properties")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page
      .getByTestId("editor-menu-copy-properties")
      .evaluate((el) => el === document.activeElement),
    true,
    "Disabled paste is skipped",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await root.isVisible(),
    true,
    "First Escape returns to the parent",
  );
  assert.equal(
    await page
      .getByTestId("editor-menu-properties-submenu")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await root.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.__vooEditor.hasStyleClipboard()),
    true,
    "Secondary action still dispatches the engine operation",
  );
  await open();
  await page.getByTestId("editor-menu-copy-export-submenu").click();
  await page.getByTestId("editor-menu-copy-export-options").waitFor();
  // Scrolling inside a portal must keep it open; Window targets must close it
  // without reaching Node.contains, which rejects non-Node EventTargets.
  await page.getByTestId("editor-menu-copy-export-options").evaluate(element => element.dispatchEvent(new Event("scroll", { bubbles: true })));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.getByTestId("editor-menu-copy-export-options").isVisible(), true);
  for (const type of ["resize", "scroll"]) {
    await page.evaluate(type => window.dispatchEvent(new Event(type)), type);
    await page.getByTestId("editor-menu-copy-export-options").waitFor({ state: "detached", timeout: 5000 });
    await open();
    await page.getByTestId("editor-menu-copy-export-submenu").click();
    await page.getByTestId("editor-menu-copy-export-options").waitFor();
  }
  await page.screenshot({ path: "/tmp/voo-context-menu-fixed.png" });
  await page.mouse.click(8, 870);
  assert.equal(await root.count(), 0);
  assert.equal(
    await page.locator("[data-editor-context-surface]").count(),
    0,
    "Outside dismissal clears both levels",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
}
