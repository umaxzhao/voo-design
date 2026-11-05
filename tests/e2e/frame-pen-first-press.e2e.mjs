import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

/**
 * beta.3 P2-8: the first pen press owns the gesture even when it lands on an
 * existing Frame's Select-only name label, and the shared tool follows the
 * press onto another Frame/page instead of letting that page's stale Select
 * mode consume it.
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
  const secondId = "pen-guest-page";
  const pageState = nodeId => page.evaluate(async (nodeId) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const store = useDesignStore.getState();
    const engine = window.__vooEditors[nodeId ?? store.editingNodeId];
    return {
      tool: engine?.getTool(),
      selected: engine?.getSelectedIds(),
      nodes: engine?.getDocument().nodes.map(node => ({
        id: node.id, x: node.x, y: node.y,
      })),
      anchors: engine?.getPenDraft()?.anchors?.map(anchor => ({
        x: anchor.x, y: anchor.y,
      })) ?? null,
    };
  }, nodeId);
  const clientOn = (nodeId, point) => page.evaluate(({ nodeId, point }) => {
    const board = [...document.querySelectorAll("[data-editor-artboard]")]
      .find(element => element.dataset.nodeId === nodeId);
    const rect = board.getBoundingClientRect();
    const doc = window.__vooEditors[nodeId].getDocument();
    return {
      x: rect.left + point.x * rect.width / doc.width,
      y: rect.top + point.y * rect.height / doc.height,
    };
  }, { nodeId, point });

  // Focused page: the Frame name label must not swallow the first pen press.
  await page.evaluate(async ({ nodes }) => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const engine = window.__vooEditor;
    engine.cancelPen?.();
    engine.cancelSelectionTransform();
    engine.setTool("select");
    engine.setDoc({
      ...engine.getDocument(), width: 900, height: 600, crop: null,
      isCanvasRoot: true, backgroundColor: "transparent", nodes,
    });
    engine.selectExactly(["host"]);
    if (engine.getSnappingEnabled()) engine.toggleSnapping();
    useDesignStore.setState({
      editorCamera: { zoom: 1, panX: 120, panY: 120 },
      pendingArtboardFitId: null,
    });
  }, { nodes: [frame("host", 100, 100, 400, 300), shape("host-child", "host", 150, 150)] });
  await settle();
  await toolbarButton("Pen").click();
  await settle();
  const label = page.locator('[data-testid="editor-canvas-frame-label"][data-frame-id="host"]');
  const labelBox = await label.boundingBox();
  assert.ok(labelBox, "the nested Frame has a visible name label");
  const expectedAnchor = await page.evaluate(({ x, y }) =>
    window.__vooEditor.toDocPoint(x, y), {
    x: labelBox.x + labelBox.width / 2,
    y: labelBox.y + labelBox.height / 2,
  });
  await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await settle();
  const penOverLabel = await pageState();
  assert.equal(penOverLabel.tool, "pen");
  assert.equal(penOverLabel.anchors?.length, 1,
    "the pen's first press places exactly one anchor over the Frame label");
  assert.ok(Math.abs(penOverLabel.anchors[0].x - expectedAnchor.x) < 2 &&
    Math.abs(penOverLabel.anchors[0].y - expectedAnchor.y) < 2,
  `the anchor lands under the pointer: ${JSON.stringify({ expectedAnchor, anchors: penOverLabel.anchors })}`);
  const host = penOverLabel.nodes.find(node => node.id === "host");
  assert.deepEqual([host.x, host.y], [100, 100], "the Frame does not move");
  passed.push("Pen over an existing Frame's name label places the first anchor instead of selecting that Frame");

  // Add another page while the toolbar remains the shared source of truth.
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
        data: { label: "Guest", canvasType: "design", editorDoc: doc },
      }],
      editingNodeIds: [first, secondId],
      editingNodeId: first,
      editorCamera: { zoom: 1, panX: 120, panY: 120 },
      pendingArtboardFitId: null,
    });
  }, { secondId });
  await page.waitForFunction(id => window.__vooEditors?.[id]?.getDocument().width === 900,
    secondId, { timeout: 30000 });
  // Wait for the decoded page size to replace the placeholder layout.
  let previousRect = null;
  for (let tick = 0; tick < 60; tick += 1) {
    const currentRect = await page.evaluate(({ secondId }) => {
      const board = [...document.querySelectorAll("[data-editor-artboard]")]
        .find(element => element.dataset.nodeId === secondId);
      return board?.getBoundingClientRect().toJSON() ?? null;
    }, { secondId });
    if (previousRect && currentRect &&
      Math.abs(currentRect.x - previousRect.x) < 0.01 &&
      Math.abs(currentRect.y - previousRect.y) < 0.01 &&
      Math.abs(currentRect.width - previousRect.width) < 0.01) break;
    previousRect = currentRect;
    await page.waitForTimeout(100);
  }
  await page.evaluate(({ secondId, nodes }) => {
    const engine = window.__vooEditors[secondId];
    engine.cancelPen?.();
    engine.setTool("select");
    engine.setDoc({ ...engine.getDocument(), nodes });
    engine.selectExactly(["peer"]);
  }, { secondId, nodes: [frame("peer", 40, 40, 300, 280), shape("peer-child", "peer", 70, 70)] });
  await settle();

  // The guest page receives the pen tool on the press itself.
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const state = useDesignStore.getState();
    const first = state.editingNodeIds[0];
    state.focusEditorPage(first, { preserveCamera: true });
    const host = window.__vooEditors[first];
    host.cancelPen?.();
    host.setTool("pen");
  });
  await page.locator('[data-testid=editor-toolbar] button[aria-label="Pen"]').click();
  await settle();
  const guestPoint = await clientOn(secondId, { x: 600, y: 450 });
  await page.mouse.click(guestPoint.x, guestPoint.y);
  await settle();
  const guestPen = await pageState(secondId);
  assert.equal(guestPen.tool, "pen",
    "the guest page receives the shared pen tool before its first press");
  assert.equal(guestPen.anchors?.length, 1,
    "the first press on another Frame places the first anchor");
  assert.ok(Math.abs(guestPen.anchors[0].x - 600) < 2 &&
    Math.abs(guestPen.anchors[0].y - 450) < 2,
  `the guest anchor uses the pressed page's coordinates: ${JSON.stringify(guestPen.anchors)}`);
  assert.deepEqual(guestPen.selected, ["peer"],
    "placing the anchor does not replace the guest Frame selection");
  passed.push("Pen on another Frame's blank surface starts there with one correctly placed first anchor");
});

console.log(JSON.stringify({ passed }, null, 2));
