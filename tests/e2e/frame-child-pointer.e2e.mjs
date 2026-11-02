import { createAuthoredFrame } from "./authored-frame-fixture.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  await createAuthoredFrame(page);
  const seed = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const editor = window.__vooEditor, initial = editor.getDocument();
    const frame = initial.nodes.find(node => node.isFrame);
    assertFrame(initial, frame);
    function assertFrame(doc, node) {
      if (!doc.isCanvasRoot || !node) throw new Error("The authored fixture must contain a real root Frame");
    }
    editor.setDoc({ ...initial, stroke: "#00ff00", strokeWidth: 8, nodes: [{ ...frame, x: 0, y: 0, width: 400, height: 300,
      fill: "#ffffff", fills: [{ fill: "#ffffff", opacity: 1, visible: true }], clipContent: true }] });
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 32, 32);
    const first = await editor.insertImage(canvas.toDataURL(), { x: 116, y: 116 });
    editor.updateNode(first.id, { x: 100, y: 100, width: 32, height: 32, parentId: frame.id });
    ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, 32, 32);
    const second = await editor.insertImage(canvas.toDataURL(), { x: 216, y: 116 });
    editor.updateNode(second.id, { x: 200, y: 100, width: 32, height: 32, parentId: frame.id });
    editor.selectExactly([]); editor.setTool("select");
    if (editor.getSnappingEnabled()) editor.toggleSnapping();
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 450, panY: 350 }, pendingArtboardFitId: null });
    return { first: first.id, second: second.id, frame: frame.id };
  });
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const canvasOutline = await page.locator("[data-editor-artboard]").first().evaluate((artboard) =>
    getComputedStyle(artboard.firstElementChild).outlineStyle,
  );
  assert.equal(canvasOutline, "none", "A free canvas root must not draw the former page border");
  checks.push("the canvas root stays borderless while its child Frame owns the page surface");
  const client = async (point) => {
    await settled();
    return page.evaluate(point => {
      const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
      const doc = window.__vooEditor.getDocument();
      return { x: board.left + point.x * board.width / doc.width, y: board.top + point.y * board.height / doc.height };
    }, point);
  };
  const drag = async (point, delta) => {
    const start = await client(point);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 6 }); await page.mouse.up();
    await settled(); await page.evaluate(() => window.__vooEditor.flushTransforms());
  };
  const selectedIds = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  const pixel = async (point) => { await settled(); return page.evaluate(point => window.__vooEditor.sampleColorAt(point), point); };
  const firstPoint = await client({ x: 116, y: 116 });
  const before = await selectedIds();
  await page.mouse.click(firstPoint.x, firstPoint.y);
  const after = await selectedIds();
  console.log(JSON.stringify({ before, after, expectedFirst: seed.first, frame: seed.frame }));
  assert.deepEqual(before, []);
  assert.deepEqual(after, [seed.first], "A normal click must select only the image inside its Frame");
  checks.push("clicking an unselected image in the authored root Frame selects only that child");

  await drag({ x: 116, y: 116 }, { x: 40, y: 20 });
  const moved = await page.evaluate(seed => ({ first: window.__vooEditor.getNode(seed.first),
    second: window.__vooEditor.getNode(seed.second), frame: window.__vooEditor.getNode(seed.frame) }), seed);
  assert.deepEqual([moved.first.x, moved.first.y], [140, 120]);
  assert.deepEqual([moved.second.x, moved.second.y, moved.frame.x, moved.frame.y], [200, 100, 0, 0]);
  assert.equal(await pixel({ x: 116, y: 116 }), "#ffffff");
  assert.equal(await pixel({ x: 156, y: 136 }), "#ff0000");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await pixel({ x: 116, y: 116 }), "#ff0000");
  assert.deepEqual(await selectedIds(), [seed.first]);
  checks.push("dragging the child moves its real pixels independently of its sibling and Frame and undoes once");

  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await drag({ x: 300, y: 230 }, { x: 30, y: 20 });
  const frameMove = await page.evaluate(seed => ({ first: window.__vooEditor.getNode(seed.first),
    second: window.__vooEditor.getNode(seed.second), frame: window.__vooEditor.getNode(seed.frame) }), seed);
  assert.deepEqual([frameMove.frame.x, frameMove.frame.y], [30, 20]);
  assert.deepEqual([frameMove.first.x, frameMove.first.y, frameMove.second.x, frameMove.second.y], [130, 120, 230, 120]);
  assert.equal(await pixel({ x: 146, y: 136 }), "#ff0000");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await page.evaluate(id => {
    const node = window.__vooEditor.getNode(id); return [node.x, node.y];
  }, seed.frame), [0, 0]);
  assert.equal(await pixel({ x: 116, y: 116 }), "#ff0000");
  checks.push("dragging the empty Frame surface moves the Frame and both children together in one undoable gesture");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [
      { id: "outer-frame", kind: "group", isFrame: true, x: 20, y: 20, width: 360, height: 260, fill: "#dddddd", visible: true },
      { id: "inner-frame", kind: "group", isFrame: true, parentId: "outer-frame", x: 60, y: 50, width: 220, height: 180, fill: "#bbbbbb", visible: true },
      { id: "nested-rect", kind: "rect", parentId: "inner-frame", x: 90, y: 80, width: 80, height: 60, fill: "#ff0000", visible: true, locked: false },
    ] });
    e.selectExactly([]);
    e.setTool("select");
  });
  const nestedRectPoint = await client({ x: 120, y: 110 });
  await page.mouse.click(nestedRectPoint.x, nestedRectPoint.y);
  assert.deepEqual(await selectedIds(), ["nested-rect"]);
  await page.evaluate(() => window.__vooEditor.updateNode("nested-rect", { visible: false, locked: true }));
  const hiddenRectPoint = await client({ x: 120, y: 110 });
  await page.mouse.click(hiddenRectPoint.x, hiddenRectPoint.y);
  assert.deepEqual(await selectedIds(), ["inner-frame"]);
  const rectRow = page.locator('[id="layer-row-nested-rect"]');
  await rectRow.waitFor();
  await rectRow.getByRole("button").filter({ hasText: /.+/ }).click();
  assert.deepEqual(await selectedIds(), ["nested-rect"]);
  checks.push("nested Frame hits select the clicked visible rectangle; hidden/locked rectangles fall through to the nearest Frame, but remain selectable from Layers");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("nested-rect", { visible: true, locked: false });
    e.selectExactly([]);
  });
  await drag({ x: 250, y: 200 }, { x: 30, y: 20 });
  const movedFrame = await page.evaluate(() => ({
    outer: window.__vooEditor.getNode("outer-frame"),
    inner: window.__vooEditor.getNode("inner-frame"),
  }));
  assert.deepEqual([movedFrame.inner.x, movedFrame.inner.y], [90, 70]);
  assert.deepEqual([movedFrame.outer.x, movedFrame.outer.y], [20, 20]);
  checks.push("dragging the exposed area of overlapping Frames moves the top Frame only");

  const setHierarchy = async (nodes, selection) => {
    await page.evaluate(({ nodes, selection }) => {
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), width: 600, height: 400, crop: null, isCanvasRoot: true, nodes });
      e.selectExactly(selection); e.setTool("select");
    }, { nodes, selection });
    await settled();
  };
  const frame = (id, x, y, width = 280, height = 220) => ({ id, kind: "group", isFrame: true,
    visible: true, x, y, width, height, fill: "#dddddd" });
  const group = (id, parentId, x, y) => ({ id, kind: "group", visible: true,
    parentId, x, y, width: 80, height: 80 });
  const rect = (id, parentId, x, y) => ({ id, kind: "rect", visible: true,
    parentId, x, y, width: 40, height: 30, fill: "#ff0000" });
  const hierarchy = ids => page.evaluate(ids => ids.map(id => {
    const n = window.__vooEditor.getNode(id);
    return { id: n.id, parentId: n.parentId ?? null, x: n.x, y: n.y };
  }), ids);
  await setHierarchy([
    frame("overlap-original", 20, 20), frame("overlap-moved", 40, 40),
    group("overlap-group", "overlap-moved", 80, 80), rect("overlap-child", "overlap-group", 90, 90),
  ], ["overlap-moved"]);
  const beforeOverlap = await hierarchy(["overlap-moved", "overlap-group", "overlap-child"]);
  await drag({ x: 310, y: 250 }, { x: 30, y: 20 });
  const afterOverlap = await hierarchy(["overlap-moved", "overlap-group", "overlap-child"]);
  console.log(JSON.stringify({ beforeOverlap, afterOverlap }));
  assert.deepEqual(afterOverlap, beforeOverlap.map(n => ({ ...n, x: n.x + 30, y: n.y + 20 })));
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await hierarchy(["overlap-moved", "overlap-group", "overlap-child"]), beforeOverlap);
  checks.push("moving an overlapping Frame preserves all nested parent links and restores geometry and hierarchy with one undo");

  await setHierarchy([
    frame("drop-source", 20, 20, 220), frame("drop-target", 300, 20, 220),
    { ...group("moving-group", "drop-source", 80, 70), width: 160, height: 130 },
    { ...group("moving-inner", "moving-group", 90, 80), width: 130, height: 110 },
    { ...rect("moving-child", "moving-inner", 100, 90), width: 100, height: 80 },
  ], ["moving-group"]);
  // Layers selects an ordinary Group as one complete unit, including members.
  await page.evaluate(() => window.__vooEditor.selectGroup("moving-group"));
  const beforeGroup = await hierarchy(["moving-group", "moving-inner", "moving-child"]);
  // Use a body point away from the selected rectangle's radius/resize controls.
  await drag({ x: 150, y: 130 }, { x: 250, y: 0 });
  assert.deepEqual(await hierarchy(["moving-group", "moving-inner", "moving-child"]), beforeGroup.map((n, i) =>
    ({ ...n, x: n.x + 250, parentId: i === 0 ? "drop-target" : n.parentId })));
  assert.equal(await pixel({ x: 365, y: 105 }), "#ff0000");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await hierarchy(["moving-group", "moving-inner", "moving-child"]), beforeGroup);
  checks.push("moving an ordinary nested Group into another Frame reparents only the selected unit and undoes once");

  for (const id of ["moving-group", "moving-child"]) {
    await page.evaluate(id => {
      const e = window.__vooEditor;
      e.updateNode(id, { lockPosition: true }); e.selectGroup("moving-group");
      window.__lockedGroupHistory = JSON.stringify(e.captureDocumentSession().history);
    }, id);
    await drag({ x: 150, y: 130 }, { x: 30, y: 20 });
    assert.deepEqual(await hierarchy(["moving-group", "moving-inner", "moving-child"]), beforeGroup);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.captureDocumentSession().history)),
      await page.evaluate(() => window.__lockedGroupHistory));
    await page.evaluate(id => window.__vooEditor.updateNode(id, { lockPosition: false }), id);
  }
  checks.push("position-locked Group roots or members refuse partial pointer movement without adding history");

  await setHierarchy([
    frame("single-source", 20, 20, 220), frame("single-target", 300, 20, 220),
    { ...rect("single-child", "single-source", 80, 80), width: 100, height: 80 },
  ], ["single-child"]);
  const beforeSingle = await hierarchy(["single-child"]);
  await drag({ x: 130, y: 120 }, { x: 250, y: 0 });
  assert.deepEqual(await hierarchy(["single-child"]), [{ ...beforeSingle[0], parentId: "single-target", x: 330 }]);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await hierarchy(["single-child"]), beforeSingle);
  await drag({ x: 130, y: 120 }, { x: 0, y: 240 });
  assert.deepEqual(await hierarchy(["single-child"]), [{ ...beforeSingle[0], parentId: null, y: 320 }]);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await hierarchy(["single-child"]), beforeSingle);
  checks.push("an individually moved child still enters another Frame or leaves to the root with single-step undo");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
