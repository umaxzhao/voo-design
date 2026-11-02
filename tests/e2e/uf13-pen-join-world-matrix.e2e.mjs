import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// UF13 real-UI matrix: right-click "Join Paths" on two open pen paths must keep every anchor
// at its input world position. The oracle is independent of src/canvas/editor/pen_join_world.js:
// it composes the node's visual transform with the browser's own DOMMatrix, using the same
// order as svgNodeTransform (translate, rotate, skewX, flip scale, translate back).
// Parent Frames do not transform children in this engine, so child anchors stay in document space.
// Save as a portable ZIP, then reopen in a new browser process through the real file chooser.

const EVIDENCE = process.env.UF13_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-uf13-cold-reopen");
const ZIP_PATH = join(EVIDENCE, "uf13-join-world.zip");
const IMPORT_NAME = "Import project file (⌘O / Ctrl+O)";
const TOLERANCE = 1e-3;

// Browser-side oracle: returns the document-space point of one anchor of one node.
const ORACLE_SOURCE = `(node, anchor) => {
  const sx = node.baseWidth ? node.width / node.baseWidth : 1;
  const sy = node.baseHeight ? node.height / node.baseHeight : 1;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const matrix = new DOMMatrix()
    .translate(cx, cy)
    .rotate(node.rotation ?? 0)
    .skewX(node.shear ?? 0)
    .scale(node.flipH ? -1 : 1, node.flipV ? -1 : 1)
    .translate(-cx, -cy);
  const point = matrix.transformPoint(new DOMPoint(node.x + anchor.x * sx, node.y + anchor.y * sy));
  return { x: point.x, y: point.y };
}`;

const pathNode = (spec, parentId) => ({
  id: spec.id, kind: "path", name: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height,
  baseWidth: spec.width, baseHeight: spec.height, rotation: spec.rotation ?? 0, shear: spec.shear ?? 0,
  flipH: spec.flipH ?? false, flipV: spec.flipV ?? false, visible: true, parentId: parentId ?? null,
  points: spec.points.map(([x, y]) => ({ x, y, in: null, out: null, close: false })),
});

// Case b of "touching" is moved so its start meets a's end in document space, so the join welds.
const CASES = [
  {
    name: "rotated-touching",
    frame: null,
    a: { id: "pa", x: 100, y: 100, width: 80, height: 40, rotation: 30, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 300, y: 120, width: 60, height: 60, rotation: -45, points: [[0, 0], [60, 0]], touchA: true },
  },
  {
    name: "shear-flipH-apart",
    frame: null,
    a: { id: "pa", x: 50, y: 50, width: 100, height: 20, flipH: true, shear: 20, points: [[0, 0], [100, 20]] },
    b: { id: "pb", x: 300, y: 200, width: 40, height: 40, points: [[0, 0], [40, 40]] },
  },
  {
    name: "negative-flipH-flipV",
    frame: null,
    a: { id: "pa", x: 80, y: 80, width: 90, height: 50, flipH: true, flipV: true, points: [[0, 0], [90, 50]] },
    b: { id: "pb", x: 320, y: 220, width: 50, height: 30, flipH: true, points: [[0, 0], [50, 30]], touchA: true },
  },
  {
    name: "rotated-inside-origin-frame",
    frame: { id: "fr", x: 0, y: 0, width: 600, height: 400, rotation: 0 },
    a: { id: "pa", x: 60, y: 60, width: 80, height: 40, rotation: 15, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 200, y: 160, width: 60, height: 60, rotation: -20, points: [[0, 0], [60, 0]], touchA: true },
  },
  {
    name: "nonzero-origin-rotated-frame",
    frame: { id: "fr", x: 40, y: 30, width: 600, height: 400, rotation: 20 },
    a: { id: "pa", x: 140, y: 130, width: 80, height: 40, rotation: 30, flipV: true, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 300, y: 260, width: 60, height: 60, rotation: -45, points: [[0, 0], [60, 0]], touchA: true },
  },
];

/** Puts the case into the document and returns the input world points from the independent oracle. */
async function seedCase(page, testCase) {
  return page.evaluate(({ oracleSource, testCase }) => {
    const oracle = eval(oracleSource);
    const build = (spec, parentId) => {
      const node = {
        id: spec.id, kind: "path", name: spec.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height,
        baseWidth: spec.width, baseHeight: spec.height, rotation: spec.rotation ?? 0, shear: spec.shear ?? 0,
        flipH: spec.flipH ?? false, flipV: spec.flipV ?? false, visible: true, parentId: parentId ?? null,
        points: spec.points.map(([x, y]) => ({ x, y, in: null, out: null, close: false })),
      };
      return node;
    };
    const parentId = testCase.frame ? testCase.frame.id : null;
    const first = build(testCase.a, parentId);
    let secondSpec = { ...testCase.b };
    if (testCase.b.touchA) {
      // Move b so its start meets a's end in document space, so the join welds.
      const endA = oracle(first, first.points[first.points.length - 1]);
      const startB = oracle(build(testCase.b, parentId), build(testCase.b, parentId).points[0]);
      secondSpec = { ...testCase.b, x: testCase.b.x + (endA.x - startB.x), y: testCase.b.y + (endA.y - startB.y) };
    }
    const second = build(secondSpec, parentId);
    const frameSpec = testCase.frame;
    const frame = frameSpec ? {
      id: frameSpec.id, kind: "group", isFrame: true, frame: true, containerType: "frame", name: frameSpec.id,
      x: frameSpec.x, y: frameSpec.y, width: frameSpec.width, height: frameSpec.height,
      baseWidth: frameSpec.width, baseHeight: frameSpec.height, rotation: frameSpec.rotation ?? 0,
      shear: 0, flipH: false, flipV: false, visible: true, parentId: null, fill: "#171717", clipContent: true,
    } : null;
    const editor = window.__vooEditor;
    const doc = editor.getDocument();
    // Replace the whole node list so earlier cases cannot leak paths into this join.
    editor.setDoc({ ...doc, nodes: [...(frame ? [frame] : []), first, second] });
    editor.selectExactly([first.id, second.id]);
    editor.setTool("select");
    const pointsOf = [first, second].flatMap((node) => node.points.map((p) => oracle(node, p)));
    return { pointsOf, firstId: first.id, centre: { x: first.x + first.width / 2, y: first.y + first.height / 2 } };
  }, { oracleSource: ORACLE_SOURCE, testCase });
}

/** Right-clicks a path's centre, then Path > Join Paths, through the real canvas context menu. */
async function joinThroughContextMenu(page, centre) {
  const screen = await page.evaluate((point) => {
    const editor = window.__vooEditor;
    const view = editor.getViewport();
    const canvas = [...document.querySelectorAll('[data-testid="design-editor"] canvas')]
      .map((el) => el.getBoundingClientRect())
      .sort((p, q) => q.width * q.height - p.width * p.height)[0];
    return { x: canvas.left + point.x * view.zoom + view.panX, y: canvas.top + point.y * view.zoom + view.panY };
  }, centre);
  await page.mouse.click(screen.x, screen.y, { button: "right" });
  await page.getByRole("menuitem", { name: /^(Path|路径)/ }).first().click();
  const join = page.getByRole("menuitem", { name: /Join Paths|合并路径/ });
  await join.waitFor({ timeout: 5000 });
  await join.click();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Reads the joined paths and their document-space anchors, using the same independent oracle. */
async function readJoined(page) {
  return page.evaluate(({ oracleSource }) => {
    const oracle = eval(oracleSource);
    return window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "path").map((n) => ({
      id: n.id, rotation: n.rotation ?? 0, flipH: n.flipH ?? false, flipV: n.flipV ?? false, shear: n.shear ?? 0,
      points: n.points.map((p) => oracle(n, p)),
    }));
  }, { oracleSource: ORACLE_SOURCE });
}

/** Every joined anchor must sit on some input anchor, and every input anchor must be kept. */
function assertWorldMatch(name, before, joined, expectedCount = before.length) {
  const allAfter = joined.flatMap((n) => n.points);
  assert.equal(allAfter.length, expectedCount, `${name}: anchor count ${allAfter.length} vs ${expectedCount}`);
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const worst = Math.max(...allAfter.map((p) => Math.min(...before.map((q) => dist(p, q)))));
  const missing = Math.max(...before.map((q) => Math.min(...allAfter.map((p) => dist(p, q)))));
  assert.ok(worst < TOLERANCE, `${name}: joined anchor drift ${worst}`);
  assert.ok(missing < TOLERANCE, `${name}: input anchor lost, ${missing}`);
  return { worst, missing };
}

const results = [];
let coldSession = null;

await withEditorBrowser(async ({ page, errors }) => {
  for (const testCase of CASES) {
    const seeded = await seedCase(page, testCase);
    await joinThroughContextMenu(page, seeded.centre);
    const joined = await readJoined(page);
    assert.equal(joined.length, 1, `${testCase.name}: join must leave one path`);
    assert.equal(joined[0].rotation, 0, `${testCase.name}: joined node must be unrotated`);
    assert.equal(joined[0].flipH, false, `${testCase.name}: joined node must not be flipped`);
    assert.equal(joined[0].flipV, false, `${testCase.name}: joined node must not be flipped vertically`);
    // A touching join welds the shared end/start pair into one anchor at the same world position.
    const welded = testCase.b.touchA ? 1 : 0;
    const { worst, missing } = assertWorldMatch(testCase.name, seeded.pointsOf, joined, seeded.pointsOf.length - welded);

    // One Undo restores both paths; one Redo re-applies the join.
    await page.keyboard.press("ControlOrMeta+Z");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const undone = (await readJoined(page)).length;
    assert.equal(undone, 2, `${testCase.name}: one Undo restores both paths`);
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const redone = await readJoined(page);
    assert.equal(redone.length, 1, `${testCase.name}: one Redo re-applies the join`);
    assertWorldMatch(`${testCase.name} after redo`, seeded.pointsOf, redone, seeded.pointsOf.length - welded);
    results.push({ case: testCase.name, anchors: seeded.pointsOf.length, worst, missing, undo: undone, redo: redone.length });
  }

  // Cold path: rebuild the last case, join it, save a portable ZIP, and keep its expected world points.
  const coldCase = CASES[CASES.length - 1];
  const seeded = await seedCase(page, coldCase);
  await joinThroughContextMenu(page, seeded.centre);
  const expected = await readJoined(page);
  assertWorldMatch("cold-before-save", seeded.pointsOf, expected, seeded.pointsOf.length - 1);
  await page.getByTestId("editor-pages").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.getByRole("combobox").fill("portable .zip snapshot");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    palette.getByRole("option").filter({ hasText: /portable \.zip snapshot/i }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.zip$/);
  await mkdir(EVIDENCE, { recursive: true });
  await download.saveAs(ZIP_PATH);
  assert.deepEqual(errors, [], `session A page errors: ${errors.join("\n")}`);
  coldSession = { expected, frame: coldCase.frame };
}, { openDocument: true, mcpLink: true });

// Session B: a new browser process imports the saved ZIP through the real file chooser.
await withEditorBrowser(async ({ page, errors }) => {
  page.setDefaultTimeout(30000);
  const importButton = page.getByTestId("editor-top-bar").getByRole("button", { name: IMPORT_NAME, exact: true });
  await importButton.waitFor();
  for (let attempt = 0; attempt < 300 && (await importButton.isDisabled()); attempt += 1) {
    await page.waitForTimeout(100);
  }
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importButton.click()]);
  await chooser.setFiles(ZIP_PATH);
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes?.length > 0, null, { timeout: 60000 });
  const reopened = await readJoined(page);
  assert.equal(reopened.length, 1, "cold reopen keeps one joined path");
  // The saved joined anchors must come back at the same document positions (session A output).
  assertWorldMatch("cold-reopen", coldSession.expected[0].points, reopened);
  const frame = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find((n) => n.isFrame));
  assert.ok(frame, "cold reopen keeps the frame");
  assert.equal(frame.rotation, coldSession.frame.rotation, "cold reopen keeps the frame rotation");
  assert.equal(frame.x, coldSession.frame.x, "cold reopen keeps the frame origin x");
  assert.equal(frame.y, coldSession.frame.y, "cold reopen keeps the frame origin y");
  assert.deepEqual(errors, [], `session B page errors: ${errors.join("\n")}`);
  await writeFile(join(EVIDENCE, "uf13-results.json"), JSON.stringify({ cases: results, cold: "pass" }, null, 2));
  console.log(JSON.stringify({ cases: results, cold: "pass", zip: ZIP_PATH, bytes: (await readFile(ZIP_PATH)).length }));
}, { openDocument: false, mcpLink: false });
