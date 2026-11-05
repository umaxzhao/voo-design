import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Session A joins two rotated pen paths through the real context menu, then exports the
// production "portable .zip snapshot". Session B is a new browser process that imports that
// ZIP through the real file chooser. Nothing is injected with setDoc after the first seed.
const EVIDENCE = process.env.PEN_COLD_REOPEN_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-pen-cold-reopen");
const ZIP_PATH = join(EVIDENCE, "pen-join-snapshot.zip");
const IMPORT_NAME = "Import project file (⌘O / Ctrl+O)";

await mkdir(EVIDENCE, { recursive: true });

const anchorsOf = (page, node) => page.evaluate(async (node) => {
  const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry.js");
  const sx = node.width / node.baseWidth;
  const sy = node.height / node.baseHeight;
  return node.points.map((p) => fromNodeLocal(node, { x: p.x * sx, y: p.y * sy }));
}, node);

const snapshot = (page) => page.evaluate(() => window.__vooEditor.getDocument().nodes);

// Join merges the shared endpoint, so the anchor count may shrink; the document-space point sets must match both ways.
const sameSet = (a, b) => a.every((p) => b.some((q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6));
const assertSameAnchors = (actual, expected, label) => {
  assert.ok(sameSet(expected, actual), `${label}: every expected anchor must keep its document position`);
  assert.ok(sameSet(actual, expected), `${label}: no anchor may appear that was not in the expected set`);
};

let joinedBeforeExport;
let anchorsBeforeExport;

await withEditorBrowser(async ({ page, errors }) => {
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
    e.setTool("select");
    // Append to the document's own nodes so the root frame matches a normal document.
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, first, base("pen-b", end.x, end.y, 0)] });
    e.selectExactly(["pen-a", "pen-b"]);
  });
  const client = (point) => page.evaluate(async (point) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + (point.x * rect.width) / doc.width, y: rect.top + (point.y * rect.height) / doc.height };
  }, point);

  const pens = (await snapshot(page)).filter((n) => n.kind === "path");
  assert.equal(pens.length, 2, "Seed has exactly the two pen paths");
  const originalAnchors = [...(await anchorsOf(page, pens[0])), ...(await anchorsOf(page, pens[1]))];
  // Right-click on the stroke itself: the curve midpoint of the second path (cubic at t=0.5 is local (50, 0)).
  const onStroke = await page.evaluate(async (node) => {
    const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry.js");
    return fromNodeLocal(node, { x: 50 * (node.width / node.baseWidth), y: 0 });
  }, pens[1]);
  const spot = await client(onStroke);
  await page.mouse.click(spot.x, spot.y, { button: "right" });
  await page.getByRole("menuitem", { name: /^(Path)$/ }).first().hover();
  await page.getByText(/^(Join Paths|合并路径)$/).first().click();

  const pathsAfterJoin = (await snapshot(page)).filter((n) => n.kind === "path");
  assert.equal(pathsAfterJoin.length, 1, "Join replaces both paths with one node");
  joinedBeforeExport = pathsAfterJoin[0];
  anchorsBeforeExport = await anchorsOf(page, joinedBeforeExport);
  assertSameAnchors(anchorsBeforeExport, originalAnchors, "session A after join");
  assert.equal(joinedBeforeExport.rotation, 90, "Joined node keeps the first path's rotation");

  // Production portable ZIP export through the command palette, same as the titlebar file-action test.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.getByRole("combobox").fill("portable .zip snapshot");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    palette.getByRole("option").filter({ hasText: /portable \.zip snapshot/i }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.zip$/);
  await download.saveAs(ZIP_PATH);
  assert.deepEqual(errors, [], "session A has no page errors");
}, { openDocument: true, mcpLink: true });

await withEditorBrowser(async ({ page, errors }) => {
  page.setDefaultTimeout(30000);
  const bar = page.getByTestId("editor-top-bar");
  const importButton = bar.getByRole("button", { name: IMPORT_NAME, exact: true });
  await importButton.waitFor();
  // The import button waits for the welcome action listeners before it is enabled.
  for (let attempt = 0; attempt < 300 && (await importButton.isDisabled()); attempt += 1) {
    await page.waitForTimeout(100);
  }
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importButton.click()]);
  await chooser.setFiles(ZIP_PATH);
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes?.length > 0, null, { timeout: 60000 });

  const reopened = await snapshot(page);
  const reopenedPaths = reopened.filter((n) => n.kind === "path");
  assert.equal(reopenedPaths.length, 1, "Cold reopen restores one joined path");
  assert.equal(reopenedPaths[0].rotation, 90, "Cold reopen keeps the rotation");
  assertSameAnchors(await anchorsOf(page, reopenedPaths[0]), anchorsBeforeExport, "session B after cold reopen");

  // Real keyboard nudge and undo/redo in the new process.
  const pathId = reopenedPaths[0].id;
  const xOf = (id) => page.evaluate((nodeId) => window.__vooEditor.getDocument().nodes.find((n) => n.id === nodeId)?.x, id);
  await page.evaluate((id) => window.__vooEditor.selectExactly([id]), pathId);
  const xBefore = reopenedPaths[0].x;
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(([id, x]) => window.__vooEditor.getDocument().nodes.find((n) => n.id === id)?.x !== x, [pathId, xBefore]);
  const nudged = await snapshot(page);
  assert.notEqual(await xOf(pathId), xBefore, "ArrowRight nudges the reopened path");
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(([id, x]) => window.__vooEditor.getDocument().nodes.find((n) => n.id === id)?.x === x, [pathId, xBefore]);
  assert.deepEqual(await snapshot(page), reopened, "Undo after cold reopen restores the reopened geometry");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(([id, x]) => window.__vooEditor.getDocument().nodes.find((n) => n.id === id)?.x !== x, [pathId, xBefore]);
  assert.deepEqual(await snapshot(page), nudged, "Redo after cold reopen restores the nudge");
  assert.deepEqual(errors, [], "session B has no page errors");
}, { openDocument: false, mcpLink: false });

console.log(`pen_join_cold_reopen.e2e: passed (zip ${ZIP_PATH}, ${(await readFile(ZIP_PATH)).length} bytes)`);
