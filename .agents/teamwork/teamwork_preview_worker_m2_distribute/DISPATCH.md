# Dispatch: Milestone 2 Worker (Distribute Spacing Engine & Math)

## Mission
Implement professional Distribute Spacing mathematical algorithms, boundary-anchored equal-gap distribution, and spacing measurement APIs in VOO Design.

## Working Directory
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m2_distribute`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative Documentation & Specifications
1. **MANDATORY**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read section `## 2026-10-20T17:49:22Z` first!)
2. Master Project Blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Distribute Ops Survey Report: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_align/report.md`
4. Distribute Ops Handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_align/handoff.md`

## File Ownership
- You exclusively own:
  - `src/canvas/editor/align_ops.js`
- DO NOT touch:
  - `src/canvas/editor/scene_snapping.js` (owned by M1)
  - `src/canvas/editor/chrome_stage_overlays.js` (owned by M1)
  - `src/canvas/components/editor_properties/**` (owned by M3)
  - Any test files (owned by Test Writer)

## Key Implementation Requirements
1. **`src/canvas/editor/align_ops.js`**:
   - **Distinguish Distribute Centers vs Distribute Spacing**:
     - Retain `distributeSelection(items, axis)` for center-to-center distribution ($C_{i+1} - C_i = \text{const}$).
     - Upgrade/implement `distributeSpacingSelection(items, axis)` (or refine `tidyUpSelection` and export `distributeSpacingNodes`):
       * Strictly pin the outer two items: $A_0.x' = X_0$ and $A_{N-1}.x' = X_{N-1}$ (for horizontal; similar for vertical).
       * Exact equalized gap: $g = (X_{N-1} - X_0 - \sum_{i=0}^{N-2} W_i) / (N - 1)$.
       * Closed-form intermediate item positioning to eliminate floating-point rounding drift:
         $P_k = X_0 + \sum_{j=0}^{k-1} W_j + k \cdot g$ rounded with `Math.round(P_k)`.
       * Robustly handle mixed sizes, negative gaps (equal overlap), degenerate selections ($N < 3$ returns unchanged).
   - **Custom Gap Setting API**:
     - Implement `applyCustomGapToItems(items, axis, gap)`:
       * For $N \ge 2$, anchor first item $A_0$, and position each subsequent item:
         $P_i = P_0 + \sum_{j=0}^{i-1} W_j + i \cdot \text{gap}$.
     - Export `distributeSpacingNodes(nodes, axisOrOptions)`:
       * Supports `axisOrOptions` as string (`"horizontal"` or `"vertical"`) for standard equal-spacing distribution, or object `{ axis: "horizontal"|"vertical", gap: number }` for custom gap setting.
   - **Measurement API**:
     - Implement and export `measureSpacing(nodes, axis)`:
       * Computes `{ avgGap, minGap, maxGap, isEquidistant, dominantAxis }` for $N \ge 2$ nodes.
       * If axis is not specified, determines dominant axis by comparing spread.
   - **Undo/Redo & Engine Contract**:
     - Ensure patches returned by `distributeSpacingNodes` plug seamlessly into `layoutSelection` (which registers `"editor.layout.selection"` in history).

2. **Verification & Standards**:
   - Run `npx vitest run` to ensure all existing tests pass.
   - Run `npm run lint:design` to ensure 0 violations.
   - Update `progress.md` with timestamp after each step.
   - Write comprehensive `handoff.md` in your working directory and notify the orchestrator.


## 2026-10-20T22:13:20Z
[Message] timestamp=2026-10-20T22:13:20Z sender=141136ac-6570-4c53-bb16-6e170b72d2dd priority=MESSAGE_PRIORITY_HIGH content=You are the Milestone 2 Worker for VOO Design's Smart Spacing & Gap project.
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m2_distribute
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read your detailed instructions in:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m2_distribute/DISPATCH.md
And MANDATORY user requirements:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## 2026-10-20T17:49:22Z)
And survey report:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_align/report.md

Your responsibilities:
1. Initialize progress.md with timestamp.
2. Implement boundary-anchored equal-gap distribution algorithm in src/canvas/editor/align_ops.js (fixing outer 2 layers, closed-form intermediate positioning without rounding drift, negative gaps, mixed sizes).
3. Implement custom gap setting API (applyCustomGapToItems / distributeSpacingNodes with { axis, gap }) for N >= 2 items.
4. Implement spacing measurement API (measureSpacing).
5. Verify test suite via npx vitest run.
6. Verify design lint via npm run lint:design.
7. Write handoff.md in your working directory and notify the orchestrator via send_message.
