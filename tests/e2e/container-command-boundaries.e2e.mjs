import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { frame, shape, nestedObjectsFixture } from "./nested-objects-fixture.mjs";
const key = name => `${process.platform === "darwin" ? "Meta" : "Control"}+${name}`;

await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "container-boundaries");
  await f.record("ungroup-selected-nested-containers-without-orphans", async () => {
    await f.seed([frame("outer", 40, 40, 600, 450),
      shape("a", "outer", 100, 100, { kind: "group", width: 300, height: 200, fill: "transparent" }),
      shape("b", "a", 120, 120, { kind: "group", width: 220, height: 150, fill: "transparent" }),
      shape("leaf", "b", 160, 160)], ["a", "b"]);
    const before = await f.snapshot(); await f.focus(); await page.keyboard.press(key("Shift+g")); await f.settle();
    assert.equal(await f.node("a"), null); assert.equal(await f.node("b"), null);
    assert.equal((await f.node("leaf")).parentId, "outer");
    await f.hierarchy(); assert.equal(await f.pixel({ x: 180, y: 180 }), "#ff0000");
    await f.history(before); return { keyboardUngroup: true, validAncestry: true, pixel: true, undoRedo: true };
  });
  await f.record("cross-frame-group-retains-both-visible-members", async () => {
    await f.seed([frame("outer", 20, 20, 660, 400), frame("a", 40, 40, 280, 320, { parentId: "outer" }), shape("red", "a", 100, 140),
      frame("b", 360, 40, 280, 320, { parentId: "outer" }), shape("blue", "b", 420, 140, { fill: "#0000ff" })], ["red", "blue"]);
    const before = await f.snapshot(); await f.focus(); await page.keyboard.press(key("g")); await f.settle();
    assert.equal(await f.pixel({ x: 130, y: 160 }), "#ff0000");
    assert.equal(await f.pixel({ x: 450, y: 160 }), "#0000ff");
    const group = (await f.snapshot()).nodes.find(node => !before.nodes.some(old => old.id === node.id));
    assert.equal(group.parentId, "outer");
    assert.equal((await f.node("red")).parentId, group.id);
    assert.equal((await f.node("blue")).parentId, group.id);
    await f.hierarchy(); await f.history(before); return { crossFrameSelection: true, pixels: true, undoRedo: true };
  });
  await f.record("group-ancestor-and-descendant-preserves-subtree", async () => {
    await f.seed([frame("frame", 40, 40, 280, 300), shape("leaf", "frame", 100, 140),
      shape("loose", null, 420, 140)], ["frame", "leaf", "loose"]);
    const before = await f.snapshot(); await f.focus(); await page.keyboard.press(key("g")); await f.settle();
    assert.equal((await f.node("leaf")).parentId, "frame");
    await f.hierarchy(); await f.history(before); return { subtreeIntact: true, undoRedo: true };
  });
  await f.record("ungroup-mask-container-releases-missing-base-and-undo-restores-clipping", async () => {
    await f.seed([frame("outer", 20, 20, 660, 430), frame("base", 100, 100, 200, 200, { parentId: "outer" }),
      shape("child", "base", 120, 120), shape("follower", "outer", 140, 140, { width: 260, height: 160, fill: "#0000ff", clipTo: "base" })], ["base"]);
    assert.equal(await f.pixel({ x: 200, y: 200 }), "#0000ff");
    assert.equal(await f.pixel({ x: 350, y: 200 }), "#ffffff");
    const before = await f.snapshot(); await f.focus(); await page.keyboard.press(key("Shift+g")); await f.settle();
    assert.equal((await f.node("follower")).clipTo ?? null, null);
    assert.equal(await f.pixel({ x: 350, y: 200 }), "#0000ff");
    await f.hierarchy(); await f.history(before);
    return { removedBaseReleased: true, actualPixels: true, undoRedo: true };
  });
  f.finish();
});
