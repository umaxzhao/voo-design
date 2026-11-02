import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Local copies: this copy (ab87ef7) predates the shared authored-frame fixture.
const settled = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const settlePanels = (page) => settled(page);
const createAuthoredFrame = (page) => page.evaluate(async () => {
  const editor = window.__vooEditor;
  const doc = editor.getDocument();
  const { createGroupNode } = await import("/src/canvas/editor/scene_model.js");
  const frame = { ...createGroupNode({ x: 0, y: 0, width: doc.width, height: doc.height }),
    isFrame: true, frame: true, containerType: "frame", name: "Authored Frame", fill: "#171717", clipContent: true };
  editor.setDoc({ ...doc, nodes: [frame] });
  return frame.id;
});

// UF13 real-UI regression: join two open pen paths through the canvas context menu
// ("Join Paths") and check that every joined anchor keeps its input world position.
// Covers rotation, shear with horizontal flip, and paths inside a parent Frame.
// Undo and Redo are each run once. Save and cold reopen are NOT covered here.

const CASES = [
  {
    name: "rotated-touching",
    parent: false,
    a: { id: "pa", x: 100, y: 100, width: 80, height: 40, rotation: 30, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 300, y: 120, width: 60, height: 60, rotation: -45, points: [[0, 0], [60, 0]], touchA: true },
  },
  {
    name: "shear-flip-apart",
    parent: false,
    a: { id: "pa", x: 50, y: 50, width: 100, height: 20, flipH: true, shear: 20, points: [[0, 0], [100, 20]] },
    b: { id: "pb", x: 300, y: 200, width: 40, height: 40, points: [[0, 0], [40, 40]] },
  },
  {
    name: "rotated-inside-frame",
    parent: true,
    a: { id: "pa", x: 60, y: 60, width: 80, height: 40, rotation: 15, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 200, y: 160, width: 60, height: 60, rotation: -20, points: [[0, 0], [60, 0]], touchA: true },
  },
];

// Mirrors the anchor contract in src/canvas/editor/pen_join_world.js (scale, flip, shear, rotate).
const worldPointFn = `(node, anchor) => {
  const sx = node.baseWidth ? node.width / node.baseWidth : 1;
  const sy = node.baseHeight ? node.height / node.baseHeight : 1;
  const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
  let x = node.x + anchor.x * sx, y = node.y + anchor.y * sy;
  if (node.flipH) x = 2 * cx - x;
  if (node.flipV) y = 2 * cy - y;
  if (node.shear) x += Math.tan((node.shear * Math.PI) / 180) * (y - cy);
  if (node.rotation) {
    const r = (node.rotation * Math.PI) / 180, dx = x - cx, dy = y - cy;
    x = cx + dx * Math.cos(r) - dy * Math.sin(r);
    y = cy + dx * Math.sin(r) + dy * Math.cos(r);
  }
  return { x, y };
}`;

const pathNode = (spec, parentId) => ({
  id: spec.id, kind: "path", name: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height,
  baseWidth: spec.width, baseHeight: spec.height, rotation: spec.rotation ?? 0, shear: spec.shear ?? 0,
  flipH: spec.flipH ?? false, flipV: false, visible: true, parentId: parentId ?? null,
  points: spec.points.map(([x, y]) => ({ x, y, in: null, out: null, close: false })),
});

await withEditorBrowser(async ({ page, errors }) => {
  const results = [];
  for (const spec of CASES) {
    await page.evaluate(() => {
      const editor = window.__vooEditor;
      editor.setDoc({ ...editor.getDocument(), nodes: [], modifiers: [] });
    });
    const frameId = await createAuthoredFrame(page);
    const parentId = spec.parent ? frameId : null;
    await page.evaluate(({ worldPointSource, a, b, parentId }) => {
      const worldPoint = eval(worldPointSource);
      const editor = window.__vooEditor;
      const doc = editor.getDocument();
      const build = (spec) => ({
        id: spec.id, kind: "path", name: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height,
        baseWidth: spec.width, baseHeight: spec.height, rotation: spec.rotation ?? 0, shear: spec.shear ?? 0,
        flipH: spec.flipH ?? false, flipV: false, visible: true, parentId,
        points: spec.points.map(([x, y]) => ({ x, y, in: null, out: null, close: false })),
      });
      const first = build(a);
      let secondSpec = { ...b };
      if (b.touchA) {
        // Move b so its start meets a's end in world space, so the join welds.
        const endA = worldPoint(first, first.points[first.points.length - 1]);
        const startB = worldPoint(build(b), build(b).points[0]);
        secondSpec = { ...b, x: b.x + (endA.x - startB.x), y: b.y + (endA.y - startB.y) };
      }
      const second = build(secondSpec);
      editor.setDoc({ ...doc, nodes: [...doc.nodes, first, second] });
      editor.selectExactly([first.id, second.id]);
      editor.setTool("select");
    }, { worldPointSource: worldPointFn, a: spec.a, b: spec.b, parentId });
    await settlePanels(page);

    const before = await page.evaluate(({ worldPointSource, ids }) => {
      const worldPoint = eval(worldPointSource);
      const nodes = window.__vooEditor.getDocument().nodes.filter((n) => ids.includes(n.id));
      return nodes.flatMap((n) => n.points.map((p) => worldPoint(n, p)));
    }, { worldPointSource: worldPointFn, ids: [spec.a.id, spec.b.id] });

    // Right-click the first path's world centre; the canvas context menu must offer "Join Paths".
    const screen = await page.evaluate((id) => {
      const editor = window.__vooEditor;
      const node = editor.getDocument().nodes.find((n) => n.id === id);
      const view = editor.getViewport();
      const canvas = [...document.querySelectorAll('[data-testid="design-editor"] canvas')]
        .map((el) => el.getBoundingClientRect())
        .sort((p, q) => q.width * q.height - p.width * p.height)[0];
      return { x: canvas.left + (node.x + node.width / 2) * view.zoom + view.panX, y: canvas.top + (node.y + node.height / 2) * view.zoom + view.panY };
    }, spec.a.id);
    await page.mouse.click(screen.x, screen.y, { button: "right" });
    // "Join Paths" lives in the context menu's "Path" submenu, so open that first.
    await page.getByRole("menuitem", { name: /^(Path|路径)/ }).first().click();
    const join = page.getByRole("menuitem", { name: /Join Paths|合并路径/ });
    await join.waitFor({ timeout: 5000 });
    await join.click();
    await settlePanels(page);

    const after = await page.evaluate(({ worldPointSource }) => {
      const worldPoint = eval(worldPointSource);
      const nodes = window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "path");
      return nodes.map((n) => ({ id: n.id, rotation: n.rotation ?? 0, flipH: n.flipH ?? false, shear: n.shear ?? 0, points: n.points.map((p) => worldPoint(n, p)) }));
    }, { worldPointSource: worldPointFn });
    assert.equal(after.length, 1, `${spec.name}: join must leave one path`);
    const joined = after[0];
    assert.equal(joined.rotation, 0, `${spec.name}: joined node must be unrotated`);
    assert.equal(joined.flipH, false, `${spec.name}: joined node must not be flipped`);
    const drift = joined.points.map((p) => Math.min(...before.map((q) => Math.hypot(q.x - p.x, q.y - p.y))));
    const maxDrift = Math.max(...drift);
    assert.ok(maxDrift < 1e-3, `${spec.name}: anchor drift ${maxDrift}`);

    await page.keyboard.press("ControlOrMeta+Z");
    await settled(page);
    const undone = await page.evaluate(() => window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "path").length);
    assert.equal(undone, 2, `${spec.name}: one Undo restores both paths`);
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await settled(page);
    const redone = await page.evaluate(() => window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "path").length);
    assert.equal(redone, 1, `${spec.name}: one Redo re-applies the join`);
    results.push({ case: spec.name, maxDrift, anchors: joined.points.length, undo: undone, redo: redone });
  }
  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(JSON.stringify(results));
}, { openDocument: true, mcpLink: true });
