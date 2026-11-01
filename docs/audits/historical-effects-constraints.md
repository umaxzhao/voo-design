# Constraints and resize effect audit

> Historical audit from 2026-10-26, imported during worktree integration. Defect labels below describe that revision. Tests now run as normal regressions in `tests/unit/legacy-*.test.js`; current execution evidence belongs to `docs/quality-progress.md`.


## Summary

The panel width/height edit path for a focused page with constrained top-level children explicitly runs `reflowConstraints`; the pure constraint math also returns the expected right/bottom geometry. Two other page resize entry points do not run that pass: the public `setDocumentSize` engine operation (also used by canvas presets) and the canvas edge drag (`resizeDocumentEdges`). Both defects are retained as expected-failure audit assertions.

| Result | Count |
|---|---:|
| OK | 3 |
| DEFECT | 2 |
| NOT TESTABLE headless | 8 |

Counts are audit rows, not individual low-level assertions. Existing `tests/unit/scene_constraints.test.js` checks all individual constraint modes in isolation; it does not establish that every UI resize path invokes that math.

## Findings

| Feature | UI location (file:line) | Operation | Expected | Result (OK / DEFECT / NOT TESTABLE headless) | Evidence (test file:line or code reading) | Suspected cause (file:line, for DEFECT) |
|---|---|---|---|---|---|---|
| Constraint selection (left/right/stretch/center/scale; top/bottom/stretch/center/scale) | `src/canvas/components/editor_properties/constraints_section.jsx:18-20` | Set a constraint in the panel | Persist normalized modes to the selected node | OK | `tests/unit/scene_constraints.test.js:599-660`; panel handler writes `constraints` through `editAndCommit` | — |
| Right + bottom constraint math | `src/canvas/editor/scene_constraints.js:312-353` | Resize parent box and run constraint resolver | Keep each trailing-edge gap and preserve child size | OK | `tests/audit/constraints_resize.audit.test.js:31-38`; pure mode coverage in `tests/unit/scene_constraints.test.js:138-222` | — |
| Right panel width/height for a focused page with constrained direct children | `src/canvas/components/image_editor.jsx:1127-1173,1193-1197` | Change frame/page W/H in panel | Reflow constrained children against old/new page boxes | OK | Code path captures old boxes and calls `reflowConstraints` before `updateDocument` | — |
| Exact-size engine API / canvas size preset | `src/canvas/components/editor_canvas_presets.jsx:63` | Call `engine.setDocumentSize(width,height)` | Right/bottom pinned children move; stretch/scale modes update dimensions as applicable | DEFECT | `tests/audit/constraints_resize.audit.test.js:21-24`; engine controller forwards to `doc_ops.setDocumentSize` | `src/canvas/editor/editor_engine_document.js:65-71` and `src/canvas/editor/doc_ops_canvas.js:91-104` resize/center nodes without `reflowConstraints` |
| Canvas edge resize handles | `src/canvas/components/editor_resize_handles.jsx:70-82` | Drag right/bottom page edge | Constrained children follow resized page edges | DEFECT | `tests/audit/constraints_resize.audit.test.js:26-29` | `src/canvas/editor/editor_engine_document.js:29-61` → `src/canvas/editor/doc_ops_canvas.js:68-82` commits edge resize without `reflowConstraints` |
| Frame/group resize handles | `src/canvas/editor/editor_pointer_transform.js:656-667` | Drag a group/frame node's resize handle | Direct children should resolve constraints against the resized parent | NOT TESTABLE headless | Pointer computes a box patch here; this audit did not mount the pointer controller and inspect a complete gesture/history/render cycle | The shown resize path computes the parent rect; whether downstream commit triggers group child layout needs an integration harness |
| Horizontal/vertical scale combinations on each resize route | `src/canvas/editor/scene_constraints.js:173-220` | Grow/shrink each parent dimension independently | Scale offset and size only on axes configured as `scale` | NOT TESTABLE headless | Resolver math is unit-tested, but interaction-path matrix is only exercised for right/bottom in `tests/audit/constraints_resize.audit.test.js:21-38` | — |
| Auto layout direction, gap, padding and main/cross alignment on frame resize | `src/canvas/editor/scene_auto_layout.js:1-42` | Resize a fixed auto-layout group and reflow | Flow children re-position/resize per layout settings | NOT TESTABLE headless | `tests/audit/constraints_resize.audit.test.js:41-55` checks only horizontal gap/padding/center alignment after direct `reflowAutoLayout`; it does not invoke the UI resize path or cover all options | — |
| Auto layout child sizing (hug/fill/fixed) and wrap | `src/canvas/components/editor_properties/auto_layout_child_section.jsx` and `auto_layout_section.jsx` | Resize frame; add/remove children | Hug measures content, fill consumes available space, fixed stays fixed, wrapping follows available main size | NOT TESTABLE headless | Resolver is available in `scene_auto_layout.js`; this audit did not exercise the full sizing/wrap matrix through engine mutations | — |
| Add/remove children in auto-layout frame | `src/canvas/editor/editor_engine_node_ops.js` (add/remove operations) | Add or remove a flow child | Parent hug size and sibling positions update; fixed parent reflows siblings | NOT TESTABLE headless | No add/remove scenario was driven through the engine API in this audit | — |
| Group resize and ungroup | `src/canvas/editor/editor_engine_groups.js` and `src/canvas/editor/doc_ops_groups.js:180-215` | Resize group, then group/ungroup constrained nodes | Existing parent-relative constraints remain coherent; ungrouped nodes retain visible geometry | NOT TESTABLE headless | Group resize pointer flow and ungroup geometry were not exercised end-to-end; pure group reflow exists in `tests/unit/scene_constraints.test.js:470-590` | — |
| Flip horizontal/vertical | `src/canvas/components/editor_properties/transform_section.jsx:223-239` | Flip selected node | Rendered geometry mirrors around the node's center; stored box stays stable | NOT TESTABLE headless | No render-input assertion for a flipped constrained node was added | — |
| Text auto-resize modes while resizing | `src/canvas/components/editor_properties/transform_section.jsx:108-150` | Resize fixed-box and point text by W/H | Fixed-box width changes wrap column and measured height; point text size changes font and follows measurement | NOT TESTABLE headless | Handler behavior is visible in code, but text layout/font measurement was not verified for every mode | — |
| Align/distribute/tidy inside a frame | `src/canvas/editor/editor_engine_groups.js:172-215` | Run align/distribute/tidy for selected children | A single child aligns to its parent bounds; multi-selection layout commits the resulting positions | NOT TESTABLE headless | Code computes `canvasBounds` from parent for single selection; this audit did not exercise every layout operation through engine and verify post-layout bounds | — |
| Nested frames and nested constraints | `src/canvas/editor/scene_constraints.js:332-353` | Resize outer then inner frame | Each direct-child constraint resolves once against its immediate parent | NOT TESTABLE headless | Existing unit tests cover direct group reflow, but no nested resize sequence/render geometry assertion was run in audit | — |
| Locked aspect ratio during resize | `src/canvas/editor/editor_pointer_transform.js:607-625,656-665` | Resize with node `lockRatio` or Shift | Width/height retain ratio while handle anchor remains stable | NOT TESTABLE headless | `tests/unit/box_transform.test.js:66-96` checks pure box math; full pointer gesture was not driven here | — |
| Undo/redo resize | `src/canvas/editor/editor_engine_document.js:29-71` | Resize then undo/redo | One resize action restores/reapplies parent and child geometry atomically | NOT TESTABLE headless | Panel constrained resize passes `options` to `updateDocument`; drag uses preview + commit. This audit did not verify history snapshots for affected children | — |

## Resize path map

| Path | Engine operation | Calls `reflowConstraints`? |
|---|---|---|
| Right panel focused-page W/H | `image_editor.jsx` `applyPageResize` → `resizePageDocument` + `reflowConstraints` + `engine.updateDocument` | Yes, when direct top-level constrained nodes exist |
| Canvas size preset / engine API | `engine.setDocumentSize` → `doc_ops.setDocumentSize` | No |
| Canvas edge drag | `engine.resizeDocumentEdges` → `doc_ops.resizeDocumentEdges` | No |
| Dragging a child/group frame resize handle | Pointer computes `resizeNodeRect` and commits a node patch | No constraint reflow call appears in the geometry calculation path inspected; downstream full-gesture integration was not verified |

## Top defects by user impact

1. **Canvas edge drag ignores constraints** — common direct manipulation leaves right/bottom-pinned children behind; top impact for users resizing the visible canvas.
2. **Canvas size preset and direct engine `setDocumentSize` ignore constraints** — programmatic and preset resizing produce the same stale child geometry.

## Not verified

- Full browser/React pointer gestures, rendered canvas adapter input, and pixel output.
- Every axis/mode combination across every UI path; only the resolver's isolated math has complete existing unit coverage.
- Full auto-layout matrix (vertical, wrap, hug/fill/fixed combinations, child insertion/removal), grouping/ungrouping, flip render input, text measuring, nested multi-step resize, aspect-ratio gesture, and undo/redo state.
- Remote synchronization could not run: `git pull --ff-only` failed because the worktree's shared Git metadata at `/Volumes/TD/Projects/voo_design/.git/worktrees/wa-a/FETCH_HEAD` is inaccessible in this sandbox.
