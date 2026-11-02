import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// Shared UF13 pen-join helpers. The oracles compose the browser's own DOMMatrix in the same order as
// svgNodeTransform (flip, shear, rotate about the box centre). This is a second implementation of that
// order, not an independent renderer. Parent Frames do not transform children in this engine.

export const TOLERANCE = 1e-3;
export const IMPORT_NAME = "Import project file (⌘O / Ctrl+O)";

// Anchor (node-local) -> document space.
export const ORACLE_SOURCE = `(node, anchor) => {
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

// Handle vector (node-local, scaled by the box) -> document-space offset. Handles take the linear part only.
export const HANDLE_ORACLE_SOURCE = `(node, vector) => {
  const sx = node.baseWidth ? node.width / node.baseWidth : 1;
  const sy = node.baseHeight ? node.height / node.baseHeight : 1;
  const matrix = new DOMMatrix()
    .rotate(node.rotation ?? 0)
    .skewX(node.shear ?? 0)
    .scale(node.flipH ? -1 : 1, node.flipV ? -1 : 1);
  const point = matrix.transformPoint(new DOMPoint(vector[0] * sx, vector[1] * sy));
  return [point.x, point.y];
}`;

// Browser-side: every path node -> anchors at document space, with absolute handle ends (or null).
const DESCRIBE_SOURCE = `(nodes, oracleSource, handleSource) => {
  const oracle = eval(oracleSource);
  const handle = eval(handleSource);
  return nodes.map((node) => ({
    id: node.id,
    rotation: node.rotation ?? 0,
    flipH: node.flipH ?? false,
    flipV: node.flipV ?? false,
    shear: node.shear ?? 0,
    points: node.points.map((p) => {
      const at = oracle(node, p);
      const end = (vector) => {
        if (!vector) return null;
        const offset = handle(node, vector);
        return { x: at.x + offset[0], y: at.y + offset[1] };
      };
      return { at, in: end(p.in), out: end(p.out) };
    }),
  }));
}`;

const nextFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Reads every path node in the open document as described above. */
export async function describePaths(page) {
  return page.evaluate(({ describe, oracle, handle }) => {
    const paths = window.__vooEditor.getDocument().nodes.filter((n) => n.kind === "path");
    return eval(describe)(paths, oracle, handle);
  }, { describe: DESCRIBE_SOURCE, oracle: ORACLE_SOURCE, handle: HANDLE_ORACLE_SOURCE });
}

/**
 * Replaces the document with two paths (optionally inside a Frame) for one case.
 * `testCase.touch` moves b so its start meets a's end in document space, so the join welds.
 * Points are {x, y, in, out} objects; handles are node-local vectors.
 */
export async function seedCase(page, testCase) {
  await page.evaluate(({ oracleSource, testCase }) => {
    const oracle = eval(oracleSource);
    const parentId = testCase.frame ? testCase.frame.id : null;
    const build = (spec, dx = 0, dy = 0) => ({
      id: spec.id, kind: "path", name: spec.id, x: spec.x + dx, y: spec.y + dy, width: spec.width, height: spec.height,
      baseWidth: spec.width, baseHeight: spec.height, rotation: spec.rotation ?? 0, shear: spec.shear ?? 0,
      flipH: spec.flipH ?? false, flipV: spec.flipV ?? false, visible: true, parentId,
      points: spec.points.map((p) => ({ x: p.x, y: p.y, in: p.in ?? null, out: p.out ?? null, close: false })),
    });
    const first = build(testCase.a);
    let second = build(testCase.b);
    if (testCase.touch) {
      const endA = oracle(first, first.points[first.points.length - 1]);
      const startB = oracle(second, second.points[0]);
      second = build(testCase.b, endA.x - startB.x, endA.y - startB.y);
    }
    const frameSpec = testCase.frame;
    const frameNodes = frameSpec ? [{
      id: frameSpec.id, kind: "group", isFrame: true, frame: true, containerType: "frame", name: frameSpec.id,
      x: frameSpec.x, y: frameSpec.y, width: frameSpec.width, height: frameSpec.height,
      baseWidth: frameSpec.width, baseHeight: frameSpec.height, rotation: frameSpec.rotation ?? 0,
      shear: 0, flipH: false, flipV: false, visible: true, parentId: null, fill: "#171717", clipContent: true,
    }] : [];
    const editor = window.__vooEditor;
    // Replace the whole node list so earlier cases cannot leak paths into this join.
    editor.setDoc({ ...editor.getDocument(), nodes: [...frameNodes, first, second] });
    editor.selectExactly([first.id, second.id]);
    editor.setTool("select");
  }, { oracleSource: ORACLE_SOURCE, testCase });
  return describePaths(page);
}

/** Right-clicks a path's centre, then Path > Join Paths, through the real canvas context menu. */
export async function joinThroughContextMenu(page, centre) {
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
  await nextFrames(page);
}

/** Selects nodes through the engine selection API; used only as setup before a keyboard edit. */
export async function selectNodes(page, ids) {
  await page.evaluate((nodeIds) => window.__vooEditor.selectExactly(nodeIds), ids);
}

export async function settle(page) {
  await nextFrames(page);
}

/** Saves the open document as a portable ZIP through the command palette, like a user. */
export async function saveZipSnapshot(page, zipPath) {
  await page.getByTestId("editor-pages").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.getByRole("combobox").fill("portable .zip snapshot");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    palette.getByRole("option").filter({ hasText: /portable \.zip snapshot/i }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.zip$/);
  await mkdir(dirname(zipPath), { recursive: true });
  await download.saveAs(zipPath);
}

/** Opens a ZIP from the welcome screen through the real file chooser (session with no document). */
export async function importZipFromWelcome(page, zipPath) {
  const importButton = page.getByTestId("editor-top-bar").getByRole("button", { name: IMPORT_NAME, exact: true });
  await importButton.waitFor();
  for (let attempt = 0; attempt < 300 && (await importButton.isDisabled()); attempt += 1) {
    await page.waitForTimeout(100);
  }
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importButton.click()]);
  await chooser.setFiles(zipPath);
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes?.length > 0, null, { timeout: 60000 });
}

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const anchorsOf = (described) => described.flatMap((n) => n.points.map((p) => p.at));

/** Every output anchor sits on some input anchor, and every input anchor is kept. */
export function assertAnchorsMatch(name, inputs, outputs, expectedCount) {
  const before = anchorsOf(inputs);
  const after = anchorsOf(outputs);
  assert.equal(after.length, expectedCount, `${name}: anchor count ${after.length} vs ${expectedCount}`);
  const worst = Math.max(...after.map((p) => Math.min(...before.map((q) => dist(p, q)))));
  const missing = Math.max(...before.map((q) => Math.min(...after.map((p) => dist(p, q)))));
  assert.ok(worst < TOLERANCE, `${name}: joined anchor drift ${worst}`);
  assert.ok(missing < TOLERANCE, `${name}: input anchor lost, ${missing}`);
  return { worst, missing };
}

const handlesOf = (described) => described.flatMap((n) => n.points.flatMap((p) => [
  ...(p.in ? [{ anchor: p.at, end: p.in }] : []),
  ...(p.out ? [{ anchor: p.at, end: p.out }] : []),
]));
const angleOf = (handle) => Math.atan2(handle.end.y - handle.anchor.y, handle.end.x - handle.anchor.x);

/**
 * Every input handle (anchor -> end) must have one unused output handle with the same anchor and end,
 * and the same tangent direction and length. The count must not change.
 */
export function assertHandlesMatch(name, inputs, outputs) {
  const before = handlesOf(inputs);
  const after = handlesOf(outputs);
  assert.equal(after.length, before.length, `${name}: handle count ${after.length} vs ${before.length}`);
  const used = new Set();
  let worstEnd = 0;
  let worstTangent = 0;
  for (const handle of before) {
    let best = null;
    after.forEach((candidate, index) => {
      if (used.has(index)) return;
      const d = Math.max(dist(candidate.anchor, handle.anchor), dist(candidate.end, handle.end));
      if (!best || d < best.d) best = { d, index, candidate };
    });
    assert.ok(best && best.d < TOLERANCE, `${name}: handle ${JSON.stringify(handle)} has no output match (${best?.d})`);
    used.add(best.index);
    worstEnd = Math.max(worstEnd, best.d);
    const turn = angleOf(handle) - angleOf(best.candidate);
    const tangent = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    worstTangent = Math.max(worstTangent, tangent);
    assert.ok(tangent < TOLERANCE, `${name}: handle tangent off by ${tangent} rad`);
    const lengthDiff = Math.abs(dist(handle.anchor, handle.end) - dist(best.candidate.anchor, best.candidate.end));
    assert.ok(lengthDiff < TOLERANCE, `${name}: handle length off by ${lengthDiff}`);
  }
  return { worstEnd, worstTangent, handles: before.length };
}

/** Checks anchors and handles together, with one path expected. */
export function assertSameState(name, expected, actual) {
  assert.equal(actual.length, expected.length, `${name}: path count ${actual.length} vs ${expected.length}`);
  const anchors = assertAnchorsMatch(name, expected, actual, anchorsOf(expected).length);
  const handles = assertHandlesMatch(name, expected, actual);
  return { ...anchors, ...handles };
}

/** Moves a described state by a document-space offset, to predict a translated edit. */
export function translateDescribed(described, dx, dy) {
  const shift = (point) => (point ? { x: point.x + dx, y: point.y + dy } : null);
  return described.map((node) => ({
    ...node,
    points: node.points.map((p) => ({ at: shift(p.at), in: shift(p.in), out: shift(p.out) })),
  }));
}
