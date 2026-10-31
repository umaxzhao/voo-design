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
  await f.record("align-selected-frame-and-child-with-masked-sibling-moves-subtree-and-mask-follower-once", async () => {
    await f.seed([
      frame("host", 140, 40, 260, 220),
      shape("child", "host", 170, 80, { width: 60, height: 40, fill: "#ff0000" }),
      shape("base", null, 300, 320, { width: 100, height: 100, fill: "#ffffff", maskBase: true }),
      shape("clipped", null, 310, 330, { width: 80, height: 80, fill: "#00aa00", clipTo: "base" }),
      shape("anchor", null, 40, 80, { width: 50, height: 50, fill: "#0000ff" }),
    ], ["host", "child", "base", "anchor"]);
    const before = await f.snapshot();
    await page.evaluate(async () => {
      const { alignNodes } = await import("/src/canvas/editor/align_ops.js");
      window.__vooEditor.layoutSelection(alignNodes, "left");
    });
    await f.settle();
    assert.equal((await f.node("host")).x, 40);
    assert.equal((await f.node("child")).x, 70);
    assert.equal((await f.node("base")).x, 40);
    assert.equal((await f.node("clipped")).x, 50);
    assert.equal(await f.pixel({ x: 70, y: 360 }), "#00aa00");
    await f.hierarchy(); await f.history(before);
    return { frameChildSingleDelta: true, maskFollowerMoved: true, undoRedo: true };
  });
  await f.record("arrow-nudge-selected-auto-layout-group-moves-container-and-children-together", async () => {
    await f.seed([
      {
        id: "auto-group",
        name: "AutoGroup",
        kind: "group",
        parentId: null,
        x: 100,
        y: 100,
        width: 100,
        height: 88,
        visible: true,
        autoLayout: { direction: "vertical", gap: 8, padding: 0, alignItems: "start", justifyContent: "start", widthMode: "hug", heightMode: "hug" },
      },
      shape("item-a", "auto-group", 100, 100, { width: 80, height: 40, fill: "#ff0000" }),
      shape("item-b", "auto-group", 100, 148, { width: 80, height: 40, fill: "#0000ff" }),
    ], []);
    await page.evaluate(() => window.__vooEditor.selectGroup("auto-group"));
    await f.settle();
    const before = await f.snapshot();
    await f.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await f.settle();
    assert.equal((await f.node("auto-group")).x, 110);
    assert.equal((await f.node("auto-group")).y, 100);
    assert.equal((await f.node("item-a")).x, 110);
    assert.equal((await f.node("item-a")).y, 100);
    assert.equal((await f.node("item-b")).x, 110);
    assert.equal((await f.node("item-b")).y, 148);
    await f.history(before);
    return { autoLayoutGroupNudged: true, undoRedo: true };
  });
  await f.record("layer-panel-boolean-click-and-group-duplicate-preserve-selection-units", async () => {
    await f.seed([
      {
        id: "folder-1",
        name: "FolderOne",
        kind: "group",
        parentId: null,
        x: 60,
        y: 60,
        width: 100,
        height: 80,
        visible: true,
      },
      shape("member-1", "folder-1", 70, 70, { width: 60, height: 40 }),
      {
        id: "bool-1",
        name: "BooleanBadge",
        kind: "boolean",
        operation: "union",
        parentId: null,
        x: 240,
        y: 60,
        width: 80,
        height: 80,
        fill: "#00aa88",
        visible: true,
        operands: [shape("op-a", null, 240, 60, { width: 50, height: 50 }), shape("op-b", null, 260, 80, { width: 50, height: 50 })],
      },
    ], []);
    await page.getByTestId("editor-layers-panel").getByText("BooleanBadge", { exact: true }).click();
    await f.settle();
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["bool-1"]);
    await page.getByTestId("editor-layers-panel").getByText("FolderOne", { exact: true }).click();
    await f.settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.getSelectedGroup()?.id), "folder-1");
    await f.focus();
    await page.keyboard.press(key("d"));
    await f.settle();
    const state = await page.evaluate(() => ({
      groupId: window.__vooEditor.getSelectedGroup()?.id ?? null,
      selectedIds: window.__vooEditor.getSelectedIds(),
      groups: window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "group").map((n) => n.id),
    }));
    const duplicatedGroupId = state.groups.find((id) => id !== "folder-1");
    assert.ok(duplicatedGroupId);
    assert.equal(state.groupId, duplicatedGroupId);
    return { booleanLayerSelected: true, duplicatedGroupSelectedAsUnit: true };
  });
  await f.record("resized-pen-duplicate-empty-group-delete-and-type-on-path-preserve-container-state", async () => {
    await f.seed([
      frame("host", 40, 40, 600, 400),
      {
        id: "pen-scaled",
        name: "ScaledPen",
        kind: "path",
        pen: true,
        closed: false,
        parentId: "host",
        x: 80,
        y: 80,
        width: 120,
        height: 60,
        baseWidth: 60,
        baseHeight: 30,
        stroke: "#ff0055",
        strokeWidth: 4,
        visible: true,
        points: [{ x: 0, y: 0 }, { x: 60, y: 30 }],
      },
      {
        id: "empty-folder",
        name: "EmptyFolder",
        kind: "group",
        parentId: "host",
        x: 260,
        y: 80,
        width: 80,
        height: 60,
        visible: true,
      },
    ], ["pen-scaled"]);
    await f.focus();
    await page.keyboard.press(key("d"));
    await f.settle();
    const dupId = (await page.evaluate(() => window.__vooEditor.getSelectedIds()))[0];
    const dupPen = await f.node(dupId);
    assert.equal(dupPen.width, 120);
    assert.equal(dupPen.baseWidth, 120);
    assert.equal(dupPen.points[1].x, 120);
    assert.equal(dupPen.points[1].y, 60);

    await page.evaluate(() => window.__vooEditor.select("pen-scaled"));
    assert.equal(await page.evaluate(() => window.__vooEditor.typeOnSelectedPath("CurveText")), true);
    await f.settle();
    const selectedAfterType = await page.evaluate(() => window.__vooEditor.getSelectedIds());
    assert.equal(selectedAfterType.length, 1);
    const typedNode = await f.node(selectedAfterType[0]);
    assert.equal(typedNode.kind, "text");
    assert.equal(typedNode.textPath?.points?.length, 2);
    assert.equal(typedNode.parentId, "host");

    await page.evaluate(() => window.__vooEditor.selectGroup("empty-folder"));
    await f.focus();
    await page.keyboard.press("Backspace");
    await f.settle();
    assert.equal(await f.node("empty-folder"), null);
    return { resizedPenDuplicatedAtFullSize: true, typeOnPathSelectedInFrame: true, emptyGroupDeleted: true };
  });
  await f.record("selected-group-autolayout-toggle-and-enter-key-pen-edit-in-browser", async () => {
    const penNode = {
      id: "pen-enter", name: "PenEnter", kind: "path", pen: true, closed: false, parentId: "host",
      x: 100, y: 120, width: 100, height: 40, baseWidth: 100, baseHeight: 40,
      stroke: "#0f766e", strokeWidth: 3, visible: true,
      points: [{ x: 0, y: 20 }, { x: 100, y: 20 }],
    };
    await f.seed([
      frame("host", 40, 40, 620, 420),
      shape("card-group", "host", 80, 90, { kind: "group", width: 240, height: 120, fill: "transparent" }),
      shape("chip-a", "card-group", 90, 100, { width: 60, height: 40 }),
      shape("chip-b", "card-group", 170, 100, { width: 60, height: 40 }),
      penNode,
    ]);
    await page.evaluate(() => window.__vooEditor.selectGroup("card-group"));
    await f.focus();
    await page.keyboard.press("Shift+A");
    await f.settle();
    const groupsAfterToggle = (await f.snapshot()).nodes.filter(n => n.kind === "group" && !n.isFrame);
    assert.deepEqual(groupsAfterToggle.map(n => n.id), ["card-group"]);
    assert.equal(Boolean((await f.node("card-group")).autoLayout), true);

    await page.keyboard.press("Enter");
    await f.settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.getIsolationGroupId()), "card-group");
    await page.keyboard.press("Escape");
    await f.settle();

    await page.evaluate(() => window.__vooEditor.select("pen-enter"));
    await f.focus();
    await page.keyboard.press("Enter");
    await f.settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.isEditing()), true);
    await page.keyboard.press("Escape");
    await f.settle();
    return { groupAutoLayoutToggledInPlace: true, enterEnteredGroup: true, enterStartedPenEdit: true };
  });
  f.finish();
});
