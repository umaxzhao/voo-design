import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const camera = () => page.evaluate(async () => ({ ...(await import("/src/store/design_store.js")).useDesignStore.getState().editorCamera }));
  const layout = () => page.evaluate(async () => {
    const state = (await import("/src/store/design_store.js")).useDesignStore.getState();
    const value = state.editorArtboardLayouts;
    return { ...(value instanceof Map ? value.get(state.editingNodeId) : value[state.editingNodeId]) };
  });
  const docPoint = async (point) => {
    await settled();
    return page.evaluate((point) => {
      const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
      const doc = window.__vooEditor.getDocument();
      return { x: board.left + point.x * board.width / doc.width, y: board.top + point.y * board.height / doc.height };
    }, point);
  };
  const drag = async (point, delta) => {
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + delta.x, point.y + delta.y, { steps: 6 }); await page.mouse.up();
    await settled(); await page.evaluate(() => window.__vooEditor.flushTransforms());
  };
  const emptyPoint = () => page.evaluate(() => {
    const stage = document.querySelector('[data-testid="editor-pages"]').getBoundingClientRect();
    for (const [x, y] of [[0.55, 0.75], [0.6, 0.8], [0.5, 0.85], [0.7, 0.65]]) {
      const point = { x: stage.left + stage.width * x, y: stage.top + stage.height * y };
      const target = document.elementFromPoint(point.x, point.y);
      if (target && !target.closest('[data-editor-artboard], button, input, [role="dialog"], [data-testid="editor-properties-panel"], [data-testid="editor-layers-panel"]')) return point;
    }
    throw new Error("No reachable empty canvas point");
  });
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    window.__navigationAuditStore = useDesignStore;
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff",
      nodes: [{ ...createRectNode({ x: 80, y: 80, width: 80, height: 60, fill: "#ff0000" }), id: "navigation-target" }] });
    e.selectExactly([]); e.setTool("select"); if (e.getSnappingEnabled()) e.toggleSnapping();
    useDesignStore.setState({ editorCamera: { zoom: 0.8, panX: 300, panY: 160 } });
  });
  await settled();
  const initialLayout = await layout(), initialCamera = await camera();
  await drag(await docPoint({ x: 120, y: 110 }), { x: 32, y: 24 });
  assert.deepEqual(await page.evaluate(() => {
    const n = window.__vooEditor.getNode("navigation-target"); return [n.x, n.y];
  }), [120, 110]);
  assert.deepEqual(await layout(), initialLayout);
  assert.deepEqual(await camera(), initialCamera);
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("navigation-target").x), 80);
  checks.push("real pointer moves unselected artwork independently of page layout/camera and undoes once");

  const empty = await emptyPoint(), beforePan = await camera();
  await drag(empty, { x: 40, y: 30 });
  const afterPan = await camera();
  assert.equal(afterPan.panX, beforePan.panX + 40); assert.equal(afterPan.panY, beforePan.panY + 30);
  assert.equal(afterPan.zoom, beforePan.zoom); assert.deepEqual(await layout(), initialLayout);
  await tool("redo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("navigation-target").x), 120);
  await tool("undo");
  checks.push("empty-canvas drag only pans the view and preserves the document redo branch");

  const candidate = await emptyPoint();
  const wheelAt = { x: Math.round(candidate.x), y: Math.round(candidate.y) };
  await page.mouse.move(wheelAt.x, wheelAt.y);
  const beforeWheel = await camera(); await page.mouse.wheel(20, 45);
  await page.waitForFunction(previous => window.__navigationAuditStore.getState().editorCamera.panY !== previous, beforeWheel.panY);
  assert.equal((await camera()).zoom, beforeWheel.zoom);
  const worldPoint = await page.evaluate(async (point) => {
    const stage = document.querySelector('[data-testid="editor-pages"]').getBoundingClientRect();
    const c = (await import("/src/store/design_store.js")).useDesignStore.getState().editorCamera;
    return { x: (point.x - stage.left - c.panX) / c.zoom, y: (point.y - stage.top - c.panY) / c.zoom };
  }, wheelAt);
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -80); await page.keyboard.up("Control");
  await page.waitForFunction(previous => window.__navigationAuditStore.getState().editorCamera.zoom !== previous, beforeWheel.zoom);
  const anchored = await page.evaluate(async (point) => {
    const stage = document.querySelector('[data-testid="editor-pages"]').getBoundingClientRect();
    const c = (await import("/src/store/design_store.js")).useDesignStore.getState().editorCamera;
    return { x: (point.x - stage.left - c.panX) / c.zoom, y: (point.y - stage.top - c.panY) / c.zoom };
  }, wheelAt);
  assert.ok(Math.abs(anchored.x - worldPoint.x) < 1e-6 && Math.abs(anchored.y - worldPoint.y) < 1e-6, JSON.stringify({ anchored, worldPoint, wheelAt }));
  await page.keyboard.press("Shift+0"); await settled(); assert.equal((await camera()).zoom, 1);
  checks.push("wheel pan, cursor-anchored Ctrl-wheel zoom and the 100% shortcut use the shared camera");

  // Fixed pages retain a DOM title drag path used by older documents/presentations.
  const title = page.locator('[data-testid="editor-page-title"]:visible').first();
  await title.waitFor();
  let box = await title.boundingBox();
  const beforeTitlePan = await camera(), beforeTitleLayout = await layout();
  await page.keyboard.down("Space");
  await drag({ x: box.x + Math.min(20, box.width / 2), y: box.y + box.height / 2 }, { x: 42, y: 28 });
  await page.keyboard.up("Space"); await settled();
  assert.equal((await camera()).panX, beforeTitlePan.panX + 42);
  assert.equal((await camera()).panY, beforeTitlePan.panY + 28);
  assert.deepEqual(await layout(), beforeTitleLayout);
  checks.push("Space-dragging a page title pans using a real gesture origin without moving the page");

  box = await title.boundingBox();
  const beforeCancel = await layout();
  await page.mouse.move(box.x + Math.min(20, box.width / 2), box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + Math.min(20, box.width / 2) + 35, box.y + box.height / 2 + 25, { steps: 5 });
  await settled(); assert.notDeepEqual(await layout(), beforeCancel);
  await title.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", bubbles: true });
  await page.mouse.up(); await settled();
  assert.deepEqual(await layout(), beforeCancel);
  checks.push("canceling a title drag restores the original page layout instead of keeping the preview position");

  await page.evaluate(async () => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), isCanvasRoot: true, nodes: [
      { ...createGroupNode({ x: 80, y: 70, width: 300, height: 200 }), id: "current-frame", name: "Outer Frame", frame: true, isFrame: true, fill: "#222222" },
      { ...createRectNode({ x: 110, y: 100, width: 60, height: 40, fill: "#ff0000" }), id: "frame-child", parentId: "current-frame" },
    ] }); e.selectExactly(["current-frame"]);
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 150 } });
  });
  await settled();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="editor-canvas-frame-label"]')?.textContent.trim() === "Outer Frame",
  );
  assert.equal(await page.locator('[data-testid="editor-canvas-frame-label"]').count(), 1);
  assert.equal(await page.locator('[data-testid="editor-canvas-frame-icon"]').count(), 1);
  checks.push("only the outermost root frame shows a name label and frame icon");
  await drag(await docPoint({ x: 140, y: 120 }), { x: 30, y: 20 });
  assert.deepEqual(await page.evaluate(() => [window.__vooEditor.getNode("current-frame").x, window.__vooEditor.getNode("frame-child").x]), [80, 140]);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 150, y: 130 })), "#ff0000");
  await tool("undo");
  assert.deepEqual(await page.evaluate(() => [window.__vooEditor.getNode("current-frame").x, window.__vooEditor.getNode("frame-child").x]), [80, 110]);
  checks.push("a child inside the current free-canvas Frame moves and repaints independently with one-step undo");

  await page.evaluate(async () => {
    const e = window.__vooEditor;
    e.selectExactly(["current-frame"]);
  });
  const frameBody = await docPoint({ x: 200, y: 200 });
  await page.mouse.click(frameBody.x, frameBody.y);
  await page.keyboard.press("Control+c");
  await page.waitForFunction(() => window.__vooEditor.hasLayerClipboard(), undefined, { timeout: 5000 });
  await page.keyboard.press("Control+v");
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 4, undefined, { timeout: 5000 });
  const pastedFrame = await page.evaluate(() => {
    const e = window.__vooEditor;
    const selectedId = e.getSelectedIds()[0];
    const frame = e.getNode(selectedId);
    const child = e.getDocument().nodes.find(node => node.parentId === selectedId);
    return { id: frame?.id, x: frame?.x, y: frame?.y, childX: child?.x, childY: child?.y };
  });
  assert.ok(pastedFrame.id && pastedFrame.id !== "current-frame");
  await drag(await docPoint({ x: pastedFrame.x + 250, y: pastedFrame.y + 150 }), { x: 30, y: 20 });
  assert.deepEqual(await page.evaluate(id => {
    const e = window.__vooEditor;
    const frame = e.getNode(id);
    const child = e.getDocument().nodes.find(node => node.parentId === id);
    return [frame.x, frame.y, child.x, child.y];
  }, pastedFrame.id), [pastedFrame.x + 30, pastedFrame.y + 20, pastedFrame.childX + 30, pastedFrame.childY + 20]);
  await page.evaluate(id => {
    const e = window.__vooEditor;
    e.selectExactly([id]);
    e.cut();
  }, pastedFrame.id);
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 2, undefined, { timeout: 5000 });
  checks.push("Ctrl+C/Ctrl+V paste selects the complete Frame hierarchy, and cutting it removes that hierarchy");

  await page.evaluate(() => window.__vooEditor.updateFrameNode("current-frame", { x: 110, y: 90 })); await settled();
  assert.deepEqual(await page.evaluate(() => [window.__vooEditor.getNode("current-frame").x, window.__vooEditor.getNode("frame-child").x]), [110, 140]);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 150, y: 130 })), "#ff0000");
  await tool("undo");
  assert.deepEqual(await page.evaluate(() => [window.__vooEditor.getNode("current-frame").x, window.__vooEditor.getNode("frame-child").x]), [80, 110]);
  checks.push("the current Frame mutation moves child pixels together and restores both in one undo");

  const beforeEdit = await camera();
  await page.evaluate(() => window.__vooEditor.updateNode("frame-child", { fill: "#00ff00" })); await settled();
  assert.deepEqual(await camera(), beforeEdit);
  const stateBeforeWelcome = await page.evaluate(() => ({ nodes: window.__vooEditor.getDocument().nodes, selection: window.__vooEditor.getSelectedIds() }));
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().setWelcomeOpen(true));
  const settings = page.getByRole("button", { name: "Generation type", exact: true });
  await settings.focus(); await page.keyboard.press("Space");
  await page.getByRole("dialog", { name: "Generation type", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().setWelcomeOpen(false));
  await page.getByTestId("editor-toolbar").waitFor(); await settled();
  assert.deepEqual(await camera(), beforeEdit);
  assert.deepEqual(await page.evaluate(() => ({ nodes: window.__vooEditor.getDocument().nodes, selection: window.__vooEditor.getSelectedIds() })), stateBeforeWelcome);
  checks.push("style edits do not refit geometry and welcome round trips preserve camera/document/selection without hidden Space capture");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
