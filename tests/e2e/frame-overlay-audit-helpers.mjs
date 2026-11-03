import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
export async function bindObserver(page) {
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    window.__frameOverlayAuditStore = useDesignStore;
    window.__frameOverlayInputs = [];
    for (const type of ["pointerdown", "pointerup", "keydown", "wheel"]) document.addEventListener(type, event => {
      window.__frameOverlayInputs.push({ type, x: event.clientX, y: event.clientY, key: event.key,
        ctrlKey: event.ctrlKey, altKey: event.altKey, trusted: event.isTrusted,
        target: event.target.closest?.("[data-testid]")?.getAttribute("data-testid") });
    }, true);
  });
}
export const observe = page => page.evaluate(async () => {
  const { nodeCorners, nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
  const state = window.__frameOverlayAuditStore.getState(), id = state.editingNodeId;
  const engine = window.__vooEditors?.[id] ?? window.__vooEditor;
  if (!engine) throw new Error("Focused editor must exist");
  const doc = engine.getDocument();
  const board = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`);
  const box = board.getBoundingClientRect();
  const project = point => ({ x: box.left + point.x * box.width / doc.width, y: box.top + point.y * box.height / doc.height });
  const frames = doc.nodes.filter(node => node.isFrame || node.frame === true).map(node => {
    const label = document.querySelector(`[data-frame-id="${node.id}"]`);
    const r = label?.getBoundingClientRect();
    return { node, corners: nodeCorners(node).map(project), aabb: nodeAABB(node), origin: project(node),
      label: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null };
  });
  const chrome = document.querySelector('[data-testid="workspace-chrome-canvas"]');
  return { id, doc, selected: engine.getSelectedIds(), history: engine.getCurrentHistoryIndex(), frames,
    camera: state.editorCamera, viewport: engine.getViewport(), layouts: state.editorArtboardLayouts,
    board: { x: box.x, y: box.y, width: box.width, height: box.height },
    chrome: { width: chrome.width, height: chrome.height },
    inputs: window.__frameOverlayInputs.splice(0) };
});
export async function drag(page, start, delta, modifiers = []) {
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 12 }); await page.mouse.up();
  for (const key of modifiers.reverse()) await page.keyboard.up(key);
  await page.mouse.move(15, 300); await settle(page);
}
export async function dragLabel(page, id, delta) {
  const label = page.locator(`[data-testid="editor-canvas-frame-label"][data-frame-id="${id}"]`);
  const box = await label.boundingBox(); assert.ok(box, "Frame label is a real mouse target");
  const start = { x: box.x + 25, y: box.y + box.height / 2 };
  await drag(page, start, delta); return { start, delta };
}
export function project(state, point) {
  return { x: state.board.x + point.x * state.board.width / state.doc.width,
    y: state.board.y + point.y * state.board.height / state.doc.height };
}
const green = ([r, g, b, a]) => a > 0 && g > r + 12 && g > b + 8;
/** All acceptance pixels come from the composited browser screenshot. */
export async function capture(page, out, phase, state) {
  const points = [];
  for (let x = 30; x < state.doc.width - 20; x += 45) points.push({ kind: "reference", ...project(state, { x, y: 0 }) });
  for (const frame of state.frames.filter(frame => state.selected.includes(frame.node.id))) {
    for (let i = 0; i < 4; i++) {
      const a = frame.corners[i], b = frame.corners[(i + 1) % 4];
      points.push({ kind: "selection", frameId: frame.node.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
  const visible = await page.evaluate(points => {
    const panels = ["editor-properties-panel", "editor-layer-panel", "editor-tool-bar"].flatMap(id => [...document.querySelectorAll(`[data-testid="${id}"]`)]).map(el => el.getBoundingClientRect());
    return points.filter(p => p.x > 12 && p.x < innerWidth - 12 && p.y > 150 && p.y < innerHeight - 85 &&
      !panels.some(r => p.x >= r.left - 5 && p.x <= r.right + 5 && p.y >= r.top - 5 && p.y <= r.bottom + 5));
  }, points);
  const bytes = await page.screenshot({ path: `${out}/${phase}.png` });
  const samples = await page.evaluate(async ({ base64, points }) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return points.map(p => ({ ...p, pixels: [...ctx.getImageData(Math.floor(p.x) - 2, Math.floor(p.y) - 2, 5, 5).data] }));
  }, { base64: bytes.toString("base64"), points: visible });
  const metrics = samples.map(sample => {
    let greenPixels = 0;
    for (let i = 0; i < sample.pixels.length; i += 4) if (green(sample.pixels.slice(i, i + 4))) greenPixels++;
    return { ...sample, greenPixels };
  });
  const reference = metrics.filter(p => p.kind === "reference"), selection = metrics.filter(p => p.kind === "selection");
  const value = { ...state, metrics, referenceGreenSamples: reference.filter(p => p.greenPixels > 0).length,
    referenceSamples: reference.length, selectionGreenSamples: selection.filter(p => p.greenPixels > 0).length,
    selectionSamples: selection.length };
  await writeFile(`${out}/${phase}.json`, JSON.stringify(value, null, 2));
  return value;
}
export async function saveUi(page, out) {
  await page.keyboard.press("Control+k"); const palette = page.getByTestId("command-palette");
  await palette.getByRole("combobox").fill("portable .zip snapshot");
  const [download] = await Promise.all([page.waitForEvent("download"), palette.getByRole("option").filter({ hasText: /portable \.zip snapshot/i }).click()]);
  const path = `${out}/frame-overlay.zip`; await download.saveAs(path); const bytes = await readFile(path);
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export async function openUi(page, artifact, frameId) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("editor-top-bar").getByRole("button", { name: /^Import project file/ }).click()]);
  await chooser.setFiles({ name: "frame-overlay.zip", mimeType: "application/zip", buffer: await readFile(artifact.path) });
  await page.getByTestId("loading-modal").waitFor({ state: "detached" });
  await page.waitForFunction(id => {
    const state = window.__frameOverlayAuditStore.getState();
    return (window.__vooEditors?.[state.editingNodeId] ?? window.__vooEditor)?.getDocument().nodes.some(n => n.id === id);
  }, frameId);
  await settle(page);
}
