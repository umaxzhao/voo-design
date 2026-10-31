import assert from "node:assert/strict";
import { imageAudit } from "./image-audit-fixture.mjs";

export const frame = (id, x, y, width, height, patch = {}) => ({ id, name: id,
  kind: "group", isFrame: true, x, y, width, height, fill: "#ffffff", visible: true,
  opacity: 1, clipContent: true, ...patch });
export const shape = (id, parentId, x, y, patch = {}) => ({ id, name: id, kind: "rect",
  parentId, x, y, width: 70, height: 50, fill: "#ff0000", visible: true, opacity: 1, ...patch });
export const nestedFrames = () => [frame("outer", 40, 40, 620, 440),
  frame("inner", 120, 120, 320, 260, { parentId: "outer" })];

/** Shared isolated browser operations; all geometry uses actual canvas coordinates. */
export function nestedObjectsFixture(page, name) {
  const audit = imageAudit(page, name);
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const snapshot = () => page.evaluate(() => window.__vooEditor.serialise());
  const node = id => page.evaluate(id => window.__vooEditor.getNode(id), id);
  const seed = async (nodes = nestedFrames(), selected = []) => {
    await page.mouse.up(); await page.keyboard.press("Escape");
    await page.evaluate(async ({ nodes, selected }) => {
      const e = window.__vooEditor;
      e.cancelSelectionTransform(); e.setTool("select"); e.selectExactly([]);
      e.setDoc({ ...e.getDocument(), width: 900, height: 600,
        crop: null, isCanvasRoot: true, backgroundColor: "transparent", nodes });
      e.selectExactly(selected);
      if (e.getSnappingEnabled()) e.toggleSnapping();
      const { useDesignStore } = await import("/src/store/design_store.js");
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 320, panY: 120 }, pendingArtboardFitId: null });
    }, { nodes, selected });
    await settle();
  };
  const client = point => page.evaluate(point => {
    const r = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const d = window.__vooEditor.getDocument();
    return { x: r.left + point.x * r.width / d.width, y: r.top + point.y * r.height / d.height };
  }, point);
  const drag = async (from, to) => {
    const a = await client(from), b = await client(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await settle();
    await page.evaluate(() => window.__vooEditor.flushTransforms());
  };
  const history = async before => {
    const after = await snapshot();
    await page.evaluate(() => window.__vooEditor.undo()); await settle();
    assert.deepEqual(await snapshot(), before, "One undo restores the complete document");
    await page.evaluate(() => window.__vooEditor.redo()); await settle();
    assert.deepEqual(await snapshot(), after, "One redo restores the complete document");
  };
  const pixel = async point => { await settle(); return page.evaluate(p => window.__vooEditor.sampleColorAt(p), point); };
  const focus = () => page.locator("[data-editor-artboard]").evaluate(el => { el.tabIndex = -1; el.focus(); });
  const solidPng = async (color = "#0000ff") => Buffer.from(await page.evaluate(color => {
    const c = document.createElement("canvas"); c.width = 40; c.height = 30;
    const ctx = c.getContext("2d"); ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL().split(",")[1];
  }, color), "base64");
  const pick = async (file, point = { x: 240, y: 220 }) => {
    const before = await snapshot(), p = await client(point);
    await page.mouse.click(p.x, p.y, { button: "right" });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("editor-menu-import-media").click()]);
    await chooser.setFiles(file);
    await page.waitForFunction(ids => window.__vooEditor.getDocument().nodes.some(n => !ids.includes(n.id)), before.nodes.map(n => n.id));
    await settle();
    return (await snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
  };
  const hierarchy = async () => {
    const doc = await snapshot(), ids = new Set(doc.nodes.map(n => n.id));
    assert.equal(ids.size, doc.nodes.length, "IDs are unique");
    for (const item of doc.nodes) {
      const seen = new Set([item.id]); let current = item;
      if (item.clipTo) assert.ok(ids.has(item.clipTo), `Missing mask base for ${item.id}`);
      while (current.parentId) {
        assert.ok(ids.has(current.parentId), `Missing parent for ${current.id}`);
        assert.ok(!seen.has(current.parentId), "Hierarchy cannot contain a cycle");
        seen.add(current.parentId); current = doc.nodes.find(n => n.id === current.parentId);
      }
    }
  };
  return { ...audit, seed, snapshot, node, settle, client, drag, history, pixel, focus, solidPng, pick, hierarchy };
}
