import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const screenshot = async name => {
    const directory = process.env.VOO_DOUBLE_CLICK_SCREENSHOT_DIR;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${name}.png`) });
  };
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const reset = async (nodes) => {
    await page.evaluate(async (nodes) => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      e.endEdit(); e.endTextEdit(); e.setTool("select"); e.selectExactly([]);
      e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: true,
        nodes: nodes.map(n => ({ visible: true, opacity: 1, ...n })) });
      if (e.getSnappingEnabled()) e.toggleSnapping();
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 200 }, pendingArtboardFitId: null });
    }, nodes);
    await settle();
  };
  const client = point => page.evaluate(point => {
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
  }, point);
  const doubleClick = async point => {
    const at = await client(point);
    await page.mouse.dblclick(at.x, at.y);
    await settle();
  };
  const node = id => page.evaluate(id => window.__vooEditor.getNode(id), id);
  const editId = () => page.evaluate(() => window.__vooEditor.getEdit()?.nodeId ?? null);
  const text = (id, y = 80) => ({ id, name: id, kind: "text", text: "Edit this text", x: 80, y,
    width: 220, height: 40, fontSize: 24, fontFamily: "sans-serif", fill: "#ffffff" });
  const frame = { id: "frame", kind: "group", isFrame: true, x: 0, y: 0, width: 600, height: 400,
    clipContent: true, fill: "#171717" };
  const folder = { id: "folder", kind: "group", x: 60, y: 50, width: 400, height: 300, parentId: "frame" };
  const path = { id: "path", kind: "path", pen: true, closed: true, x: 100, y: 180,
    width: 120, height: 80, baseWidth: 120, baseHeight: 80, fill: "#ff0000",
    points: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80, close: true }] };
  const painted = id => page.evaluate(async id => {
    const result = window.__vooEditor.exportSelectionPng([id]);
    const image = new Image(); image.src = typeof result === "string" ? result : result.dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    let hash = 2166136261, count = 0;
    for (const [i, v] of ctx.getImageData(0, 0, canvas.width, canvas.height).data.entries()) {
      hash = Math.imul(hash ^ v, 16777619) >>> 0;
      if (i % 4 === 3 && v) count++;
    }
    return { width: canvas.width, height: canvas.height, hash, count };
  }, id);

  for (const parent of [null, "frame", "folder"]) {
    const title = { ...text("title"), parentId: parent };
    await reset([frame, ...(parent === "folder" ? [folder] : []), title]);
    const before = await painted(title.id);
    assert.ok(before.count > 0, "The test must edit visible text, not an empty box");
    await doubleClick({ x: 130, y: 100 });
    const input = page.locator('textarea[aria-label="title"]');
    await input.waitFor({ state: "visible" });
    assert.equal(await input.evaluate(el => document.activeElement === el), true);
    assert.equal(await page.evaluate(() => window.__vooEditor.getEditingTextId()), title.id);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), [title.id]);
    if (parent === "folder") await screenshot("text-editing");
    await input.fill("Edited text 中文");
    await input.press("Escape"); await settle();
    assert.equal((await node(title.id)).text, "Edited text 中文");
    assert.equal(await page.evaluate(() => window.__vooEditor.getEditingTextId()), null);
    const after = await painted(title.id);
    assert.ok(after.count > 0); assert.notDeepEqual(after, before);
    await page.evaluate(() => window.__vooEditor.undo()); await settle();
    assert.equal((await node(title.id)).text, title.text);
    assert.deepEqual(await painted(title.id), before);
    await page.evaluate(() => window.__vooEditor.redo());
    assert.equal((await node(title.id)).text, "Edited text 中文");
    checks.push(`text ${parent ?? "root"}: real double-click, focus, typing, painted output, one undo/redo`);
  }

  // Switching directly between two text nodes must not let the old overlay's
  // deferred cleanup close the new edit session or overwrite its content.
  await reset([frame, { ...text("first"), parentId: "frame" }, { ...text("second", 180), parentId: "frame" }]);
  await doubleClick({ x: 130, y: 100 });
  await page.locator('textarea[aria-label="first"]').fill("First updated");
  await doubleClick({ x: 130, y: 200 });
  const secondInput = page.locator('textarea[aria-label="second"]');
  await secondInput.waitFor({ state: "visible" });
  assert.equal(await secondInput.inputValue(), "Edit this text");
  assert.equal((await node("first")).text, "First updated");
  await secondInput.fill("Second updated"); await secondInput.press("Escape"); await settle();
  assert.equal((await node("second")).text, "Second updated");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal((await node("second")).text, "Edit this text");
  assert.equal((await node("first")).text, "First updated");
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal((await node("first")).text, "Edit this text");
  checks.push("successive text overlays commit independently without stale cleanup or duplicate history");

  for (const shape of [path, { id: "rect", kind: "rect", x: 100, y: 180, width: 120, height: 80, fill: "#ff0000" },
    { id: "ellipse", kind: "ellipse", x: 100, y: 180, width: 120, height: 80, fill: "#ff0000" }]) {
    for (const parent of ["frame", "folder"]) {
      await reset([frame, ...(parent === "folder" ? [folder] : []), { ...shape, parentId: parent }]);
      const original = await node(shape.id);
      await doubleClick({ x: 160, y: 220 });
      assert.equal(await editId(), shape.id, `${shape.kind} in ${parent} must enter anchor editing`);
      if (shape.kind === "rect" && parent === "folder") await screenshot("path-editing");
      const editable = await node(shape.id);
      assert.equal(editable.pen, true); assert.equal(editable.parentId, parent);
      const before = await painted(shape.id);
      assert.ok(before.count > 0);
      // The first anchor differs between a rectangle and an ellipse. Use its
      // real node-local coordinate and transformed box, not a DOM handle mock.
      const anchor = await page.evaluate(async id => {
        const n = window.__vooEditor.getNode(id);
        const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry.js");
        return fromNodeLocal(n, { x: n.points[0].x * n.width / n.baseWidth, y: n.points[0].y * n.height / n.baseHeight });
      }, shape.id);
      const a = await client(anchor);
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), [shape.id]);
      const anchorPixels = await page.evaluate(point => {
        const canvas = document.querySelector('[data-testid="workspace-chrome-canvas"]');
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const data = canvas.getContext("2d").getImageData(
          Math.round((point.x - rect.left) * scale) - 3,
          Math.round((point.y - rect.top) * scale) - 3, 7, 7).data;
        let mint = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 100 && data[i + 1] > 180 && data[i + 1] > data[i] * 1.15) mint++;
        }
        return mint;
      }, a);
      assert.ok(anchorPixels > 10, "The active anchor must actually paint mint pixels on the shared chrome surface");
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(a.x + 20, a.y + 15, { steps: 6 }); await page.mouse.up(); await settle();
      assert.notDeepEqual((await node(shape.id)).points, editable.points, "Dragging an anchor must change real vector geometry");
      assert.notDeepEqual(await painted(shape.id), before, "Dragging an anchor must change rendered pixels");
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.__vooEditor.undo()); await settle();
      assert.deepEqual(await node(shape.id), editable);
      assert.deepEqual(await painted(shape.id), before);
      if (shape.kind !== "path") {
        await page.evaluate(() => window.__vooEditor.undo());
        assert.deepEqual(await node(shape.id), original, "Converting a basic shape must be undoable separately");
      }
      checks.push(`${shape.kind} ${parent}: double-click, anchors, actual drag/pixels and undo`);
    }
  }
  for (const tool of ["polygon", "star", "line", "arrow"]) {
    await reset([frame]);
    await page.evaluate(tool => window.__vooEditor.setTool(tool), tool);
    const a = await client({ x: 100, y: 180 }), b = await client({ x: 220, y: 260 });
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    await page.evaluate(() => window.__vooEditor.setTool("select")); await settle();
    const shape = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(n => n.id !== "frame"));
    assert.ok(shape, `${tool} must create a real shape`);
    const original = await node(shape.id);
    // Midpoint is inside filled polygons and directly on the line/arrow shaft.
    await doubleClick({ x: 160, y: 220 });
    assert.equal(await editId(), shape.id, `${tool} must support double-click anchor editing`);
    assert.equal((await node(shape.id)).pen, true);
    // Exercise the chrome path that camera changes can call synchronously,
    // including the transient converted line/arrow before the next redraw.
    await page.evaluate(() => {
      const e = window.__vooEditor, surface = document.createElement("canvas");
      e.renderChrome(surface, e.getViewport(), 600, 400);
    });
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__vooEditor.undo());
    assert.deepEqual(await node(shape.id), original);
    checks.push(`${tool}: actual pointer creation, double-click anchors, undoable conversion`);
  }
  // Locked and hidden layers must still fall through instead of becoming editable.
  await reset([frame, { ...text("locked"), parentId: "frame", locked: true },
    { ...path, parentId: "frame", visible: false }]);
  await doubleClick({ x: 130, y: 100 });
  assert.equal(await page.evaluate(() => window.__vooEditor.getEditingTextId()), null);
  await doubleClick({ x: 160, y: 220 });
  assert.equal(await editId(), null);
  checks.push("locked text and hidden paths cannot be edited through the canvas");

  // Frame fit-to-content on resize handle double-click
  const fitFrame = { id: "fit-frame", kind: "group", isFrame: true, x: 50, y: 50, width: 400, height: 300, fill: "#222222" };
  const fitChild = { id: "fit-child", parentId: "fit-frame", kind: "rect", x: 100, y: 100, width: 200, height: 120, fill: "#ff0000" };
  await reset([fitFrame, fitChild]);
  await page.evaluate(() => window.__vooEditor.selectExactly(["fit-frame"]));
  await settle();

  // Double click SE handle of fit-frame at (450, 350)
  await doubleClick({ x: 450, y: 350 });
  const fitted = await node("fit-frame");
  assert.equal(fitted.x, 100, "Fitted frame x must match child AABB");
  assert.equal(fitted.y, 100, "Fitted frame y must match child AABB");
  assert.equal(fitted.width, 200, "Fitted frame width must match child AABB");
  assert.equal(fitted.height, 120, "Fitted frame height must match child AABB");

  const childAfter = await node("fit-child");
  assert.equal(childAfter.x, 100, "Child absolute x must remain unchanged");
  assert.equal(childAfter.y, 100, "Child absolute y must remain unchanged");
  assert.equal(childAfter.width, 200, "Child width must remain unchanged");
  assert.equal(childAfter.height, 120, "Child height must remain unchanged");

  // Verify single undo step
  await page.evaluate(() => window.__vooEditor.undo());
  await settle();
  const undone = await node("fit-frame");
  assert.equal(undone.x, 50, "Undo must restore frame original x");
  assert.equal(undone.y, 50, "Undo must restore frame original y");
  assert.equal(undone.width, 400, "Undo must restore frame original width");
  assert.equal(undone.height, 300, "Undo must restore frame original height");

  // Verify redo
  await page.evaluate(() => window.__vooEditor.redo());
  await settle();
  const redone = await node("fit-frame");
  assert.equal(redone.x, 100, "Redo must reapply frame fitted x");
  assert.equal(redone.y, 100, "Redo must reapply frame fitted y");
  assert.equal(redone.width, 200, "Redo must reapply frame fitted width");
  assert.equal(redone.height, 120, "Redo must reapply frame fitted height");

  // Empty frame double-click handle must be no-op
  const emptyFrame = { id: "empty-frame", kind: "group", isFrame: true, x: 80, y: 80, width: 300, height: 200, fill: "#333333" };
  await reset([emptyFrame]);
  await page.evaluate(() => window.__vooEditor.selectExactly(["empty-frame"]));
  await settle();
  await doubleClick({ x: 380, y: 280 }); // SE handle of empty frame
  const emptyAfter = await node("empty-frame");
  assert.equal(emptyAfter.x, 80);
  assert.equal(emptyAfter.y, 80);
  assert.equal(emptyAfter.width, 300);
  assert.equal(emptyAfter.height, 200);

  checks.push("frame fit-to-content: double click resize handle fits children AABB, preserves child absolute coordinates, exactly one undo/redo step, empty frame no-op");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
