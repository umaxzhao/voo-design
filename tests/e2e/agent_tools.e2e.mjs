// Real-app check of agent tools. Usage: start `npx vite --port 5199`, then
// `node tests/e2e/agent_tools.e2e.mjs` (needs `playwright` resolvable).
import { chromium } from "playwright";
const URL = process.env.VOO_URL || "http://localhost:5199/?voo-test=1";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL);
await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  const { runAgentTurn } = await import("/src/canvas/agent/canvas_agent.js");
  const log = [];
  const run = async (name, args) => {
    try { const r = await executeCanvasTool(name, args); log.push([name, "ok", r]); return r; }
    catch (e) { log.push([name, "ERR", e?.code || e?.message]); return null; }
  };
  const id = (r) => r?.id ?? r?.layerId ?? r?.layer?.id ?? r?.componentId ?? r?.instanceId ?? r?.styleId ?? r?.variableId ?? r?.collectionId;
  const rect = await run("create_shape", { kind: "rect", x: 50, y: 50, width: 120, height: 80, fill: "#ff0000", name: "Btn" });
  const comp = await run("create_component", { layerId: id(rect) });
  const inst = await run("create_instance", { componentId: comp?.componentId ?? id(comp), x: 300, y: 50 });
  await run("set_instance_override", { instanceId: inst?.instanceId ?? id(inst), patch: { poster: null } });
  const src = await run("create_shape", { kind: "rect", x: 50, y: 400, width: 40, height: 40, fill: "#ff0000" });
  const style = await run("create_style", { type: "paint", name: "Brand", fromLayerId: id(src) });
  const r2 = await run("create_shape", { kind: "ellipse", x: 50, y: 200, width: 60, height: 60, fill: "#00ff00" });
  await run("apply_style", { layerId: id(r2), type: "paint", styleId: style?.styleId ?? id(style) });
  const coll = await run("create_variable_collection", { name: "Theme" });
  const v = await run("create_variable", { collectionId: coll?.collectionId ?? id(coll), type: "color", name: "primary", valuesByMode: { "mode:default": "#3366ff" } });
  await run("bind_variable", { layerId: id(r2), variableId: v?.variableId ?? id(v), target: "fill" });
  { const n = window.__vooEditor.getDocument().nodes.find((x) => x.id === id(r2)); log.push(["r2-after", "info", { fill: n?.fill, fills: n?.fills, style: n?.style, styleIds: n?.styleIds, bindings: n?.bindings ?? n?.variableBindings, keys: Object.keys(n || {}) }]); }
  const cap = await run("capture_canvas", {});
  if (cap?.dataUrl) log[log.length - 1][2] = { ...cap, dataUrl: cap.dataUrl.slice(0, 40) + "…(" + cap.dataUrl.length + ")" };
  const tree0 = await executeCanvasTool("inspect_layer_tree", {});
  const count = (t) => JSON.stringify(t).match(/"id"/g)?.length ?? 0;
  const before = count(await executeCanvasTool("inspect_layer_tree", {}));
  let step = 0;
  const streamStep = async () => step++ === 0
    ? { text: "", toolCalls: [1, 2, 3].map((i) => ({ id: "c" + i, name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 500 + i * 10, y: 300, width: 20, height: 20 }) })) }
    : { text: "done", toolCalls: [] };
  await runAgentTurn({ config: {}, history: [], userText: "x", tools: [], executeTool: executeCanvasTool, streamStep });
  await new Promise((r) => setTimeout(r, 300));
  const afterTurn = count(await executeCanvasTool("inspect_layer_tree", {}));
  window.__vooEditor.undo();
  await new Promise((r) => setTimeout(r, 300));
  const afterUndo = count(await executeCanvasTool("inspect_layer_tree", {}));
  return { log, tree0: JSON.stringify(tree0).slice(0, 600), undo: { before, afterTurn, afterUndo } };
});
console.log(JSON.stringify(out, null, 1));
console.log("pageerrors", errors);
await browser.close();
const r2 = out.log.find((l) => l[0] === "r2-after")?.[2];
const fails = out.log.filter((l) => l[1] === "ERR");
if (!(r2?.fill === "#3366ff" && r2?.styleIds?.paintId)) fails.push("r2 binding/style missing");
const undoOk = out.undo.afterTurn > out.undo.before && out.undo.afterUndo === out.undo.before;
console.log(fails.length || !undoOk ? "FAIL" : "PASS");
process.exit(fails.length || !undoOk ? 1 : 0);
