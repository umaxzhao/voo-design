# Tools area effect audit

> Historical audit from 2026-10-26, imported during worktree integration. Defect labels below describe that revision. Tests now run as normal regressions in `tests/unit/legacy-*.test.js`; current execution evidence belongs to `docs/quality-progress.md`.


## Result

This is a partial audit. The audit test verifies the keyboard routing table and family-menu router only. It does **not** establish that a selected tool changes the document or renders the expected result. No feature-effect defect was reproduced in this run; most requested effects remain unverified and are not counted as OK.

| Feature | UI location (file:line) | Operation | Expected | Result (OK / DEFECT / NOT TESTABLE headless) | Evidence (test file:line or code reading) | Suspected cause (file:line, for DEFECT) |
|---|---|---|---|---|---|---|
| Tool keyboard routing (V/F/Q/M/Z/W/B/E/J/L/R/O/P/T/G/C/I/H) | `src/canvas/use_editor_shortcuts.js:1288-1325` | Resolve tool key and family-menu keydown/keyup | Route keys to expected tool/family without chord collisions | OK | `tests/audit/tools_shortcut_routing.audit.test.js:5-54`; checks route IDs and family menu state only | — |
| Select/move tool effect | `src/canvas/components/editor_toolbar.jsx:90-93` | Select and drag an object through pointer down/move/up | Selection changes; dragged node geometry changes and renders at new geometry | NOT TESTABLE headless | Toolbar delegates to select menu (`editor_toolbar.jsx:92`); pointer dispatcher exists (`src/canvas/editor/editor_pointer.js:69-80`), but no assembled editor fixture was available to assert the full operation/history/render input | — |
| Marquee and lasso selection effects | `src/canvas/components/editor_toolbar.jsx:117-128` | Drag marquee/lasso over content | Pixel selection changes to the enclosed region; undo restores prior selection | NOT TESTABLE headless | Toolbar code reading; selection/pixel-selection APIs require a canvas-backed editor to verify resulting selection data | — |
| Crop | `src/canvas/components/editor_toolbar.jsx:110-115` | Drag crop bounds and apply | Crop rectangle and resulting document/image bounds change; undo/redo restore exact state | NOT TESTABLE headless | Toolbar code reading; crop tool activation is in `src/canvas/editor/editor_engine_tools.js`, but no full canvas gesture was exercised | — |
| Brush, eraser, fill, gradient, eyedropper | `src/canvas/components/editor_toolbar.jsx:131-148`, `src/canvas/components/editor_toolbar.jsx:175-194` | Paint/erase/fill/adjust gradient/sample color | Pixel data or target style changes; rendered/computed output reflects it; history is reversible | NOT TESTABLE headless | Toolbar code reading; these operations depend on canvas pixel sampling/rendering and were not driven through assembled pointer dispatch | — |
| Pen and shape tools | `src/canvas/components/editor_toolbar.jsx:160-194` | Draw path/shape by pointer; finish path | A path/shape node is created with expected geometry; undo/redo restores exact document and history name | NOT TESTABLE headless | Toolbar code reading; pointer gesture and engine commit/history were not exercised end to end | — |
| Text tool | `src/canvas/components/editor_toolbar.jsx:153-158` | Click/drag and enter text | Text node and geometry/text fields update; rendered layout reflects text | NOT TESTABLE headless | Toolbar code reading; text measurement/font loading makes a document-only assertion insufficient for the requested render outcome | — |
| Healing and clone stamp | `src/canvas/components/editor_toolbar.jsx:195-205` | Apply healing/clone stroke | Target bitmap changes and render input reflects the edit; history restores exact prior bitmap state | NOT TESTABLE headless | Toolbar code reading; bitmap editing and source sampling require canvas/image data | — |
| Hand and zoom tools | `src/canvas/components/editor_toolbar.jsx:95-100`; `src/canvas/components/editor_zoom.jsx:74,136-138` | Pan or zoom via tool and bottom-bar controls | Viewport/camera changes while document geometry remains stable; fit/zoom controls reach the viewport API | NOT TESTABLE headless | UI handlers are visible; resulting viewport state was not exercised in a headless editor | — |
| Top toolbar and subbar tool selection | `src/canvas/components/editor_toolbar.jsx:58-79`; `src/canvas/editor/tool_families.js` | Click each tool/menu option and verify engine tool state | Every visible option reaches the right engine mode and its behavior | NOT TESTABLE headless | Button delegates to `onTool` (`editor_toolbar.jsx:70`); no mounted toolbar-to-editor integration assertion | — |
| Bottom bar: add canvas, undo, redo, zoom, fit, grid, snap, rulers/guides | `src/canvas/components/editor_zoom.jsx:74-285`; undo/redo controls in `src/canvas/components/editor_actions.jsx` | Invoke each control; compare exact before/after document, viewport or guide state and history name | Document actions undo/redo exactly; view controls update the corresponding state | NOT TESTABLE headless | Component handler wiring only; effect/history contracts were not exercised through UI callbacks | — |
| Contextual taskbar actions | `src/canvas/components/editor_contextual_taskbar.jsx:190-280` | Invoke contextual actions against selected node(s) | Selected document fields/nodes update and resulting geometry/render input matches the action | NOT TESTABLE headless | Code reading shows callbacks such as `updateNode`, flip, crop and transform, but effects were not executed against an engine fixture | — |
| Duplicate, copy, paste, delete | `src/canvas/editor/editor_clipboard.js:129,347,448,460,530` | Execute action from selection/keyboard and compare serialized document | Nodes/data are duplicated/copied/pasted/deleted as expected; undo/redo exact | NOT TESTABLE headless | Controller code locations only; clipboard/system clipboard and history integration were not exercised | — |
| Group and ungroup | `src/canvas/editor/editor_engine_groups.js:32,56` | Group/ungroup selected nodes | Parent/group structure changes without losing child geometry; undo/redo exact | NOT TESTABLE headless | Engine implementation location identified; operation was not run through an engine instance | — |
| Flip, lock, hide, reorder | `src/canvas/editor/editor_transform_api.js:69,106`; `src/canvas/components/editor_contextual_taskbar.jsx:265-267`; reorder helper `editor_contextual_taskbar.jsx:49,291-292` | Apply per selected node(s) | Transform/state/order fields change and render/layout reflects them; history restores exact state | NOT TESTABLE headless | UI/API code reading only; no resulting document snapshot/layout assertion | — |
| Rename | `src/canvas/components/editor_contextual_taskbar.jsx:195-206` (text fields); layer rename UI was not isolated | Rename selected node/layer | Document label/name field changes and persists through undo/redo | NOT TESTABLE headless | No unified rename handler test was found or executed | — |
| Selection action history labels | `src/canvas/editor/editor_engine.js:235-275`; `src/canvas/editor/editor_history.js` | Perform each operation, undo, redo, inspect entry name and serialized state | Every operation has one correctly named entry and exact restoration | NOT TESTABLE headless | History implementation was read, but no operation was run through the assembled engine; cannot infer per-action labels from wiring | — |

## Counts

- OK: 1 (shortcut routing contract only)
- DEFECT: 0 reproduced
- NOT TESTABLE headless: 16 feature groups

## Highest-priority unresolved checks

These are verification gaps, not confirmed defects:

1. Pixel tools (brush, eraser, fill, gradient, eyedropper, healing, clone stamp): verify pixel/document changes and render inputs.
2. Pointer drawing and transforms (select/move, crop, pen, shapes, text): drive pointer down/move/up through the real engine and assert node geometry/content.
3. Undo/redo for every operation: assert exact serialized state and the history entry name, including UI and keyboard routes.
4. Contextual selection actions: execute duplicate/delete/group/ungroup/flip/lock/hide/reorder/rename through their actual UI path.
5. Bottom-bar controls and canvas-size drag: assert viewport or document effects and route consistency across pointer, keyboard and panel paths.

## Not verified

- Any pointer gesture's final document mutation or rendered/layout geometry.
- Pixel data changes or eyedropper sampling.
- Per-operation undo/redo restoration and history names.
- Top-toolbar clicks, bottom-bar controls, contextual taskbar actions, or selection action callbacks as mounted UI flows.
- Keyboard undo/redo, copy/paste/delete, zoom, guide/grid/snap behavior.
- Canvas-size drag behavior, including constraint-dependent child geometry.
- Electron/native clipboard behavior.

The requested reusable `createEditor` headless fixture was not present in the inspected tests; existing examples mostly test isolated controllers or separate collaboration bridges. `createEditor` in `src/canvas/editor/editor_engine.js` requires a canvas context and browser animation/render state, so this pass did not construct an incomplete fake and treat it as feature evidence.

## Audit test execution

`npx vitest run --config tests/audit/vitest.audit.config.js --no-cache tests/audit/tools_shortcut_routing.audit.test.js` — passed (3 tests). The repository Vitest configuration includes only `tests/unit`; the audit-specific config keeps the requested `tests/audit/` file runnable.
