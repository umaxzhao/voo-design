import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

/**
 * beta.3 P1-2: Frame tool drag must create a Frame, never move the selected
 * Frame/artboard through the Select-only title chrome. The artboard position
 * lives in the layout store, so an accidental title drag is invisible to Undo.
 */
const passed = [];

const frame = (id, x, y, width, height) => ({
  id, name: id, kind: "group", isFrame: true, frame: true,
  x, y, width, height, fill: "#ffffff", visible: true, opacity: 1,
  clipContent: true,
});
const shape = (id, parentId, x, y) => ({
  id, name: id, kind: "rect", parentId, x, y,
  width: 70, height: 50, fill: "#ff0000", visible: true, opacity: 1,
});

await withEditorBrowser(async ({ page }) => {
  const settle = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const toolbarButton = label =>
    page.locator(`[data-testid=editor-toolbar] button[aria-label="${label}"]`);
  const documentState = () => page.evaluate(() => ({
    doc: window.__vooEditor.serialise(),
    index: window.__vooEditor.getCurrentHistoryIndex(),
    selected: window.__vooEditor.getSelectedIds(),
  }));
  const layoutState = () => page.evaluate(async () =>
    JSON.stringify((await import("/src/store/design_store.js"))
      .useDesignStore.getState().editorArtboardLayouts));
  const readNodes = () => page.evaluate(() => {
    const doc = window.__vooEditor.getDocument();
    return doc.nodes.map(node => ({
      id: node.id, name: node.name, x: node.x, y: node.y,
      width: node.width, height: node.height, parentId: node.parentId,
    }));
  });
  const docPoint = (screenPoint) => page.evaluate(async (screenPoint) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const camera = useDesignStore.getState().editorCamera;
    const stage = document.querySelector('[data-testid="editor-pages"]')
      .getBoundingClientRect();
    return {
      x: (screenPoint.x - stage.left - camera.panX) / camera.zoom,
      y: (screenPoint.y - stage.top - camera.panY) / camera.zoom,
    };
  }, screenPoint);

  await page.evaluate(async ({ nodes }) => {
    const e = window.__vooEditor;
    const { useDesignStore } = await import("/src/store/design_store.js");
    e.cancelSelectionTransform();
    e.setTool("select");
    e.setDoc({
      ...e.getDocument(), width: 900, height: 600, crop: null,
      isCanvasRoot: false, backgroundColor: "transparent", nodes,
    });
    e.selectExactly(["root"]);
    if (e.getSnappingEnabled()) e.toggleSnapping();
    useDesignStore.setState({
      editorCamera: { zoom: 1, panX: 120, panY: 120 },
      pendingArtboardFitId: null,
    });
  }, { nodes: [frame("root", 0, 0, 900, 600), shape("root-child", "root", 140, 120)] });
  await settle();

  // --- Same page: the Select-only title bar must not become a Frame-tool drag.
  const rootBefore = await documentState();
  const layoutBefore = await layoutState();
  await toolbarButton("Frame").click();
  await settle();
  const title = page.getByTestId("editor-page-title");
  const titleBox = await title.boundingBox();
  assert.ok(titleBox, "the root Frame has a visible title bar");
  assert.equal(await title.evaluate(element => getComputedStyle(element).pointerEvents), "none",
    "a drawing tool makes the title bar transparent to the canvas");
  const start = { x: titleBox.x + 60, y: titleBox.y + titleBox.height / 2 };
  const end = { x: start.x + 120, y: start.y + 70 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await settle();
  const afterTitleDrag = await documentState();
  const titleNodes = await readNodes();
  assert.equal(titleNodes.length, 3, "the title drag creates a new Frame");
  const rootAfter = titleNodes.find(node => node.id === "root");
  assert.deepEqual([rootAfter.x, rootAfter.y, rootAfter.width, rootAfter.height],
    [0, 0, 900, 600], "the selected root Frame does not move");
  assert.equal(await layoutState(), layoutBefore,
    "the artboard layout is not changed by a Frame-tool drag");
  assert.equal(afterTitleDrag.index, rootBefore.index + 1,
    "the new Frame is one history entry");
  const createdTitleFrame = titleNodes.find(node => node.id !== "root" && node.id !== "root-child");
  assert.ok(createdTitleFrame, "the new Frame is identifiable");
  const titleCreatedStart = await docPoint(start);
  assert.ok(Math.abs(createdTitleFrame.x - titleCreatedStart.x) < 8 &&
    Math.abs(createdTitleFrame.y - titleCreatedStart.y) < 8,
  "the new Frame starts at the press point");

  await page.evaluate(() => window.__vooEditor.undo());
  await settle();
  assert.deepEqual((await documentState()).doc, rootBefore.doc,
    "one undo removes only the new Frame");
  await page.evaluate(() => window.__vooEditor.redo());
  await settle();
  assert.deepEqual((await documentState()).doc, afterTitleDrag.doc,
    "redo restores the new Frame");
  await page.evaluate(() => window.__vooEditor.undo());
  await settle();
  passed.push("Frame tool over the selected root Frame title draws a new Frame, leaves layout/geometry untouched and undoes/redoes once");

  // --- Same page: a blank surface drag keeps the selected Frame in place.
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const e = window.__vooEditor;
    e.setTool("select"); e.selectExactly(["root"]);
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 120, panY: 120 }, pendingArtboardFitId: null });
  });
  await settle();
  const beforeBody = await documentState();
  const layoutBeforeBody = await layoutState();
  await toolbarButton("Frame").click();
  await settle();
  const board = await page.locator("[data-editor-artboard]").boundingBox();
  const bodyStart = { x: board.x + board.width * 0.7, y: board.y + board.height * 0.7 };
  await page.mouse.move(bodyStart.x, bodyStart.y);
  await page.mouse.down();
  await page.mouse.move(bodyStart.x + 90, bodyStart.y + 55, { steps: 10 });
  await page.mouse.up();
  await settle();
  const afterBodyNodes = await readNodes();
  assert.equal(afterBodyNodes.length, 3, "the blank-surface drag creates a new Frame");
  assert.deepEqual(
    [afterBodyNodes.find(node => node.id === "root").x, afterBodyNodes.find(node => node.id === "root").y],
    [0, 0],
    "the selected root Frame stays at its origin",
  );
  assert.equal(await layoutState(), layoutBeforeBody,
    "the artboard does not move while the new Frame is drawn");
  await page.evaluate(() => window.__vooEditor.undo());
  await settle();
  assert.deepEqual((await documentState()).doc, beforeBody.doc,
    "one undo removes the new Frame and keeps the selected Frame");
  passed.push("Frame tool on a blank Frame surface creates a Frame without moving the selected root or the artboard");

  // --- Cross page: the tool chosen on the focused page owns the next page's drag.
  const secondId = "frame-tool-second-page";
  await page.evaluate(async ({ secondId }) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { createDocument } = await import("/src/canvas/editor/scene_model.js");
    const state = useDesignStore.getState();
    const first = state.editingNodeIds[0];
    const doc = createDocument(900, 600);
    doc.isCanvasRoot = true;
    doc.canvasId = secondId;
    useDesignStore.setState({
      nodes: [...state.nodes, {
        id: secondId, type: "imageEditor", position: { x: 0, y: 0 },
        data: { label: "Second", canvasType: "design", editorDoc: doc },
      }],
      editingNodeIds: [first, secondId],
      editingNodeId: first,
      editorCamera: { zoom: 1, panX: 120, panY: 120 },
      pendingArtboardFitId: null,
    });
  }, { secondId });
  await page.waitForFunction(id => window.__vooEditors?.[id]?.getDocument().width === 900,
    secondId, { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.evaluate(({ secondId }) => {
    const engine = window.__vooEditors[secondId];
    engine.setTool("select");
    engine.setDoc({
      ...engine.getDocument(),
      nodes: [
        { id: "peer-frame", name: "peer-frame", kind: "group", isFrame: true, frame: true,
          x: 40, y: 40, width: 300, height: 280, fill: "#ffffff", visible: true, opacity: 1, clipContent: true },
        { id: "peer-child", name: "peer-child", kind: "rect", parentId: "peer-frame",
          x: 80, y: 80, width: 70, height: 50, fill: "#00ff00", visible: true, opacity: 1 },
      ],
    });
    engine.selectExactly(["peer-frame"]);
  }, { secondId });
  await settle();
  await toolbarButton("Frame").click();
  await settle();
  const layoutBeforePeer = await layoutState();
  const peerClient = await page.evaluate(({ secondId }) => {
    const board = [...document.querySelectorAll("[data-editor-artboard]")]
      .find(element => element.dataset.nodeId === secondId);
    const rect = board.getBoundingClientRect();
    const doc = window.__vooEditors[secondId].getDocument();
    return {
      x: rect.left + 600 * rect.width / doc.width,
      y: rect.top + 420 * rect.height / doc.height,
    };
  }, { secondId });
  await page.mouse.move(peerClient.x, peerClient.y);
  await page.mouse.down();
  await page.mouse.move(peerClient.x + 80, peerClient.y + 50, { steps: 10 });
  await page.mouse.up();
  await settle();
  const peerState = await page.evaluate(({ secondId }) => {
    const engine = window.__vooEditors[secondId];
    return {
      tool: engine.getTool(),
      selected: engine.getSelectedIds(),
      nodes: engine.getDocument().nodes.map(node => ({
        id: node.id, x: node.x, y: node.y, parentId: node.parentId,
      })),
    };
  }, { secondId });
  assert.equal(peerState.tool, "frame",
    "the pressed page receives the tool chosen in the shared toolbar");
  assert.equal(peerState.nodes.length, 3, "the drag creates a Frame in the pressed page");
  const peerFrame = peerState.nodes.find(node => node.id === "peer-frame");
  assert.deepEqual([peerFrame.x, peerFrame.y], [40, 40],
    "the selected Frame in the pressed page does not move");
  assert.equal(await layoutState(), layoutBeforePeer,
    "the pressed page's artboard does not move");
  assert.deepEqual(peerState.selected, [peerState.nodes.find(node =>
    node.id !== "peer-frame" && node.id !== "peer-child").id]);
  await page.evaluate(({ secondId }) => window.__vooEditors[secondId].undo(), { secondId });
  await settle();
  assert.equal(await page.evaluate(({ secondId }) =>
    window.__vooEditors[secondId].getDocument().nodes.length, { secondId }), 2,
  "one undo removes the cross-page Frame");
  passed.push("Frame tool on another page draws there, preserves its selected Frame/artboard and undoes once");
});

console.log(JSON.stringify({ passed }, null, 2));
