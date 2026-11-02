import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// UF13 cold-reopen regression. Two processes, selected by T10_REOPEN_MODE:
//  - "save":   join each case through the real UI, save with Ctrl+S (browser download),
//              write each .voo file and the expected world anchors, then the browser exits.
//  - "reopen": a new browser process opens each saved file through the titlebar
//              "Import project file" button (real file chooser), checks anchor geometry
//              against the pre-join input, then reverses the path and runs one Undo and one Redo.
const MODE = process.env.T10_REOPEN_MODE;
const EVIDENCE = process.env.T10_EVIDENCE;
assert.ok(MODE === "save" || MODE === "reopen", "T10_REOPEN_MODE must be save or reopen");
assert.ok(EVIDENCE, "T10_EVIDENCE must name an evidence directory");
await mkdir(EVIDENCE, { recursive: true });

const SETTLE = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Same authored-Frame seeding as t10-uf13-join-ui.e2e.mjs (this copy predates the shared fixture).
const createAuthoredFrame = (page) => page.evaluate(async () => {
  const editor = window.__vooEditor;
  const doc = editor.getDocument();
  const { createGroupNode } = await import("/src/canvas/editor/scene_model.js");
  const frame = { ...createGroupNode({ x: 0, y: 0, width: doc.width, height: doc.height }),
    isFrame: true, frame: true, containerType: "frame", name: "Authored Frame", fill: "#171717", clipContent: true };
  editor.setDoc({ ...doc, nodes: [frame] });
  return frame.id;
});

// Mirrors the anchor contract in src/canvas/editor/pen_join_world.js.
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

const CASES = [
  {
    name: "rotated-touching", parent: false,
    a: { id: "pa", x: 100, y: 100, width: 80, height: 40, rotation: 30, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 300, y: 120, width: 60, height: 60, rotation: -45, points: [[0, 0], [60, 0]], touchA: true },
  },
  {
    name: "shear-flip-apart", parent: false,
    a: { id: "pa", x: 50, y: 50, width: 100, height: 20, flipH: true, shear: 20, points: [[0, 0], [100, 20]] },
    b: { id: "pb", x: 300, y: 200, width: 40, height: 40, points: [[0, 0], [40, 40]] },
  },
  {
    name: "rotated-inside-frame", parent: true,
    a: { id: "pa", x: 60, y: 60, width: 80, height: 40, rotation: 15, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 200, y: 160, width: 60, height: 60, rotation: -20, points: [[0, 0], [60, 0]], touchA: true },
  },
];

const SAVE_OPTIONS = { openDocument: true, mcpLink: true };
const REOPEN_OPTIONS = { openDocument: false, mcpLink: false };

/** Seeds one case in the open document and returns the pre-join world anchors. */
async function seedCase(page, spec) {
  await page.evaluate(() => {
    const editor = window.__vooEditor;
    editor.setDoc({ ...editor.getDocument(), nodes: [], modifiers: [] });
  });
  const frameId = await createAuthoredFrame(page);
  const parentId = spec.parent ? frameId : null;
  await page.evaluate(({ worldPointSource, a, b, parentId: pid }) => {
    const worldPoint = eval(worldPointSource);
    const editor = window.__vooEditor;
    const doc = editor.getDocument();
    const build = (spec) => ({
      id: spec.id, kind: "path", name: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height,
      baseWidth: spec.width, baseHeight: spec.height, rotation: spec.rotation ?? 0, shear: spec.shear ?? 0,
      flipH: spec.flipH ?? false, flipV: false, visible: true, parentId: pid,
      points: spec.points.map(([x, y]) => ({ x, y, in: null, out: null, close: false })),
    });
    const first = build(a);
    let secondSpec = { ...b };
    if (b.touchA) {
      const endA = worldPoint(first, first.points[first.points.length - 1]);
      const startB = worldPoint(build(b), build(b).points[0]);
      secondSpec = { ...b, x: b.x + (endA.x - startB.x), y: b.y + (endA.y - startB.y) };
    }
    editor.setDoc({ ...doc, nodes: [...doc.nodes, first, build(secondSpec)] });
    editor.selectExactly([first.id, secondSpec.id]);
    editor.setTool("select");
  }, { worldPointSource: worldPointFn, a: spec.a, b: spec.b, parentId });
  await SETTLE(page);
  assert.ok(frameId, "frame seeded");
  return page.evaluate(({ worldPointSource, ids }) => {
    const worldPoint = eval(worldPointSource);
    const nodes = window.__vooEditor.getDocument().nodes.filter((n) => ids.includes(n.id));
    return nodes.flatMap((n) => n.points.map((p) => worldPoint(n, p)));
  }, { worldPointSource: worldPointFn, ids: [spec.a.id, spec.b.id] });
}

/** Right-click the path, open its "Path" submenu and click the given item label. */
async function runPathMenuItem(page, nodeId, label) {
  const screen = await page.evaluate((id) => {
    const editor = window.__vooEditor;
    const node = editor.getDocument().nodes.find((n) => n.id === id);
    const view = editor.getViewport();
    const canvas = [...document.querySelectorAll('[data-testid="design-editor"] canvas')]
      .map((el) => el.getBoundingClientRect())
      .sort((p, q) => q.width * q.height - p.width * p.height)[0];
    return { x: canvas.left + (node.x + node.width / 2) * view.zoom + view.panX, y: canvas.top + (node.y + node.height / 2) * view.zoom + view.panY };
  }, nodeId);
  await page.mouse.click(screen.x, screen.y, { button: "right" });
  await page.getByRole("menuitem", { name: /^(Path|路径)/ }).first().click();
  const item = page.getByRole("menuitem", { name: new RegExp(label) });
  await item.waitFor({ timeout: 5000 });
  await item.click();
  await SETTLE(page);
}

const readPaths = (page) => page.evaluate(({ worldPointSource }) => {
  const worldPoint = eval(worldPointSource);
  return window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "path").map((n) => ({
    id: n.id, rotation: n.rotation ?? 0, flipH: n.flipH ?? false,
    points: n.points.map((p) => worldPoint(n, p)),
  }));
}, { worldPointSource: worldPointFn });

const maxDrift = (got, want) => Math.max(...got.map((p) => Math.min(...want.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))));

async function runSave() {
  const expected = [];
  await withEditorBrowser(async ({ page, errors }) => {
    for (const spec of CASES) {
      const before = await seedCase(page, spec);
      await runPathMenuItem(page, spec.a.id, "Join Paths|合并路径");
      const joined = await readPaths(page);
      assert.equal(joined.length, 1, `${spec.name}: join leaves one path`);
      const drift = maxDrift(joined[0].points, before);
      assert.ok(drift < 1e-3, `${spec.name}: pre-save drift ${drift}`);
      // Surface any confirm dialog or console error so a silent save cancel is visible in the log.
      page.removeAllListeners("dialog");
      page.on("dialog", (dialog) => { console.log(`DIALOG ${dialog.message()}`); void dialog.accept(); });
      page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") console.log(`CONSOLE ${message.type()} ${message.text().slice(0, 300)}`); });
      // Focus the canvas on empty space first, so the Save shortcut reaches the editor handler.
      // Headless Chromium exposes showSaveFilePicker, which would open a native picker and
      // abort silently. Hide it so the editor takes the documented browser download fallback.
      await page.evaluate(() => { window.showSaveFilePicker = undefined; });
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15_000 }),
        // Ctrl+S does not reach the editor keymap from body focus in headless runs; this
        // dispatches the same "voo:file-save" event that the native File > Save menu sends.
        page.evaluate(() => window.dispatchEvent(new CustomEvent("voo:file-save"))),
      ]);
      const file = join(EVIDENCE, `${spec.name}.voo`);
      await download.saveAs(file);
      expected.push({ name: spec.name, file, before, joinedId: joined[0].id });
    }
    assert.deepEqual(errors, [], `save page errors: ${errors.join("\n")}`);
  }, SAVE_OPTIONS);
  await writeFile(join(EVIDENCE, "expected.json"), JSON.stringify(expected, null, 2));
  console.log(JSON.stringify({ mode: "save", cases: expected.map((e) => e.name) }));
}

async function runReopen() {
  const expected = JSON.parse(await readFile(join(EVIDENCE, "expected.json"), "utf8"));
  const results = [];
  await withEditorBrowser(async ({ page, errors }) => {
    const importButton = page.getByTestId("editor-top-bar").getByRole("button", {
      name: "Import project file (⌘O / Ctrl+O)", exact: true,
    });
    for (const item of expected) {
      await importButton.waitFor();
      // Hide showOpenFilePicker so the import takes the <input type=file> chooser path that Playwright observes.
      await page.evaluate(() => { window.showOpenFilePicker = undefined; });
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importButton.click()]);
      await chooser.setFiles(item.file);
      await page.waitForFunction(() => window.__vooEditor && document
        .querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
      await SETTLE(page);
      const reopened = await readPaths(page);
      assert.equal(reopened.length, 1, `${item.name}: reopened file has one joined path`);
      assert.equal(reopened[0].rotation, 0, `${item.name}: joined node stays unrotated after reopen`);
      assert.equal(reopened[0].flipH, false, `${item.name}: joined node stays unflipped after reopen`);
      const drift = maxDrift(reopened[0].points, item.before);
      assert.ok(drift < 1e-3, `${item.name}: post-reopen anchor drift ${drift}`);

      // One undoable path edit on the reopened document: reverse, then one Undo and one Redo.
      const id = reopened[0].id;
      await page.evaluate((nodeId) => window.__vooEditor.selectExactly([nodeId]), id);
      await SETTLE(page);
      const orderBefore = reopened[0].points;
      await runPathMenuItem(page, id, "Reverse Path Direction|反转路径方向");
      const reversed = await readPaths(page);
      assert.ok(reversed[0].points.length === orderBefore.length, `${item.name}: reverse keeps anchor count`);
      assert.ok(maxDrift(reversed[0].points, orderBefore) < 1e-3, `${item.name}: reverse keeps anchor positions`);
      await page.keyboard.press("ControlOrMeta+Z");
      await SETTLE(page);
      const undone = await readPaths(page);
      assert.ok(maxDrift(undone[0].points, orderBefore) < 1e-9 && undone[0].points.every((p, i) => Math.hypot(p.x - orderBefore[i].x, p.y - orderBefore[i].y) < 1e-9),
        `${item.name}: one Undo restores the pre-reverse anchor order`);
      await page.keyboard.press("ControlOrMeta+Shift+Z");
      await SETTLE(page);
      const redone = await readPaths(page);
      assert.ok(redone[0].points.every((p, i) => Math.hypot(p.x - reversed[0].points[i].x, p.y - reversed[0].points[i].y) < 1e-9),
        `${item.name}: one Redo re-applies the reverse`);
      results.push({ case: item.name, drift, undoRedo: "ok" });
    }
    assert.deepEqual(errors, [], `reopen page errors: ${errors.join("\n")}`);
  }, REOPEN_OPTIONS);
  console.log(JSON.stringify({ mode: "reopen", results }));
}

if (MODE === "save") await runSave();
else await runReopen();
