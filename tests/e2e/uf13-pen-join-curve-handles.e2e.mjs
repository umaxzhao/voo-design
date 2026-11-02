import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import {
  assertAnchorsMatch, assertHandlesMatch, assertSameState, describePaths, joinThroughContextMenu,
  seedCase, selectNodes, settle, translateDescribed, TOLERANCE,
} from "./uf13-pen-join-helpers.mjs";

// UF13 curve gap: real cubic anchors with in/out handles. The join must keep every handle's world
// end and tangent, the welded seam must keep the outer handles, and one post-join edit must undo
// and redo as one step. Handles are node-local vectors, so they are set here as data, not drawn.

const NUDGE_KEY = "ArrowRight";

const CASES = [
  {
    name: "curve-rotated-touching",
    frame: null,
    touch: true,
    a: {
      id: "pa", x: 100, y: 100, width: 80, height: 40, rotation: 30,
      points: [{ x: 0, y: 0, out: [20, -10] }, { x: 80, y: 40, in: [-25, 5] }],
    },
    b: {
      id: "pb", x: 300, y: 120, width: 60, height: 60, rotation: -45,
      points: [{ x: 0, y: 0, out: [12, 8] }, { x: 60, y: 0, in: [-10, -4] }],
    },
  },
  {
    name: "curve-shear-flipH-apart",
    frame: null,
    touch: false,
    a: {
      id: "pa", x: 50, y: 50, width: 100, height: 20, flipH: true, shear: 20,
      points: [{ x: 0, y: 0, out: [30, -15] }, { x: 100, y: 20, in: [-30, 10] }],
    },
    b: {
      id: "pb", x: 300, y: 200, width: 40, height: 40,
      points: [{ x: 0, y: 0, out: [10, 10] }, { x: 40, y: 40, in: [-8, -6] }],
    },
  },
  {
    name: "curve-negative-flip-touching",
    frame: null,
    touch: true,
    a: {
      id: "pa", x: 80, y: 80, width: 90, height: 50, flipH: true, flipV: true,
      points: [{ x: 0, y: 0, out: [25, 10] }, { x: 90, y: 50, in: [-20, -12] }],
    },
    b: {
      id: "pb", x: 320, y: 220, width: 50, height: 30, flipH: true,
      points: [{ x: 0, y: 0, out: [9, -6] }, { x: 50, y: 30, in: [-7, 4] }],
    },
  },
  {
    name: "curve-nonzero-origin-rotated-frame",
    frame: { id: "fr", x: 40, y: 30, width: 600, height: 400, rotation: 20 },
    touch: true,
    a: {
      id: "pa", x: 140, y: 130, width: 80, height: 40, rotation: 30, flipV: true,
      points: [{ x: 0, y: 0, out: [16, 12] }, { x: 80, y: 40, in: [-18, -9] }],
    },
    b: {
      id: "pb", x: 300, y: 260, width: 60, height: 60, rotation: -45,
      points: [{ x: 0, y: 0, out: [14, -5] }, { x: 60, y: 0, in: [-6, 8] }],
    },
  },
];

const results = [];

function assertSingleJoin(name, joined) {
  assert.equal(joined.length, 1, `${name}: join must leave one path`);
  assert.equal(joined[0].rotation, 0, `${name}: joined node must be unrotated`);
  assert.equal(joined[0].flipH, false, `${name}: joined node must not be flipped`);
  assert.equal(joined[0].flipV, false, `${name}: joined node must not be flipped vertically`);
}

await withEditorBrowser(async ({ page, errors }) => {
  for (const testCase of CASES) {
    const { name } = testCase;
    const inputs = await seedCase(page, testCase);
    const inputPoints = inputs.flatMap((n) => n.points).length;
    const centre = { x: testCase.a.x + testCase.a.width / 2, y: testCase.a.y + testCase.a.height / 2 };
    await joinThroughContextMenu(page, centre);
    const joined = await describePaths(page);
    assertSingleJoin(name, joined);

    // A touching join welds one anchor; no handle may be dropped by the weld (outer handles stay).
    const welded = testCase.touch ? 1 : 0;
    const anchors = assertAnchorsMatch(name, inputs, joined, inputPoints - welded);
    const handles = assertHandlesMatch(name, inputs, joined);
    if (testCase.touch) {
      const seam = joined[0].points.filter((p) => p.in && p.out);
      assert.equal(seam.length, 1, `${name}: the welded anchor must carry both outer handles`);
    }

    // One post-join edit: nudge the joined path with the real keyboard shortcut.
    await selectNodes(page, [joined[0].id]);
    await page.keyboard.press(NUDGE_KEY);
    await settle(page);
    const edited = await describePaths(page);
    assert.equal(edited.length, 1, `${name}: nudge keeps one path`);
    const dx = edited[0].points[0].at.x - joined[0].points[0].at.x;
    const dy = edited[0].points[0].at.y - joined[0].points[0].at.y;
    assert.ok(Math.hypot(dx, dy) > TOLERANCE, `${name}: nudge must move the path`);
    // Every anchor and handle end moves by the same document-space offset.
    const shifted = translateDescribed(joined, dx, dy);
    assertAnchorsMatch(`${name} after nudge`, shifted, edited, inputPoints - welded);
    assertHandlesMatch(`${name} after nudge`, shifted, edited);

    // One Undo returns to the joined state; one Redo re-applies the nudge.
    await page.keyboard.press("ControlOrMeta+Z");
    await settle(page);
    const undone = await describePaths(page);
    assertSameState(`${name} after undo nudge`, joined, undone);
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await settle(page);
    const redone = await describePaths(page);
    assertSameState(`${name} after redo nudge`, edited, redone);

    results.push({
      case: name, inputAnchors: inputPoints, handles: handles.handles, worstAnchor: anchors.worst,
      worstHandleEnd: handles.worstEnd, worstTangentRad: handles.worstTangent, nudge: [dx, dy],
    });
  }
  assert.deepEqual(errors, [], `unexpected page errors: ${errors.join("\n")}`);
  console.log(JSON.stringify({ cases: results }));
}, { openDocument: true, mcpLink: true });
