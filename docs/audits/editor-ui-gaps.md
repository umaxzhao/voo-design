# Editor UI control-gap audit

Audit of handlers in `src/canvas/components/editor_toolbar.jsx`,
`editor_tool_subbar.jsx`, `editor_contextual_taskbar.jsx` and
`src/canvas/components/editor_properties/` against the engine API surface
(`src/canvas/editor/editor_engine*.js` plus the controllers/subsystems spread
into it by `editor_engine_assembly.js`).

Legend for **Fixed?**: `yes` = patched in this change; `no` = documented only.

## Findings

| File | Control | Problem | Fixed? |
| --- | --- | --- | --- |
| `editor_contextual_taskbar.jsx` (lines 681, 834, 1016, 1432) | Lock / Unlock buttons in the image More menu, shape, text and frame contexts | Calls `engine.toggleLock(id)`. No such engine method exists (optional chaining made it a silent no-op). The engine exposes `toggleLockNode(id)` from `editor_engine_node_ops.js` (the layers panel already calls `engine.toggleLockNode`). Routed through `toggleNodeLock` in `editor_taskbar_actions.js`. | yes |
| `editor_contextual_taskbar.jsx` (line 391) | Deselect button in the pixel-selection context | Calls `engine.clearSelection()`, which does not exist on the engine — the button did nothing. The engine's pixel-selection clear is `clearPixelSelection()` (`editor_engine_selection.js`). Routed through `clearActivePixelSelection` in `editor_taskbar_actions.js`. | yes |
| `editor_contextual_taskbar.jsx` (line 1302) | "Finish path" check button in the pen context | Calls `engine.finishPenPath()`, which does not exist. The engine exposes `finishPen()` (commit the in-progress pen draft) and `endEdit()` (close path-editing), matching Enter-key behaviour in `use_editor_shortcuts.js`. Routed through `finishPenPathEditing` in `editor_taskbar_actions.js`. | yes |
| `src/canvas/editor/tool_families.js` (lasso family `matchTool`, line ~162) | Lasso family matching, consumed by `editor_tool_subbar.jsx` via `TOOL_FAMILIES` | `matchTool: (tool) => ... marqueeMode === "poly" ...` references `marqueeMode` without declaring it as a parameter — a latent `ReferenceError` if that branch is ever evaluated (currently shielded only by family iteration order in `getFamilyByTool`). Fixed by adding the missing `marqueeMode` parameter. | yes |
| `src/canvas/use_editor_shortcuts.js` (line 708) — adjacent finding, same dead call | Ctrl/Cmd+D with an active pixel selection | Calls `engine.clearSelection?.()`, the same non-existent method as the taskbar deselect button, so the shortcut never cleared pixel selections. Now calls `engine.clearPixelSelection()`. | yes |
| `editor_properties/linear_array_section.jsx`, `grid_array_section.jsx`, `circular_array_section.jsx` | Every control (Add/Enable, count/step/offset/angle inputs, Remove) | The three sections are fully implemented and their engine methods (`add/update/remove{Linear,Grid,Circular}ArrayModifier`, `subscribeRender`, `getDocument`) all exist on the engine, but no file imports or mounts the sections — the controls are unreachable dead UI. Wiring them into `properties_panel_sections.jsx` is a product decision (which node kinds, placement), so left unfixed. | no |
| `editor_toolbar.jsx` (propTypes, lines 349-350) | `onRemoveBackground`, `onSelectSubject` | Declared in `EditorToolbar.propTypes` but never read by the component (vestigial declarations; the live controls for both actions live on other components). Harmless; removed? No — kept to avoid churn at call sites. | no |
| `editor_contextual_taskbar.jsx` (propTypes, line 1544) | `stageRef` | Declared in propTypes but never destructured or used. Harmless dead declaration. | no |
| `editor_properties/media_section.jsx` (line 163) | Bitmap source lookup | `engine.getDocument().nodes.find(...)` without optional chaining. The engine document is never null in practice; robustness-only nit (`?.` used elsewhere in the repo). | no |

## Verified clear (no gap)

All other engine calls in the audited files resolve to real engine methods,
including: `getSelected`, `getSelectedIds`, `getSelectionTransform`,
`canCombineSelection`, `combineSelected`, `groupSelection`,
`layoutSelection`, `deleteSelected`, `duplicateSelected`, `copySelectedSvg`,
`convertSelectedToPath`, `flipHorizontal`, `flipVertical`, `setTool`,
`set/getMarqueeMode`, `set/getHealingMode`, `invertPixelSelection`,
`begin/apply/cancelSelectionTransform`, `deleteActiveAnchor`, `setDoc`,
`getDocument`, `subscribeRender`, and the array-modifier methods.

In `editor_properties/` every interactive control outside the orphaned array
sections is wired: adjustment sliders/reset, tone-curve editing, align
distribute/tidy, colour swatches, variables panel actions, add-kind picker,
lasso workflow, pen/shape/text/transform sections. The only empty handler
bodies (`index.jsx:43-44`, `layer_effects_section.jsx:33-34`) are intentional
no-op defaults the host overrides.

`editor_toolbar.jsx` and `editor_tool_subbar.jsx` delegate entirely to
`on*` props and `TOOL_FAMILIES.applyItem`; no missing/no-op handlers of their
own beyond the vestigial propTypes noted above.

## Tests

`tests/unit/editor_taskbar_engine_actions.test.js` covers the fixed taskbar
action helpers (lock toggle, pixel-selection clear, pen finish) and
`tests/unit/tool_families_match_tool.test.js` covers the lasso `matchTool`
fix.
