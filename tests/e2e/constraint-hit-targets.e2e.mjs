import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument } from "./ui-responsive-editor-helpers.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  await seedResponsiveDocument(page);
  for (const [name, axis, value] of [
    ["center-horizontal", "horizontal", "center"],
    ["center-vertical", "vertical", "center"],
    ["left", "horizontal", "left"], ["right", "horizontal", "right"],
    ["top", "vertical", "top"], ["bottom", "vertical", "bottom"],
  ]) {
    const button = page.getByTestId(`editor-constraints-${name}`);
    const bounds = await button.boundingBox();
    assert.ok(bounds.width >= 12 && bounds.height >= 12,
      `${name} requires a usable non-overlapping target: ${JSON.stringify(bounds)}`);
    const previous = await page.evaluate(() => window.__vooEditor.getNode("responsive-target").constraints);
    // A real midpoint hit, not element.click(), must reach the named axis.
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.waitForFunction(({ axis, value }) =>
      window.__vooEditor.getNode("responsive-target").constraints?.[axis] === value, { axis, value });
    const otherAxis = axis === "horizontal" ? "vertical" : "horizontal";
    const next = await page.evaluate(() => window.__vooEditor.getNode("responsive-target").constraints);
    assert.equal(next[otherAxis] ?? (otherAxis === "horizontal" ? "left" : "top"),
      previous?.[otherAxis] ?? (otherAxis === "horizontal" ? "left" : "top"));
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getNode("responsive-target").constraints), previous);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const horizontal = page.getByTestId("editor-constraints-center-horizontal");
  await horizontal.focus();
  await horizontal.press("Enter");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("responsive-target").constraints.horizontal), "center");
  await page.screenshot({ path: "/private/tmp/voo-constraint-targets.png" });
  console.log("Constraint pins: six real midpoint hits, independent axes, one-step undo and keyboard passed.");
});
