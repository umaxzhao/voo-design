// Real-app check of Pencil-style agent tools (plan, frame, align, distribute, find, ungroup, undo).
// Starts an isolated editor automatically; uses no external model service.
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
const out = await page.evaluate(async () => {
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  const log = [];
  const run = async (name, args) => {
    try { const r = await executeCanvasTool(name, args); log.push([name, "ok"]); return r; }
    catch (e) { log.push([name, "ERR", e?.code || e?.message]); return null; }
  };
  const id = (r) => r?.id ?? r?.layerId ?? r?.frameId ?? r?.layer?.id;
  await run("update_plan", { steps: [{ id: "1", title: "frame", status: "in_progress" }, { id: "2", title: "cards", status: "pending" }] });
  const frame = await run("create_frame", { x: 40, y: 40, width: 400, height: 200, name: "Hero", layout: "horizontal", gap: 12, padding: 16 });
  const ids = [];
  for (const x of [600, 650, 820]) ids.push(id(await run("create_shape", { kind: "rect", x, y: 400 + x / 10, width: 30, height: 30, name: "Card" })));
  await run("align_layers", { layerIds: ids, align: "top", relativeTo: "selection" });
  await run("distribute_layers", { layerIds: ids, axis: "horizontal" });
  const nodes = () => window.__vooEditor.getDocument().nodes;
  const ys = ids.map((i) => nodes().find((n) => n.id === i)?.y);
  const found = await run("find_layers", { name: "card" });
  const g = await run("group_layers", { layerIds: ids.slice(0, 2) });
  await run("ungroup_layers", { groupId: g?.groupId ?? id(g) });
  const before = nodes().length;
  await run("create_shape", { kind: "ellipse", x: 0, y: 0, width: 10, height: 10 });
  await run("undo", {});
  const after = nodes().length;
  await run("update_plan", { steps: [{ id: "1", title: "frame", status: "done" }, { id: "2", title: "cards", status: "done" }] });
  return { log, frameId: id(frame), ys, found: found?.layers?.length ?? found?.length, before, after };
});
const failed = out.log.filter((l) => l[1] === "ERR");
const aligned = new Set(out.ys).size === 1;
console.log(JSON.stringify({ ...out, aligned, errors }, null, 2));
assert.deepEqual(failed, []);
assert.ok(aligned && out.frameId);
assert.equal(out.before, out.after);
assert.ok(out.found > 0);
console.log("PASS");

});
