import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

/**
 * beta.3 P2-9: pressing artwork in another Frame must select it on the first
 * press. A canvas press focuses the page without restoring that page's saved
 * camera or refitting the shared view, so the Frame never jumps under the
 * pointer between the press and the engine hit test.
 */
const passed = [];

const frame = (id, x, y, width, height) => ({
  id, name: id, kind: "group", isFrame: true, frame: true,
  x, y, width, height, fill: "#ffffff", visible: true, opacity: 1,
  clipContent: true,
});
const shape = (id, parentId, x, y, fill = "#ff0000") => ({
  id, name: id, kind: "rect", parentId, x, y,
  width: 70, height: 50, fill, visible: true, opacity: 1,
});

await withEditorBrowser(async ({ page }) => {
  const settle = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const guestId = "click-guest-page";
  await page.evaluate(async ({ guestId }) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { createDocument } = await import("/src/canvas/editor/scene_model.js");
    const state = useDesignStore.getState();
    const first = state.editingNodeIds[0];
    const doc = createDocument(900, 600);
    doc.isCanvasRoot = true;
    doc.canvasId = guestId;
    useDesignStore.setState({
      nodes: [...state.nodes, {
        id: guestId, type: "imageEditor", position: { x: 0, y: 0 },
        data: { label: "Guest", canvasType: "design", editorDoc: doc },
      }],
      editingNodeIds: [first, guestId],
      editingNodeId: first,
      editorCamera: { zoom: 1, panX: 120, panY: 120 },
      pendingArtboardFitId: null,
    });
  }, { guestId });
  await page.waitForFunction(id => window.__vooEditors?.[id]?.getDocument().width === 900,
    guestId, { timeout: 30000 });
  // Wait until the decoded page size replaces the placeholder layout.
  let previousRect = null;
  for (let tick = 0; tick < 60; tick += 1) {
    const currentRect = await page.evaluate(({ guestId }) => {
      const board = [...document.querySelectorAll("[data-editor-artboard]")]
        .find(element => element.dataset.nodeId === guestId);
      return board?.getBoundingClientRect().toJSON() ?? null;
    }, { guestId });
    if (previousRect && currentRect &&
      Math.abs(currentRect.x - previousRect.x) < 0.01 &&
      Math.abs(currentRect.y - previousRect.y) < 0.01 &&
      Math.abs(currentRect.width - previousRect.width) < 0.01) break;
    previousRect = currentRect;
    await page.waitForTimeout(100);
  }

  await page.evaluate(async ({ guestId, localNodes, guestNodes }) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const state = useDesignStore.getState();
    const first = state.editingNodeIds.find(id => id !== guestId);
    const host = window.__vooEditors[first];
    const guest = window.__vooEditors[guestId];
    host.cancelPen?.();
    host.setTool("select");
    host.setDoc({ ...host.getDocument(), nodes: localNodes });
    host.selectExactly(["local-child"]);
    guest.cancelPen?.();
    guest.setTool("select");
    guest.setDoc({ ...guest.getDocument(), nodes: guestNodes });
    guest.selectExactly([]);
    useDesignStore.setState({
      editingNodeId: first,
      // A different saved camera for the guest page is exactly what used to
      // jump the artboard away from the pointer on first focus.
      editorCamera: { zoom: 0.5, panX: 120, panY: 120 },
      editorPageCameras: {
        ...state.editorPageCameras,
        [guestId]: { zoom: 2, panX: 0, panY: 0 },
      },
      pendingArtboardFitId: null,
    });
  }, {
    guestId,
    localNodes: [frame("local-frame", 40, 40, 260, 220), shape("local-child", "local-frame", 70, 70)],
    guestNodes: [frame("peer", 40, 40, 300, 280), shape("peer-child", "peer", 70, 70, "#0000ff")],
  });
  await settle();
  const target = await page.evaluate(({ guestId }) => {
    const board = [...document.querySelectorAll("[data-editor-artboard]")]
      .find(element => element.dataset.nodeId === guestId);
    const rect = board.getBoundingClientRect().toJSON();
    const doc = window.__vooEditors[guestId].getDocument();
    return {
      x: rect.left + 100 * rect.width / doc.width,
      y: rect.top + 100 * rect.height / doc.height,
      rect,
    };
  }, { guestId });
  const cameraBefore = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    return useDesignStore.getState().editorCamera;
  });
  await page.mouse.click(target.x, target.y);
  await settle();
  const state = await page.evaluate(async ({ guestId }) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const store = useDesignStore.getState();
    const guest = window.__vooEditors[guestId];
    const board = [...document.querySelectorAll("[data-editor-artboard]")]
      .find(element => element.dataset.nodeId === guestId);
    return {
      camera: store.editorCamera,
      focused: store.editingNodeId,
      selected: guest.getSelectedIds(),
      rect: board.getBoundingClientRect().toJSON(),
    };
  }, { guestId });
  assert.deepEqual(state.selected, ["peer-child"],
    "the first click selects the artwork in the other Frame");
  assert.deepEqual(state.camera, cameraBefore,
    "focusing the other Frame on a canvas press does not restore its saved camera");
  assert.equal(state.focused, guestId,
    "the other Frame becomes the focused page");
  assert.ok(Math.abs(state.rect.x - target.rect.x) < 0.5 &&
    Math.abs(state.rect.y - target.rect.y) < 0.5 &&
    Math.abs(state.rect.width - target.rect.width) < 0.5,
  "the pressed Frame does not jump under the pointer");
  passed.push("Clicking artwork in another Frame selects it on the first press without a camera or layout jump");
});

console.log(JSON.stringify({ passed }, null, 2));
