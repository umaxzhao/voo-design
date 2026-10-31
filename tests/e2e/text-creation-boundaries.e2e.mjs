import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { frame, shape, nestedObjectsFixture } from "./nested-objects-fixture.mjs";
const key = name => `${process.platform === "darwin" ? "Meta" : "Control"}+${name}`;

await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "text-creation-boundaries");
  const history = () => page.evaluate(() => window.__vooEditor.getHistoryEntries());
  const textPoint = async () => { const p = await f.client({ x: 180, y: 250 }); await page.mouse.click(p.x, p.y); };
  const seedFuture = async (extra = []) => {
    await f.seed([frame("host", 40, 40, 600, 420), shape("rect", "host", 100, 120), ...extra], ["rect"]);
    await f.focus(); await page.keyboard.press(key("d")); await f.settle();
    const future = await f.snapshot(); await page.keyboard.press(key("z")); await f.settle(); return future;
  };
  for (const exit of ["escape", "toolbar"]) await f.record(`empty-text-${exit}-keeps-history-and-redo`, async () => {
    const future = await seedFuture();
    await page.keyboard.press("t"); await f.settle();
    const before = await f.snapshot(), previousHistory = await history();
    await textPoint(); const input = page.locator("textarea:visible"); await input.waitFor();
    if (exit === "escape") await input.press("Escape");
    else await page.getByTestId("editor-toolbar").getByRole("button", { name: "Select", exact: true }).click();
    await f.settle(); assert.equal(await page.locator("textarea:visible").count(), 0); assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(await history(), previousHistory, "An abandoned empty text placement must not create history or destroy redo");
    await f.focus(); await page.keyboard.press(key("Shift+z")); await f.settle(); assert.deepEqual(await f.snapshot(), future);
    return { actualTextPlacement: true, emptyCancel: true, redoPreserved: true };
  });
  await f.record("unchanged-existing-text-edit-does-not-destroy-redo", async () => {
    const text = shape("text", "host", 180, 240, { kind: "text", width: 200, height: 40, text: "Existing text", fontSize: 24, fontFamily: "sans-serif", fill: "#000000" });
    const future = await seedFuture([text]), before = await f.snapshot();
    const p = await f.client({ x: 230, y: 255 }); await page.mouse.dblclick(p.x, p.y);
    const input = page.locator("textarea:visible"); await input.waitFor(); const previousHistory = await history();
    await input.press("Escape"); await f.settle();
    assert.equal(await page.locator("textarea:visible").count(), 0, "Finishing an unchanged edit must actually close its overlay");
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(await history(), previousHistory, "Closing an untouched text overlay must not publish an edit");
    await f.focus(); await page.keyboard.press(key("Shift+z")); await f.settle(); assert.deepEqual(await f.snapshot(), future);
    return { actualDoubleClick: true, noEditNoCommit: true, redoPreserved: true };
  });
  await f.record("text-returning-to-original-content-preserves-document-and-redo", async () => {
    const text = shape("text", "host", 180, 240, { kind: "text", width: 200, height: 40, text: "Existing text", fontSize: 24, fontFamily: "sans-serif", fill: "#000000" });
    const future = await seedFuture([text]), before = await f.snapshot();
    const p = await f.client({ x: 230, y: 255 }); await page.mouse.dblclick(p.x, p.y);
    const input = page.locator("textarea:visible"); await input.waitFor(); const previousHistory = await history();
    await input.fill("Temporary text"); await input.fill("Existing text"); await input.press("Escape"); await f.settle();
    assert.equal(await page.locator("textarea:visible").count(), 0);
    assert.deepEqual(await f.snapshot(), before); assert.deepEqual(await history(), previousHistory);
    await f.focus(); await page.keyboard.press(key("Shift+z")); await f.settle(); assert.deepEqual(await f.snapshot(), future);
    return { temporaryEditReverted: true, documentUnchanged: true, redoPreserved: true };
  });
  await f.record("populated-text-toolbar-exit-retains-one-step-history", async () => {
    await seedFuture(); const before = await f.snapshot(); await page.keyboard.press("t"); await f.settle(); await textPoint();
    const input = page.locator("textarea:visible"); await input.waitFor(); await input.fill("Typed then switched");
    await page.getByTestId("editor-toolbar").getByRole("button", { name: "Select", exact: true }).click(); await f.settle();
    assert.ok((await f.snapshot()).nodes.some(node => node.text === "Typed then switched"));
    await f.history(before); return { typedValueRetained: true, oneStepUndoRedo: true };
  });
  await f.record("public-tool-switch-commits-live-text-without-dom-blur-value", async () => {
    await seedFuture(); const before = await f.snapshot(); await page.keyboard.press("t"); await f.settle(); await textPoint();
    const input = page.locator("textarea:visible"); await input.waitFor(); await input.fill("API tool change");
    // Exercise the public tool API separately from the already-tested toolbar click.
    await page.evaluate(() => window.__vooEditor.setTool("rect")); await f.settle();
    assert.ok((await f.snapshot()).nodes.some(node => node.text === "API tool change"));
    await f.history(before); return { publicToolApi: true, noDomBlurArgument: true, oneStepUndoRedo: true };
  });
  f.finish();
});
