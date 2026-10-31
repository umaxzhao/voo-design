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
  await f.record("pen-draft-toolbar-switch-commits-open-path-and-clears-draft", async () => {
    await seedFuture();
    const before = await f.snapshot();
    await page.keyboard.press("p"); await f.settle();
    const p1 = await f.client({ x: 140, y: 260 });
    const p2 = await f.client({ x: 280, y: 310 });
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.click(p2.x, p2.y);
    await f.settle();
    assert.equal(await page.evaluate(() => Boolean(window.__vooEditor.getPenDraft())), true);
    await page.getByTestId("editor-toolbar").getByRole("button", { name: "Select", exact: true }).click();
    await f.settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.getPenDraft()), null);
    const created = (await f.snapshot()).nodes.find(node => !before.nodes.some(old => old.id === node.id));
    assert.equal(created?.kind, "path");
    assert.equal(created?.points?.length, 2);
    await f.history(before);
    return { penDraftCommittedOnToolSwitch: true, draftCleared: true, undoRedo: true };
  });
  await f.record("sub-threshold-shape-click-and-escaped-resize-preserve-selection-and-redo", async () => {
    const future = await seedFuture();
    const before = await f.snapshot(), previousHistory = await history();
    await page.keyboard.press("r"); await f.settle();
    const clickPt = await f.client({ x: 320, y: 280 });
    await page.mouse.click(clickPt.x, clickPt.y);
    await f.settle();
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["rect"]);
    assert.deepEqual(await history(), previousHistory);

    await page.keyboard.press("v"); await f.settle();
    const seHandle = await f.client({ x: 170, y: 170 });
    const dragTo = await f.client({ x: 240, y: 230 });
    await page.mouse.move(seHandle.x, seHandle.y);
    await page.mouse.down();
    await page.mouse.move(dragTo.x, dragTo.y, { steps: 5 });
    await f.settle();
    assert.ok((await f.node("rect")).width > 70);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await f.settle();
    assert.deepEqual(await f.snapshot(), before);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["rect"]);
    assert.deepEqual(await history(), previousHistory);
    await f.focus(); await page.keyboard.press(key("Shift+z")); await f.settle();
    assert.deepEqual(await f.snapshot(), future);
    return { subThresholdClickRolledBack: true, resizeEscapedAndRolledBack: true, redoPreserved: true };
  });
  f.finish();
});
