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
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const out = await page.evaluate(async (PNG) => {
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  const { runAgentTurn } = await import("/src/canvas/agent/canvas_agent.js");
  const log = [];
  const run = async (name, args) => {
    try { const r = await executeCanvasTool(name, args); log.push([name, "ok", r]); return r; }
    catch (e) { log.push([name, "ERR", e?.code || e?.message]); return null; }
  };
  const id = (r) => r?.id ?? r?.layerId ?? r?.layer?.id ?? r?.componentId ?? r?.instanceId ?? r?.styleId ?? r?.variableId ?? r?.collectionId ?? r?.groupId ?? r?.modeId;
  const rect = await run("create_shape", { kind: "rect", x: 50, y: 50, width: 120, height: 80, fill: "#ff0000", name: "Btn" });
  const comp = await run("create_component", { layerId: id(rect) });
  const inst = await run("create_instance", { componentId: comp?.componentId ?? id(comp), x: 300, y: 50 });
  await run("set_instance_override", { instanceId: id(inst), patch: { poster: null } });
  const src = await run("create_shape", { kind: "rect", x: 50, y: 400, width: 40, height: 40, fill: "#ff0000" });
  const extra = await run("create_shape", { kind: "rect", x: 60, y: 410, width: 30, height: 30, fill: "#00ff00", name: "Extra" });
  const comp2 = await run("create_component", { layerId: id(extra) });
  await run("reset_instance_overrides", { instanceId: id(inst) });
  await run("swap_instance", { instanceId: id(inst), componentId: comp2?.componentId ?? id(comp2) });
  const style = await run("create_style", { type: "paint", name: "Brand", fromLayerId: id(src) });
  const r2 = await run("create_shape", { kind: "ellipse", x: 50, y: 200, width: 60, height: 60, fill: "#00ff00" });
  await run("apply_style", { layerId: id(r2), type: "paint", styleId: style?.styleId ?? id(style) });
  const coll = await run("create_variable_collection", { name: "Theme" });
  const v = await run("create_variable", { collectionId: coll?.collectionId ?? id(coll), type: "color", name: "primary", valuesByMode: { "mode:default": "#3366ff" } });
  const mode = await run("add_variable_mode", { collectionId: coll?.collectionId ?? id(coll), name: "Dark" });
  await run("set_active_mode", { collectionId: coll?.collectionId ?? id(coll), modeId: mode?.modeId });
  await run("bind_variable", { layerId: id(r2), variableId: v?.variableId ?? id(v), target: "fill" });
  { const n = window.__vooEditor.getDocument().nodes.find((x) => x.id === id(r2)); log.push(["r2-after", "info", { fill: n?.fill, fills: n?.fills, style: n?.style, styleIds: n?.styleIds, bindings: n?.bindings ?? n?.variableBindings, keys: Object.keys(n || {}) }]); }
  const path = await run("create_path", { d: "M 0 0 L 100 40 C 40 90, 30 20, 10 10 Z", x: 10, y: 10, fill: "#ff8800", name: "Swirl" });
  await run("get_path_nodes", { layerId: id(path) });
  await run("edit_path_nodes", { layerId: id(path), ops: [{ op: "move", index: 0, x: 5, y: 6 }] });
  const img = await run("place_image", { url: PNG, x: 10, y: 10, width: 50, height: 50, name: "Hero image" });
  const txt = await run("create_shape", { kind: "text", x: 0, y: 300, width: 120, height: 30, text: "Hello world", fill: "#000000" });
  await run("set_text_range_style", { layerId: id(txt), start: 0, end: 5, style: { fontWeight: "bold" } });
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

  // cancelled turn
  const beforeC = count(await executeCanvasTool("inspect_layer_tree", {}));
  let stepC = 0;
  const controller = new AbortController();
  const streamCancel = async () => {
    stepC++;
    if (stepC === 1) return { text: "", toolCalls: [{ id: "cx", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 700, y: 300, width: 20, height: 20 }) }] };
    return { text: "done", toolCalls: [] };
  };
  const execCancel = async (name, args) => { const r = await executeCanvasTool(name, args); controller.abort(); return r; };
  try { await runAgentTurn({ config: {}, history: [], userText: "x", tools: [], executeTool: execCancel, streamStep: streamCancel, signal: controller.signal }); } catch (e) {}
  await new Promise((r) => setTimeout(r, 300));
  const afterCancelTurn = count(await executeCanvasTool("inspect_layer_tree", {}));
  window.__vooEditor.undo();
  await new Promise((r) => setTimeout(r, 300));
  const afterCancelUndo = count(await executeCanvasTool("inspect_layer_tree", {}));

  // failed turn
  const beforeF = count(await executeCanvasTool("inspect_layer_tree", {}));
  let stepF = 0;
  const streamFail = async () => {
    stepF++;
    if (stepF === 1) return { text: "", toolCalls: [{ id: "cf", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 720, y: 300, width: 20, height: 20 }) }] };
    throw new Error("Network error");
  };
  try { await runAgentTurn({ config: {}, history: [], userText: "x", tools: [], executeTool: executeCanvasTool, streamStep: streamFail }); } catch (e) {}
  await new Promise((r) => setTimeout(r, 300));
  const afterFailTurn = count(await executeCanvasTool("inspect_layer_tree", {}));
  window.__vooEditor.undo();
  await new Promise((r) => setTimeout(r, 300));
  const afterFailUndo = count(await executeCanvasTool("inspect_layer_tree", {}));

  return { log, tree0: JSON.stringify(tree0).slice(0, 600), undo: { before, afterTurn, afterUndo, beforeC, afterCancelTurn, afterCancelUndo, beforeF, afterFailTurn, afterFailUndo } };
}, PNG);
console.log(JSON.stringify(out, null, 1));
console.log("pageerrors", errors);
await browser.close();
const r2 = out.log.find((l) => l[0] === "r2-after")?.[2];
const fails = out.log.filter((l) => l[1] === "ERR");
if (!(r2?.fill === "#3366ff" && r2?.styleIds?.paintId)) fails.push("r2 binding/style missing");
const undoOk = out.undo.afterTurn > out.undo.before && out.undo.afterUndo === out.undo.before;
const cancelUndoOk = out.undo.afterCancelTurn > out.undo.beforeC && out.undo.afterCancelUndo === out.undo.beforeC;
const failUndoOk = out.undo.afterFailTurn > out.undo.beforeF && out.undo.afterFailUndo === out.undo.beforeF;
if (!undoOk) fails.push("success undo failed");
if (!cancelUndoOk) fails.push("cancel undo failed");
if (!failUndoOk) fails.push("fail undo failed");
console.log(fails.length ? "FAIL" : "PASS");
process.exit(fails.length ? 1 : 0);
