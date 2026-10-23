# Handoff Report: Inspector UI Align Section & Gap Controls Survey

## 1. Observation

1. **`align_section.jsx` Architecture**:
   - Location: `src/canvas/components/editor_properties/align_section.jsx`.
   - Lines 198-216: Row 1 renders 6 alignment buttons (`left`, `center`, `right`, `top`, `middle`, `bottom`) using `ALIGN_TYPES`.
   - Lines 218-275: Row 2 renders 4 distribution buttons: 2 for center distribution (`distributeNodes`) and 2 for spacing/tidy (`tidyNodes`).
   - Line 192: `export default function AlignSection({ count, onLayout })` — `AlignSection` currently accepts only `count` and `onLayout`, not `selectedNodes`.
2. **Prop Threading in Inspector**:
   - Location: `src/canvas/components/image_editor.jsx` (lines 3205-3210):
     ```javascript
     selectionCount={selectedGroup ? 1 : selectedIds.length}
     selectedNodes={
       !selectedGroup && selectedIds.length > 1
         ? layers.filter((node) => selectedIds.includes(node.id))
         : []
     }
     ```
     `selectedNodes` is already computed from `layers` and passed to `<EditorProperties>`.
   - Location: `src/canvas/components/editor_properties/index.jsx` (line 325): `<PropertiesPanelSections selectedNodes={selectedNodes} ... />` forwards `selectedNodes`.
   - Location: `src/canvas/components/editor_properties/properties_panel_sections.jsx` (line 74):
     `{!isWarpTool && onLayout && object.kind !== "adjustment" ? (<AlignSection count={selectionCount} onLayout={onLayout} />) : null}` — `selectedNodes` is received by `PropertiesPanelSections` (line 41) but omitted when instantiating `AlignSection`.
3. **Alignment & Distribution Engine (`align_ops.js`)**:
   - Location: `src/canvas/editor/align_ops.js`.
   - Line 79: `distributeSelection(items, axis)` equalizes center-to-center distances ($c_{i+1} - c_i = \text{const}$).
   - Line 114: `tidyUpSelection(items, axis)` equalizes edge-to-edge gaps ($(maxX - minX - \sum w_i) / (k-1)$). Both functions require $k \ge 3$.
   - There is currently no `setGapNodes` or `measureSelectionGaps` function for interactive numeric Gap adjustments or 2-item gap setting.
4. **Interactive Numeric Control (`ScrubField`)**:
   - Location: `src/canvas/components/scrub_field.jsx`.
   - Accepts `prefix`, `value`, `min`, `max`, `step`, `onValueChange`, `onCommit`, `ariaLabel`, `scrubHint`.
   - Supports horizontal drag scrubbing and direct keyboard text entry.
5. **Design System & Linter Verification**:
   - Command: `npm run lint:design` -> `design: clean — 797 file(s) match Design.md.`
   - Command: `npm test` -> `54 passed (54), 540 passed (540)` in 1.92s.
   - Design tokens specified in `design/tokens.cjs`:
     - Radii: `rounded-lg` (8px), `rounded-md` (6px), `rounded-xl` (12px).
     - Typography: `text-[10px]`, `text-[11px]`, `text-xs`.
     - Palette: `neutral-*`, alpha washes `bg-white/[0.06]`, `bg-white/[0.12]`, accent `#a7ffd4` (mint).
     - Tooltip shadow: `shadow-pop`.

---

## 2. Logic Chain

1. **Prop Availability (Observation 2 -> Logic 1)**: Because `selectedNodes` is already constructed in `image_editor.jsx` and passed to `PropertiesPanelSections`, passing `selectedNodes={selectedNodes}` into `<AlignSection>` in `properties_panel_sections.jsx:74` immediately provides `AlignSection` with real-time access to the exact geometry of all selected layers without needing new context providers or global store changes.
2. **Gap Measurement & Axis Detection (Observation 1, 3 -> Logic 2)**: Using `nodeAABB(node)` (from `scene_geometry.js`), each node's axis-aligned bounding box is obtained. For multi-selections ($k \ge 2$), sorting along X and Y yields adjacent pairwise gaps ($g_i$). The dominant axis is determined by comparing center spread ($\max(c) - \min(c)$). The average gap ($\frac{1}{k-1} \sum g_i$) provides the initial value for the Gap input box.
3. **Explicit Gap Application (Observation 3 -> Logic 3)**: When a user enters or scrubs a gap value $G$ for $k \ge 2$ items, `applyGapToItems` anchors the first item in visual order ($item_0$) and sequentially positions each subsequent item at $pos_i = pos_{i-1} + size_{i-1} + G$. Wrapping this in `toPatches` allows `setGapNodes` to be passed directly to `onLayout`, which triggers `engine.layoutSelection` and automatically generates an atomic undo/redo history entry (`editor.layout.selection`).
4. **Figma Parity in Distribute Spacing (Observation 1, 3, 4 -> Logic 4)**: Distribute Spacing (`tidyNodes` / `distributeSpacingNodes`) and Distribute Centers (`distributeNodes`) must be clearly differentiated. The existing `TidyIcon` (3 bars with 2 equal gaps) already visually depicts equal spacing. Updating i18n strings in `extended-en.js` and `extended-zh.js` to "Distribute horizontal/vertical spacing" / "水平/垂直等间距均分" with shortcuts `⌥⇧H` / `⌥⇧V` aligns the interface directly with Figma standards.
5. **Design Token Compliance (Observation 5 -> Logic 5)**: Implementing the Gap row using `rounded-lg` / `rounded-md` for buttons, `rounded-xl` for `ScrubField`, `text-[10px]` / `text-[11px]` font sizes, and `#a7ffd4` focus rings ensures that `npm run lint:design` will strictly pass with 0 violations.

---

## 3. Caveats

1. **Nested Group Transformation**: When a selected item is a grouped container (`isContainerNode`), `layoutSelection` in `editor_engine_groups.js` handles descendant shifts via `combinedBounds`. The measurement function in the inspector should similarly handle container bounds if groups are selected as single units.
2. **Single Layer Selection**: Single layer selection ($k = 1$) does not display spacing distribution or Gap controls since gap requires at least 2 layers.
3. **Live Scrub Commit Optimization**: For large documents with many nodes, scrubbing generates updates rapidly. The inspector should use `ScrubField`'s built-in debounced/gesture boundary commit (`onCommit`) so that history records a single snapshot per drag gesture.

---

## 4. Conclusion

The Inspector alignment section (`align_section.jsx`) can cleanly integrate both "Distribute Horizontal/Vertical Spacing" buttons and an interactive Gap input box:
1. Thread `selectedNodes` from `properties_panel_sections.jsx` into `AlignSection`.
2. Add `measureSelectionGaps` and `setGapNodes` to `src/canvas/editor/align_ops.js`.
3. Add a dedicated Row 3 in `AlignSection` for $k \ge 2$ layers featuring an axis toggle (`H` / `V`) defaulting to dominant axis and a `ScrubField` bound to `setGapNodes`.
4. Update i18n dictionaries in `extended-en.js` and `extended-zh.js` for bilingual parity and Figma-standard tooltips.
5. Strict adherence to VOO's Design tokens ensures 0 violations on `npm run lint:design`.

Detailed architectural documentation, algorithms, and code blueprints are available in `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/report.md`.

---

## 5. Verification Method

1. **Inspect Report**:
   ```bash
   cat /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/report.md
   ```
2. **Verify Design Token Compliance**:
   ```bash
   npm run lint:design
   ```
   (Must output `design: clean — 797 file(s) match Design.md` with 0 violations).
3. **Run Existing Test Suite**:
   ```bash
   npm test
   ```
   (Must pass 54/54 test suites and 540/540 unit tests).
