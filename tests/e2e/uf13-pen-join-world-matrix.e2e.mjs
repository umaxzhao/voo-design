import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import {
  assertAnchorsMatch, assertHandlesMatch, assertSameState, describePaths, importZipFromWelcome,
  joinThroughContextMenu, saveZipSnapshot, seedCase, settle,
} from "./uf13-pen-join-helpers.mjs";

// UF13 real-UI matrix: right-click "Join Paths" on two open pen paths must keep every anchor at its
// input world position. Each case is saved as a portable ZIP after its Undo/Redo check, then reopened
// in a new browser process through the real file chooser.

const EVIDENCE = process.env.UF13_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-uf13-cold-reopen");

// Points are [x, y] pairs here; withPoints() turns them into anchors with no handles.
const RAW_CASES = [
  {
    name: "rotated-touching",
    frame: null,
    a: { id: "pa", x: 100, y: 100, width: 80, height: 40, rotation: 30, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 300, y: 120, width: 60, height: 60, rotation: -45, points: [[0, 0], [60, 0]] },
    touch: true,
  },
  {
    name: "shear-flipH-apart",
    frame: null,
    a: { id: "pa", x: 50, y: 50, width: 100, height: 20, flipH: true, shear: 20, points: [[0, 0], [100, 20]] },
    b: { id: "pb", x: 300, y: 200, width: 40, height: 40, points: [[0, 0], [40, 40]] },
    touch: false,
  },
  {
    name: "negative-flipH-flipV",
    frame: null,
    a: { id: "pa", x: 80, y: 80, width: 90, height: 50, flipH: true, flipV: true, points: [[0, 0], [90, 50]] },
    b: { id: "pb", x: 320, y: 220, width: 50, height: 30, flipH: true, points: [[0, 0], [50, 30]] },
    touch: true,
  },
  {
    name: "rotated-inside-origin-frame",
    frame: { id: "fr", x: 0, y: 0, width: 600, height: 400, rotation: 0 },
    a: { id: "pa", x: 60, y: 60, width: 80, height: 40, rotation: 15, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 200, y: 160, width: 60, height: 60, rotation: -20, points: [[0, 0], [60, 0]] },
    touch: true,
  },
  {
    name: "nonzero-origin-rotated-frame",
    frame: { id: "fr", x: 40, y: 30, width: 600, height: 400, rotation: 20 },
    a: { id: "pa", x: 140, y: 130, width: 80, height: 40, rotation: 30, flipV: true, points: [[0, 0], [80, 40]] },
    b: { id: "pb", x: 300, y: 260, width: 60, height: 60, rotation: -45, points: [[0, 0], [60, 0]] },
    touch: true,
  },
];

const withPoints = (spec) => ({ ...spec, points: spec.points.map(([x, y]) => ({ x, y, in: null, out: null })) });
const CASES = RAW_CASES.map((testCase) => ({ ...testCase, a: withPoints(testCase.a), b: withPoints(testCase.b) }));

const results = [];
const saved = [];

function assertSingleJoin(name, joined) {
  assert.equal(joined.length, 1, `${name}: join must leave one path`);
  assert.equal(joined[0].rotation, 0, `${name}: joined node must be unrotated`);
  assert.equal(joined[0].flipH, false, `${name}: joined node must not be flipped`);
  assert.equal(joined[0].flipV, false, `${name}: joined node must not be flipped vertically`);
}

await withEditorBrowser(async ({ page, errors }) => {
  for (const testCase of CASES) {
    const inputs = await seedCase(page, testCase);
    const centre = { x: testCase.a.x + testCase.a.width / 2, y: testCase.a.y + testCase.a.height / 2 };
    await joinThroughContextMenu(page, centre);
    const joined = await describePaths(page);
    assertSingleJoin(testCase.name, joined);
    // A touching join welds the shared end/start pair into one anchor at the same world position.
    const welded = testCase.touch ? 1 : 0;
    const { worst, missing } = assertAnchorsMatch(testCase.name, inputs, joined, inputs.flatMap((n) => n.points).length - welded);
    assertHandlesMatch(testCase.name, inputs, joined);

    // One Undo restores both paths; one Redo re-applies the join.
    await page.keyboard.press("ControlOrMeta+Z");
    await settle(page);
    const undone = await describePaths(page);
    assert.equal(undone.length, 2, `${testCase.name}: one Undo restores both paths`);
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await settle(page);
    const redone = await describePaths(page);
    assert.equal(redone.length, 1, `${testCase.name}: one Redo re-applies the join`);
    assertSameState(`${testCase.name} after redo`, joined, redone);

    // The joined state after Redo is the one saved for the cold reopen.
    const zipPath = join(EVIDENCE, `${testCase.name}.zip`);
    await saveZipSnapshot(page, zipPath);
    saved.push({ name: testCase.name, zipPath, expected: joined, expectedFrame: testCase.frame });
    results.push({ case: testCase.name, anchors: inputs.flatMap((n) => n.points).length, worst, missing, undo: undone.length, redo: redone.length });
  }
  assert.deepEqual(errors, [], `session A page errors: ${errors.join("\n")}`);
}, { openDocument: true, mcpLink: true });

// Each saved ZIP reopens in its own new browser process, through the welcome-screen file chooser.
const coldResults = [];
for (const entry of saved) {
  await withEditorBrowser(async ({ page, errors }) => {
    page.setDefaultTimeout(30000);
    await importZipFromWelcome(page, entry.zipPath);
    const reopened = await describePaths(page);
    assert.equal(reopened.length, 1, `${entry.name}: cold reopen keeps one joined path`);
    assertSameState(`${entry.name} cold-reopen`, entry.expected, reopened);
    if (entry.expectedFrame) {
      const frame = await page.evaluate(() => {
        const node = window.__vooEditor.getDocument().nodes.find((n) => n.isFrame);
        return node ? { x: node.x, y: node.y, rotation: node.rotation } : null;
      });
      assert.ok(frame, `${entry.name}: cold reopen keeps the frame`);
      assert.equal(frame.rotation, entry.expectedFrame.rotation, `${entry.name}: frame rotation`);
      assert.equal(frame.x, entry.expectedFrame.x, `${entry.name}: frame origin x`);
      assert.equal(frame.y, entry.expectedFrame.y, `${entry.name}: frame origin y`);
    }
    assert.deepEqual(errors, [], `${entry.name} session B page errors: ${errors.join("\n")}`);
    coldResults.push({ case: entry.name, zip: entry.zipPath, cold: "pass" });
  }, { openDocument: false, mcpLink: false });
}

await writeFile(join(EVIDENCE, "uf13-results.json"), JSON.stringify({ cases: results, cold: coldResults }, null, 2));
console.log(JSON.stringify({ cases: results, cold: coldResults }));
