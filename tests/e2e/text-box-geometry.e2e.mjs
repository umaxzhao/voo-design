import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async ({ boxWidth = 220, rotation = 0, shear = 0, flipH = false } = {}) => {
    await page.evaluate(async ({ boxWidth, rotation, shear, flipH }) => {
      const e = window.__vooEditor;
      e.endTextEdit(); e.setTool("select"); e.selectExactly([]);
      e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: true, nodes: [
        { id: "frame", kind: "group", isFrame: true, x: 0, y: 0, width: 600, height: 400,
          visible: true, opacity: 1, fill: "#171717", clipContent: true },
        { id: "text", kind: "text", name: "GeometryText", parentId: "frame", x: 100, y: 100,
          width: 220, height: 30, boxWidth, fontSize: 24, fontFamily: "sans-serif", rotation, shear, flipH,
          text: "A simple text box for moving and resizing", fill: "#ffffff", visible: true, opacity: 1 },
      ] });
      e.selectExactly(["text"]);
      if (e.getSnappingEnabled()) e.toggleSnapping();
      const { useDesignStore } = await import("/src/store/design_store.js");
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 200 }, pendingArtboardFitId: null });
    }, { boxWidth, rotation, shear, flipH });
    await settle();
  };
  const node = () => page.evaluate(() => window.__vooEditor.getNode("text"));
  const client = point => page.evaluate(point => {
    const r = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const d = window.__vooEditor.getDocument();
    return { x: r.left + point.x * r.width / d.width, y: r.top + point.y * r.height / d.height };
  }, point);
  const anchor = key => page.evaluate(async key => {
    const { anchorDocPoint } = await import("/src/canvas/editor/scene_geometry_anchors.js");
    return anchorDocPoint(window.__vooEditor.getNode("text"), key);
  }, key);
  const close = (a, b) => {
    assert.ok(Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001, `Pinned point drifted: ${JSON.stringify({ a, b })}`);
  };
  const pixels = () => page.evaluate(async () => {
    const result = window.__vooEditor.exportSelectionPng(["text"]);
    const image = new Image(); image.src = typeof result === "string" ? result : result.dataUrl; await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
    let count = 0, hash = 2166136261;
    for (const [i, v] of ctx.getImageData(0, 0, c.width, c.height).data.entries()) {
      if (i % 4 === 3 && v) count++;
      hash = Math.imul(hash ^ v, 16777619) >>> 0;
    }
    return { width: c.width, height: c.height, count, hash };
  });
  const measured = () => page.evaluate(async () => {
    const { measureText } = await import("/src/canvas/editor/text_metrics.js");
    const ctx = document.createElement("canvas").getContext("2d");
    const n = window.__vooEditor.getNode("text");
    return { actual: { width: n.width, height: n.height }, expected: measureText(ctx, n) };
  });
  const panelMatches = async () => {
    const n = await node();
    const panel = page.getByTestId("editor-properties-panel");
    assert.equal(Number(await panel.getByRole("spinbutton", { name: "W", exact: true }).inputValue()), Math.round(n.width));
    assert.equal(Number(await panel.getByRole("spinbutton", { name: "H", exact: true }).inputValue()), Math.round(n.height));
  };
  for (const boxWidth of [0, 220]) {
    await seed({ boxWidth });
    const before = await node(), beforePixels = await pixels();
    assert.ok(beforePixels.count > 0);
    const at = await client({ x: before.x + 60, y: before.y + 15 });
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    await page.mouse.move(at.x + 40, at.y + 30, { steps: 6 }); await page.mouse.up(); await settle();
    const moved = await node();
    assert.deepEqual([moved.x, moved.y, moved.width, moved.height, moved.fontSize],
      [before.x + 40, before.y + 30, before.width, before.height, before.fontSize]);
    assert.deepEqual(await pixels(), beforePixels);
    const color = await page.evaluate(() => {
      const n = window.__vooEditor.getNode("text");
      return window.__vooEditor.sampleColorAt({ x: n.x, y: n.y });
    });
    assert.ok(color, "Moved text must remain part of the visible canvas");
    await panelMatches();
    await page.evaluate(() => window.__vooEditor.undo()); await settle();
    assert.deepEqual(await node(), before);
    checks.push(`${boxWidth ? "wrapped" : "point"} text moves without changing typography, size or exported pixels and undoes once`);
  }

  const opposite = { nw: "se", ne: "sw", se: "nw", sw: "ne" };
  const cases = [
    ...[0, 220].flatMap(boxWidth => ["nw", "ne", "se", "sw"].map(handle => ({ boxWidth, handle }))),
    { boxWidth: 220, handle: "nw", rotation: 30, shear: 12 },
    { boxWidth: 220, handle: "se", flipH: true },
    { boxWidth: 220, handle: "ne", centered: true },
  ];
  for (const test of cases) {
    await seed(test);
    const before = await node(), beforePixels = await pixels();
    const pin = test.centered ? "center" : opposite[test.handle];
    const pinned = await anchor(pin);
    const corner = await anchor(test.handle), start = await client(corner);
    const left = test.handle.includes("w");
    // Only change width: horizontal corner drags previously did nothing for point text.
    const localDelta = { x: left ? 45 : -45, y: 0 };
    const delta = await page.evaluate(async ({ delta, rotation, shear, flipH }) => {
      const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry.js");
      const n = { x: 0, y: 0, width: 1, height: 1, rotation, shear, flipH };
      const a = fromNodeLocal(n, { x: 0, y: 0 }), b = fromNodeLocal(n, delta);
      return { x: b.x - a.x, y: b.y - a.y };
    }, { delta: localDelta, rotation: before.rotation, shear: before.shear, flipH: before.flipH });
    if (test.centered) await page.keyboard.down("Alt");
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    try {
      await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 6 }); await settle();
      const during = await node(), sizes = await measured();
      assert.equal(during.fontSize, before.fontSize, "A text box resize must not shrink the font");
      assert.ok(during.boxWidth < before.width, "A corner drag must actually resize the text column");
      assert.equal(during.width, Math.ceil(during.boxWidth));
      assert.deepEqual(sizes.actual, sizes.expected, "Measured text bounds must already match before pointerup");
      close(await anchor(pin), pinned);
    } finally {
      await page.mouse.up();
      if (test.centered) await page.keyboard.up("Alt");
    }
    await settle(); await panelMatches();
    const after = await node(), afterPixels = await pixels();
    assert.ok(afterPixels.count > 0);
    assert.notDeepEqual(afterPixels, beforePixels);
    await page.evaluate(() => window.__vooEditor.undo()); await settle();
    assert.deepEqual(await node(), before);
    assert.deepEqual(await pixels(), beforePixels);
    await page.evaluate(() => window.__vooEditor.redo());
    assert.deepEqual(await node(), after);
    checks.push(`${JSON.stringify(test)}: live measured bounds, stable font, pinned corner/center, matching inspector and exact undo/redo`);
  }
  await seed({ boxWidth: 0 });
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes,
      { id: "rect", kind: "rect", x: 100, y: 180, width: 300, height: 80,
        parentId: "frame", visible: true, opacity: 1, fill: "#ff0000" }] });
    e.selectExactly(["text", "rect"]);
  });
  await settle();
  const multiBefore = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
  const combined = await page.evaluate(async () => {
    const { combinedBounds } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    return combinedBounds(e.getSelectedIds().map(id => e.getNode(id)));
  });
  const start = await client({ x: combined.x + combined.width, y: combined.y + combined.height });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x - 30, start.y + 30, { steps: 6 }); await settle();
  const sizes = await measured();
  assert.deepEqual(sizes.actual, sizes.expected, "Mixed-selection text must remeasure during resizing too");
  await page.mouse.up(); await settle();
  assert.notDeepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes), multiBefore);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes), multiBefore);
  checks.push("mixed text/shape selection measures live text geometry and restores every node with one undo");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
