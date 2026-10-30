import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const frame = (id, x, y, patch = {}) => ({ id, kind: "group", isFrame: true,
  visible: true, x, y, width: 220, height: 200, fill: "#ffffff", clipContent: true, ...patch });
const rect = (id, parentId, x, y, patch = {}) => ({ id, kind: "rect", visible: true,
  parentId, x, y, width: 80, height: 60, fill: "#ff0000", ...patch });

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async (nodes, ids = ["moving"]) => {
    await page.evaluate(async ({ nodes, ids }) => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), width: 900, height: 600, crop: null,
        isCanvasRoot: true, backgroundColor: "transparent", nodes });
      e.setTool("select"); e.selectExactly(ids);
      if (e.getSnappingEnabled()) e.toggleSnapping();
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 320, panY: 250 }, pendingArtboardFitId: null });
    }, { nodes, ids });
    await settled();
  };
  const snapshot = () => page.evaluate(() => ({ doc: window.__vooEditor.serialise(), ids: window.__vooEditor.getSelectedIds(), groupId: window.__vooEditor.getSelectedGroup?.()?.id ?? null }));
  const drag = async (from, to) => {
    const points = await page.evaluate(({ from, to }) => {
      const e = window.__vooEditor;
      const artboard = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
      const scale = artboard.width / e.getDocument().width;
      const client = p => ({ x: artboard.left + p.x * scale, y: artboard.top + p.y * scale });
      return [client(from), client(to)];
    }, { from, to });
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    await page.mouse.move(points[1].x, points[1].y, { steps: 8 }); await page.mouse.up();
    await settled(); await page.evaluate(() => window.__vooEditor.flushTransforms());
  };
  const parent = id => page.evaluate(id => window.__vooEditor.getNode(id).parentId ?? null, id);
  const pixel = point => page.evaluate(point => window.__vooEditor.sampleColorAt(point), point);
  const historyRoundTrip = async before => {
    const after = await snapshot();
    await page.evaluate(() => window.__vooEditor.undo()); await settled();
    assert.deepEqual(await snapshot(), before, "one undo restores the complete document and selection");
    await page.evaluate(() => window.__vooEditor.redo()); await settled();
    assert.deepEqual(await snapshot(), after, "one redo restores complete geometry, hierarchy and selection");
  };

  await seed([frame("source", 20, 20), rect("moving", "source", 60, 60),
    frame("behind", 300, 20, { width: 200, fill: "#0000ff" }),
    frame("front", 350, 20, { fill: "#00ff00" })]);
  let before = await snapshot();
  await drag({ x: 100, y: 90 }, { x: 400, y: 90 });
  assert.equal(await parent("moving"), "front", "the visible front Frame owns the drop, even if a smaller rear Frame overlaps");
  assert.equal(await pixel({ x: 400, y: 90 }), "#ff0000", "the inserted layer remains above the visible target background");
  await historyRoundTrip(before);
  checks.push("overlapping independent Frames use the visible front Frame rather than a smaller obscured target; document and selection undo/redo exactly");

  const defaultVisibleTarget = frame("default-visible-target", 300, 20);
  delete defaultVisibleTarget.visible;
  await seed([frame("source", 20, 20), rect("moving", "source", 60, 60), defaultVisibleTarget]);
  before = await snapshot();
  await drag({ x: 100, y: 90 }, { x: 400, y: 90 });
  assert.equal(await parent("moving"), "default-visible-target");
  assert.equal(await pixel({ x: 400, y: 90 }), "#ff0000");
  await historyRoundTrip(before);
  checks.push("a default-visible Frame without an explicit visible field accepts a real drop and retains exact undo/redo");

  await seed([frame("source", 20, 20), rect("moving", "source", 60, 60),
    frame("outer", 300, 20, { width: 160, height: 160 }),
    frame("clipped-nested", 420, 40, { parentId: "outer", width: 160, height: 160, fill: "#0000ff" })]);
  before = await snapshot();
  await drag({ x: 100, y: 90 }, { x: 530, y: 100 });
  assert.equal(await parent("moving"), null, "a nested Frame outside its clipping ancestor cannot receive a visible drop");
  assert.equal(await pixel({ x: 530, y: 100 }), "#ff0000");
  await historyRoundTrip(before);
  checks.push("clipped-out nested Frames cannot silently capture a layer dropped on free canvas");

  for (const targetPatch of [{ visible: false }, { locked: true }]) {
    await seed([frame("source", 20, 20), rect("moving", "source", 60, 60),
      frame("excluded-target", 300, 20, targetPatch)]);
    before = await snapshot();
    await drag({ x: 100, y: 90 }, { x: 400, y: 90 });
    assert.equal(await parent("moving"), null);
    assert.equal(await pixel({ x: 400, y: 90 }), "#ff0000");
    await historyRoundTrip(before);
  }
  checks.push("hidden and locked Frames do not acquire dragged children; detached objects stay visible and undo/redo once");

  await seed([frame("source", 20, 20), rect("moving", "source", 60, 60),
    frame("rotated-target", 300, 20, { rotation: 45 })]);
  before = await snapshot();
  await drag({ x: 100, y: 90 }, { x: 320, y: 40 });
  assert.equal(await parent("moving"), null, "an unrotated bounding-box corner is outside the visible rotated Frame");
  await historyRoundTrip(before);
  await seed([frame("source", 20, 20), rect("moving", "source", 60, 60),
    frame("rotated-target", 300, 20, { rotation: 45 })]);
  before = await snapshot();
  await drag({ x: 100, y: 90 }, { x: 400, y: 120 });
  assert.equal(await parent("moving"), "rotated-target");
  await historyRoundTrip(before);
  checks.push("rotated Frame drop tests follow visible geometry, with one-step exact history");

  await seed([frame("source", 20, 20),
    { ...frame("moving", 60, 60, { parentId: "source", width: 100, height: 80 }), isFrame: false, fill: "transparent" },
    { ...frame("moving-inner", 65, 65, { parentId: "moving", width: 90, height: 70 }), isFrame: false, fill: "transparent" },
    rect("moving-leaf", "moving-inner", 70, 70),
    frame("target", 300, 20),
    { ...frame("old-inner", 310, 30, { parentId: "target", width: 200, height: 180 }), isFrame: false, fill: "transparent" },
    rect("old-leaf", "old-inner", 390, 80, { fill: "#00ff00" }),
    rect("foreground", null, 400, 80, { width: 20, height: 20, fill: "#0000ff" })]);
  await page.evaluate(() => window.__vooEditor.selectGroup("moving"));
  before = await snapshot();
  await drag({ x: 110, y: 100 }, { x: 410, y: 100 });
  assert.equal(await parent("moving"), "target");
  assert.equal(await parent("moving-inner"), "moving");
  assert.equal(await parent("moving-leaf"), "moving-inner");
  assert.equal(await pixel({ x: 410, y: 110 }), "#ff0000", "the incoming subtree stays above existing nested target content");
  assert.equal(await pixel({ x: 405, y: 85 }), "#0000ff", "an unrelated foreground root retains its stacking priority");
  await historyRoundTrip(before);
  checks.push("deep Group reparenting moves only its root ownership, keeps each subtree contiguous, and preserves external foreground stacking");

  await seed([frame("source", 20, 20),
    frame("moving", 60, 60, { parentId: "source", width: 100, height: 80, fill: "#cccccc" }),
    rect("nested-leaf", "moving", 70, 70, { width: 30, height: 30 }), frame("target", 300, 20)]);
  before = await snapshot();
  await drag({ x: 130, y: 120 }, { x: 430, y: 120 });
  assert.equal(await parent("moving"), "target");
  assert.equal(await parent("nested-leaf"), "moving");
  await historyRoundTrip(before);
  checks.push("a nested Frame can move as a whole between Frames without flattening its child");

  await seed([frame("source", 20, 20), frame("moving", 60, 60,
    { parentId: "source", width: 140, height: 110 }), rect("nested-leaf", "moving", 70, 70)]);
  before = await snapshot();
  await drag({ x: 170, y: 140 }, { x: 470, y: 370 });
  assert.equal(await parent("moving"), null);
  assert.equal(await parent("nested-leaf"), "moving");
  await historyRoundTrip(before);
  checks.push("a nested Frame dragged onto free canvas becomes a root while its child stays inside it");

  await seed([frame("moving", 40, 40), frame("other-root", 300, 20)]);
  before = await snapshot();
  await drag({ x: 150, y: 140 }, { x: 410, y: 120 });
  assert.equal(await parent("moving"), null);
  assert.equal(await parent("other-root"), null);
  await historyRoundTrip(before);
  checks.push("top-level Frames remain peers when dragged over one another");

  await seed([frame("source", 20, 20, { locked: true }), rect("moving", "source", 60, 60), frame("target", 300, 20)]);
  before = await snapshot();
  const historyEntries = () => page.evaluate(() => {
    const { entries, ...state } = window.__vooEditor.captureDocumentSession().history;
    return { ...state, entries: entries.map(({ id, name }) => ({ id, name })) };
  });
  const lockedHistory = await historyEntries();
  await drag({ x: 100, y: 90 }, { x: 400, y: 90 });
  assert.deepEqual((await snapshot()).doc, before.doc);
  assert.deepEqual(await historyEntries(), lockedHistory);
  checks.push("a child of a locked Frame refuses geometry and ownership changes without adding history");

  await seed([frame("source", 20, 20), rect("moving", "source", 60, 60),
    frame("layout-target", 300, 20, { width: 240, autoLayout: { direction: "horizontal", gap: 10, padding: 20, alignItems: "start" } }),
    rect("existing", "layout-target", 320, 40, { width: 40, height: 40, fill: "#00ff00" })]);
  before = await snapshot();
  await drag({ x: 100, y: 90 }, { x: 450, y: 100 });
  assert.equal(await parent("moving"), "layout-target");
  const layout = await page.evaluate(() => ({ moved: window.__vooEditor.getNode("moving"), existing: window.__vooEditor.getNode("existing") }));
  assert.equal(layout.moved.x, layout.existing.x + layout.existing.width + 10);
  assert.equal(layout.moved.y, layout.existing.y);
  await page.mouse.move(1040, 900); await settled();
  await page.evaluate(() => window.__vooEditor.setHoveredNode("moving"));
  const layoutPixel = await pixel({ x: layout.moved.x + 20, y: layout.moved.y + 20 });
  assert.equal(layoutPixel, "#ff0000");
  assert.equal(await pixel({ x: layout.moved.x, y: layout.moved.y + layout.moved.height / 2 }), "#ff0000",
    "Selection borders and hovered corner controls must not contaminate composited colour sampling");
  await historyRoundTrip(before);
  checks.push("dropping into Auto Layout immediately joins its flow, paints at its computed position and undoes/redoes once");

  console.log(JSON.stringify({ passed: checks }, null, 2));
});
