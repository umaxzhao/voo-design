import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Real UI path: select two pen paths, right-click the artboard, choose "Join Paths".
// The first path is rotated 90° about its centre; the second starts where the first ends in document space.
await withEditorBrowser(async ({ page, tool, errors }) => {
  await page.evaluate(async () => {
    const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    const base = (id, x, y, rotation) => ({
      id, kind: "path", pen: true, x, y, rotation, width: 100, height: 10,
      baseWidth: 100, baseHeight: 10, stroke: "#000000", strokeWidth: 1, fill: null,
      points: [{ x: 0, y: 0, out: [30, 0] }, { x: 100, y: 0, in: [-30, 0] }],
    });
    const first = base("pen-a", 0, 0, 90);
    const end = fromNodeLocal(first, { x: 100, y: 0 });
    const second = base("pen-b", end.x, end.y, 0);
    e.setTool("select");
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, nodes: [first, second] });
    e.selectExactly(["pen-a", "pen-b"]);
  });
  const snapshot = () => page.evaluate(() => window.__vooEditor.getDocument().nodes);
  // Document-space anchors through the same transform the renderer uses.
  const anchorsOf = (node) => page.evaluate(async (node) => {
    const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry.js");
    const sx = node.width / node.baseWidth;
    const sy = node.height / node.baseHeight;
    return node.points.map((p) => fromNodeLocal(node, { x: p.x * sx, y: p.y * sy }));
  }, node);
  const client = (point) => page.evaluate(async (point) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + (point.x * rect.width) / doc.width, y: rect.top + (point.y * rect.height) / doc.height };
  }, point);

  const before = await snapshot();
  const originalAnchors = [...(await anchorsOf(before[0])), ...(await anchorsOf(before[1]))];
  const mid = originalAnchors.reduce((acc, p) => ({ x: acc.x + p.x / originalAnchors.length, y: acc.y + p.y / originalAnchors.length }), { x: 0, y: 0 });
  const spot = await client(mid);
  await page.mouse.click(spot.x, spot.y, { button: "right" });
  // "Join Paths" sits under the context menu's Path submenu.
  await page.getByRole("menuitem", { name: /^(Path)$/ }).first().hover();
  await page.getByText(/^(Join Paths|合并路径)$/).first().click();

  const joined = await snapshot();
  assert.equal(joined.length, 1, "Join replaces both paths with one node");
  assert.equal(joined[0].kind, "path");
  const joinedAnchors = await anchorsOf(joined[0]);
  for (const anchor of originalAnchors) {
    const hit = joinedAnchors.some((p) => Math.abs(p.x - anchor.x) < 1e-6 && Math.abs(p.y - anchor.y) < 1e-6);
    assert.ok(hit, `anchor (${anchor.x}, ${anchor.y}) must keep its document position after join`);
  }
  assert.equal(joined[0].rotation, 90, "Joined node keeps the first path's rotation");

  await tool("undo");
  assert.deepEqual(await snapshot(), before, "One undo restores both paths exactly");
  await tool("redo");
  assert.deepEqual(await snapshot(), joined, "One redo restores the joined path exactly");
  assert.deepEqual(errors, [], "No page errors during join, undo, redo");
}, { openDocument: true, mcpLink: true });
console.log("pen_join_rotation.e2e: passed");
