# Dispatch: Milestone 3 Worker (Properties Panel & Gap Controls)

## Mission
Implement Inspector Align Section Gap Controls, dominant-axis detection, ScrubField numeric input, prop threading, and i18n in VOO Design.

## Working Directory
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m3_props`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative Documentation & Specifications
1. **MANDATORY**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read section `## 2026-10-20T17:49:22Z` first!)
2. Master Project Blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Properties Survey Report: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/report.md`
4. Properties Handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/handoff.md`
5. Test Readiness & Tests: `/Users/tt/teamwork_projects/voo_design/TEST_READY.md`, `tests/unit/align_section.test.jsx`, `tests/unit/gap_property_controls.test.jsx`

## File Ownership
- You exclusively own:
  - `src/canvas/components/editor_properties/align_section.jsx`
  - `src/canvas/components/editor_properties/properties_panel_sections.jsx`
  - `src/canvas/i18n/extended-en.js`
  - `src/canvas/i18n/extended-zh.js`
- DO NOT touch:
  - `src/canvas/editor/align_ops.js` (owned by M2)
  - `src/canvas/editor/scene_snapping.js` (owned by M1)
  - `src/canvas/editor/chrome_stage_overlays.js` (owned by M1)
  - Test files (owned by Test Writer)

## Key Implementation Requirements
1. **Prop Threading in `src/canvas/components/editor_properties/properties_panel_sections.jsx`**:
   - In `<PropertiesPanelSections>`, pass `selectedNodes={selectedNodes}` into `<AlignSection count={selectionCount} onLayout={onLayout} selectedNodes={selectedNodes} />`.

2. **AlignSection Upgrades in `src/canvas/components/editor_properties/align_section.jsx`**:
   - Accept `selectedNodes = []` in props (and in `propTypes`).
   - Add explicit Distribute Horizontal Spacing and Distribute Vertical Spacing buttons with updated i18n tooltips and Figma shortcuts `⌥⇧H` / `⌥⇧V`.
   - When `count >= 2`, render Row 3:
     - Axis toggle group (`horizontal` / `vertical`) with `GapAxisIcon` or similar, auto-defaulting to dominant axis (via `measureSpacing(selectedNodes)` or spread comparison).
     - Interactive `ScrubField` bound to `setGapNodes` via `onLayout(setGapNodes, { axis, gap })`:
       * Prefix: `t("editor.props.gap")` (e.g. "Gap" / "间距")
       * Current value: measured average gap (or user-adjusted value)
       * Support direct keyboard input and drag scrubbing
       * Support zero (`0`) and negative values (e.g. `-8` for overlapping stacks)
       * Design tokens: `rounded-xl`, `bg-white/[0.06]` or `bg-neutral-800`, `text-[10px]` / `text-[11px]`, `#a7ffd4` mint focus ring.
   - Zero violations on `npm run lint:design`.

3. **i18n Updates in `src/canvas/i18n/extended-en.js` and `src/canvas/i18n/extended-zh.js`**:
   - Ensure keys exist:
     - `editor.props.distribute.horizontal`: "Distribute horizontal spacing (⌥⇧H)" / "水平等间距均分 (⌥⇧H)"
     - `editor.props.distribute.vertical`: "Distribute vertical spacing (⌥⇧V)" / "垂直等间距均分 (⌥⇧V)"
     - `editor.props.gap`: "Gap" / "间隙" (or "间距")
     - `editor.props.gapHorizontal`: "Horizontal gap" / "水平间距"
     - `editor.props.gapVertical`: "Vertical gap" / "垂直间距"

4. **Verification & Standards**:
   - Run `npx vitest run tests/unit/align_section.test.jsx tests/unit/gap_property_controls.test.jsx`.
   - Run `npm test` (all tests must pass 100%).
   - Run `npm run lint:design` (0 violations across all files).
   - Run `npm run build` (clean build).
   
## 2026-10-20T22:35:01Z
You are the Milestone 3 Worker for VOO Design's Smart Spacing & Gap project.
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m3_props
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
