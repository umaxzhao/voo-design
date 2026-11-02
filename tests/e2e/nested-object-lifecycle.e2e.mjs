import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { nestedObjectsFixture, nestedFrames, shape } from "./nested-objects-fixture.mjs";
const key = name => `${process.platform === "darwin" ? "Meta" : "Control"}+${name}`;

await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "nested-objects");
  const png = (await f.solidPng()).toString("base64");
  const scene = () => [...nestedFrames(),
    shape("folder", "inner", 140, 140, { kind: "group", width: 280, height: 180, fill: "transparent" }),
    shape("rect", "folder", 160, 160),
    shape("ellipse", "folder", 250, 160, { kind: "ellipse", fill: "#0000ff" }),
    shape("path", "folder", 340, 160, { kind: "path", pen: true, closed: true,
      baseWidth: 70, baseHeight: 50, fill: "#00ff00", points: [
        { x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 50 }, { x: 0, y: 50, close: true }] }),
    shape("text", "folder", 160, 250, { kind: "text", text: "Nested text", fontSize: 20,
      fontFamily: "sans-serif", fill: "#000000", width: 160, height: 30 }),
    shape("image", "folder", 350, 250, { kind: "image", fill: "transparent", src: `data:image/png;base64,${png}`, width: 40, height: 30 })];
  const seed = async (nodes = scene(), selected = []) => {
    await f.seed(nodes, selected);
    if (nodes.some(n => n.id === "image")) {
      await page.waitForFunction(() => window.__vooEditor.getNodeBitmap(window.__vooEditor.getNode("image")));
    }
    await f.settle();
  };
  await f.record("mixed-descendants-move-with-inner-frame-and-history", async () => {
    await seed(scene(), ["inner"]);
    const before = await f.snapshot();
    await f.drag({ x: 420, y: 350 }, { x: 440, y: 365 });
    for (const original of before.nodes.filter(n => n.id !== "outer")) {
      const moved = await f.node(original.id);
      assert.equal(moved.x, original.x + 20, original.id);
      assert.equal(moved.y, original.y + 15, original.id);
      assert.equal(moved.parentId, original.parentId);
    }
    for (const [point, color] of [[{ x: 210, y: 195 }, "#ff0000"], [{ x: 305, y: 200 }, "#0000ff"],
      [{ x: 390, y: 200 }, "#00ff00"], [{ x: 385, y: 275 }, "#0000ff"]]) {
      assert.equal(await f.pixel(point), color);
    }
    await f.hierarchy(); await f.history(before);
    return { pointerMove: true, rectEllipsePathTextImageGroup: true, pixels: true, undoRedo: true };
  });
  await f.record("mixed-frame-duplicate-keeps-all-descendants-and-assets", async () => {
    await seed(scene(), ["inner"]);
    const before = await f.snapshot();
    await f.focus(); await page.keyboard.press(key("d")); await f.settle();
    const added = (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(added.length, before.nodes.length - 1);
    assert.deepEqual(added.map(n => n.kind).sort(), before.nodes.filter(n => n.id !== "outer").map(n => n.kind).sort());
    const copiedInner = added.find(n => n.isFrame), copiedFolder = added.find(n => n.name === "folder");
    assert.equal(copiedFolder.parentId, copiedInner.id);
    assert.ok(added.filter(n => ![copiedInner.id, copiedFolder.id].includes(n.id)).every(n => n.parentId === copiedFolder.id));
    assert.equal(added.find(n => n.kind === "image").src, (await f.node("image")).src);
    await f.hierarchy(); await f.history(before);
    return { keyboardDuplicate: true, hierarchy: true, immutableImageSource: true, undoRedo: true };
  });
  await f.record("double-click-nested-text-edits-only-leaf", async () => {
    await seed();
    const before = await f.snapshot(), point = await f.client({ x: 200, y: 265 });
    await page.mouse.dblclick(point.x, point.y);
    const input = page.locator('textarea[aria-label="text"]');
    await input.waitFor(); await input.fill("Edited nested text"); await input.press("Escape");
    assert.equal((await f.node("text")).text, "Edited nested text");
    assert.equal((await f.node("text")).parentId, "folder");
    await f.history(before);
    return { realDoubleClick: true, realTyping: true, ownerPreserved: true, undoRedo: true };
  });
  await f.record("delete-frame-removes-locked-descendant-without-orphans", async () => {
    await seed(scene().map(n => n.id === "ellipse" ? { ...n, locked: true } : n), ["inner"]);
    const before = await f.snapshot();
    await f.focus(); await page.keyboard.press("Backspace"); await f.settle();
    assert.deepEqual((await f.snapshot()).nodes.map(n => n.id), ["outer"]);
    await f.hierarchy(); await f.history(before);
    await page.evaluate(() => window.__vooEditor.undo()); await f.settle();
    assert.equal(await f.pixel({ x: 285, y: 185 }), "#0000ff");
    await page.evaluate(() => window.__vooEditor.redo());
    return { realKeyboardDelete: true, lockedChildRemovedWithParent: true, undoRedo: true };
  });
  await f.record("locked-mask-base-delete-is-complete-noop", async () => {
    await seed([...nestedFrames(), shape("base", "inner", 180, 180, { locked: true }),
      shape("paint", "inner", 180, 180, { clipTo: "base" })], ["base"]);
    const before = await f.snapshot(), index = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
    await f.focus(); await page.keyboard.press("Backspace"); await f.settle();
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), index);
    return { noMutation: true, noHistory: true, maskReferencePreserved: true };
  });
  await f.record("copied-image-matte-is-independent-and-stroke-undoable", async () => {
    await seed(nestedFrames());
    const image = await page.evaluate(async src => {
      const e = window.__vooEditor;
      const image = await e.insertImage(src, { x: 220, y: 200 });
      e.updateNode(image.id, { parentId: "inner", x: 170, y: 160, width: 100, height: 80 });
      await e.createEmptyMask(image.id); e.endMaskEdit();
      e.selectExactly([image.id]); e.duplicateSelected();
      const copyId = e.getSelectedIds()[0];
      e.moveNodesBy([copyId], 130, 0);
      return { originalId: image.id, copyId };
    }, `data:image/png;base64,${png}`);
    const before = await f.snapshot(), originalMask = (await f.node(image.originalId)).maskId;
    await page.evaluate(id => {
      const e = window.__vooEditor; e.beginMaskEdit(id); e.setMaskMode("erase");
      e.setMaskBrushSize(30); e.setTool("brush");
    }, image.copyId);
    await f.drag({ x: 345, y: 190 }, { x: 355, y: 210 });
    await page.evaluate(async () => { const e = window.__vooEditor; await e.flushMasks(); e.endMaskEdit(); e.setTool("select"); });
    assert.equal((await f.node(image.originalId)).maskId, originalMask);
    assert.notEqual((await f.node(image.copyId)).maskId, originalMask);
    assert.equal(await f.pixel({ x: 220, y: 200 }), "#0000ff");
    assert.equal(await f.pixel({ x: 350, y: 200 }), "#ffffff");
    await page.evaluate(() => window.__vooEditor.selectExactly([]));
    const erased = await f.client({ x: 350, y: 200 });
    await page.mouse.click(erased.x, erased.y); await f.settle();
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["inner"]);
    await f.hierarchy(); await f.history(before);
    return { realMaskBrush: true, copyOnWriteMask: true, independentOriginal: true, undoRedo: true };
  });
  f.finish();
});
