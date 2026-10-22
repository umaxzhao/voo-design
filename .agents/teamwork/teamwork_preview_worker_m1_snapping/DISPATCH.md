# Dispatch: Milestone 1 Worker (Smart Spacing Guides & Gap Snapping)

## Mission
Implement professional Smart Spacing Guides & Gap Snapping in VOO Design.

## Working Directory
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1_snapping`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative Documentation & Specifications
1. **MANDATORY**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read section `## 2026-10-20T17:49:22Z` first!)
2. Master Project Blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Snapping Survey Report: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/report.md`
4. Snapping Handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/handoff.md`

## File Ownership
- You exclusively own:
  - `src/canvas/editor/scene_snapping.js`
  - `src/canvas/editor/chrome_stage_overlays.js`
- DO NOT touch:
  - `src/canvas/editor/align_ops.js` (owned by M2)
  - `src/canvas/components/editor_properties/**` (owned by M3)
  - Any test files (owned by Test Writer)

## Key Implementation Requirements
1. **`src/canvas/editor/scene_snapping.js`**:
   - Upgrade equidistant snapping logic to support:
     a. Collinear append gap snapping (snap to equal distance outside: left/right, above/below).
     b. In-between insertion gap snapping (when dragging a node between two stationary nodes, snap when left gap equals right gap or top gap equals bottom gap).
     c. Perpendicular band proximity filtering (only consider sibling boxes that share a perpendicular band/axis overlap, avoiding false matches across distant areas).
   - Dual guide emission:
     - Keep `{ type: "v", pos }` or `{ type: "h", pos }` to preserve backwards compatibility with existing tests.
     - Add structured gap guide objects:
       `{ type: "gap_h", x1, x2, y, gap, label: `${Math.round(gap)}px`, pos: snappedCoord }`
       `{ type: "gap_v", y1, y2, x, gap, label: `${Math.round(gap)}px`, pos: snappedCoord }`
       (or `{ type: "gap", axis: "h"|"v", spans: [...], gap, label }` as defined in the survey report).

2. **`src/canvas/editor/chrome_stage_overlays.js`**:
   - In `drawGuides(ctx, guides, viewport, dpr)`:
     - Handle the new gap guide types:
       - Vibrant magenta/purple hairline (e.g. `#e056fd` or `#ff3b77`, line width 1px).
       - Perpendicular end tick marks (8px T-bar tick marks at x1/x2 or y1/y2).
       - Centered rounded pill badge displaying the gap value (e.g. `16px`) with crisp background pill and high-contrast white text.
     - Note coordinate space: `drawGuides` is invoked in screen coordinates scaled by DPR. Transform world coordinates to screen via `Math.round(worldCoord * viewport.zoom + pan) + 0.5`.

3. **Lifecycle & Bypass Integrity**:
   - Snapping bypass when `Cmd/Ctrl` is held or global snapping is disabled (`editor_pointer_move.js` already checks this; ensure `scene_snapping.js` returns clean empty guides when disabled).
   - Instant cleanup on mouse release (`api.setGuides([])` on pointerup).

4. **Verification & Standards**:
   - Run `npx vitest run tests/unit/smart_snapping_guides.test.js tests/unit/snapping_controller.test.js tests/unit/snapping_e2e.test.js` to ensure 100% existing tests pass.
   - Run `npm run lint:design` to ensure 0 violations.
   - Update `progress.md` with timestamp after each step.
   - Write comprehensive `handoff.md` in your working directory and notify the orchestrator.


## 2026-10-20T22:13:20Z
[Message] timestamp=2026-10-20T22:13:20Z sender=141136ac-6570-4c53-bb16-6e170b72d2dd priority=MESSAGE_PRIORITY_HIGH content=You are the Milestone 1 Worker for VOO Design's Smart Spacing & Gap project.
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1_snapping
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read your detailed instructions in:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1_snapping/DISPATCH.md
And MANDATORY user requirements:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## 2026-10-20T17:49:22Z)
And survey report:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/report.md

Your responsibilities:
1. Initialize progress.md with timestamp.
2. Implement in-between and collinear equidistant gap snapping in src/canvas/editor/scene_snapping.js with perpendicular band filtering and dual guide emission.
3. Implement magenta spacing guide rendering, 8px perpendicular tick marks, and measurement pill badges in src/canvas/editor/chrome_stage_overlays.js.
4. Verify snapping tests via npx vitest run tests/unit/smart_snapping_guides.test.js tests/unit/snapping_controller.test.js tests/unit/snapping_e2e.test.js.
5. Verify design lint via npm run lint:design.
6. Write handoff.md in your working directory and notify the orchestrator via send_message.
