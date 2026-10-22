# Dispatch: E2E Testing Track

## Mission
Design and implement the comprehensive 4-tier opaque-box test suite for the "Smart Spacing & Gap" (智能间距与空隙) system in VOO Design.

## Working Directory
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_test_writer_spacing_e2e`

## Authoritative Documentation & Specifications
1. **MANDATORY**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read section `## 2026-10-20T17:49:22Z` first!)
2. Master Project Blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Survey Reports:
   - Snapping & Overlays: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_snapping/report.md`
   - Distribute Ops: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_align/report.md`
   - Properties Panel: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_props/report.md`

## Testing Methodology (4 Tiers)
You must apply the systematic 4-tier methodology:
- **Tier 1 — Feature Coverage (>=5 test cases per feature)**:
  - F1: Equidistant gap detection (append right/left, append below/above, in-between insertion).
  - F2: Smart spacing overlay data structures (magenta guides, 8px perpendicular tick marks, measurement pill badges `${gap}px`).
  - F3: Snapping bypass & guide lifecycle (`Cmd/Ctrl` modifier bypass, magnetic snap toggle, pointer-up guide cleanup).
  - F4: Distribute spacing algorithm (horizontal & vertical equal gaps, outer two layers pinned, mixed-size layers).
  - F5: Spacing measurement & custom gap setting (`measureSpacing` and `distributeSpacingNodes({ axis, gap })`).
  - F6: Gap property controls & ScrubField interaction (average gap display, custom gap scrub/commit).
- **Tier 2 — Boundary & Corner Cases (>=5 test cases per feature)**:
  - Negative gaps (equal overlap), zero gap (touching edges), massive gaps.
  - Degenerate selections: $N = 0, 1, 2$ items for distribution vs explicit gap setting.
  - Concentric / identical coordinates, floating-point coordinate precision, high aspect ratio items.
  - Zoom scaling: canvas vs screen coordinate conversion for overlays across extreme zoom levels (0.1x to 10x).
- **Tier 3 — Cross-Feature Combinations (pairwise coverage)**:
  - Move/drag with gap snap while auto-layout is disabled vs enabled.
  - Distribute spacing followed by undo/redo transaction integrity.
  - Explicit gap setting on 2 items, then 3 items, then moving one item and checking gap snap.
- **Tier 4 — Real-World Application Scenarios (>=5 application cases)**:
  - Toolbar layout with mixed-size icons and text labels.
  - Card grid row equalized with custom 16px and 24px gaps.
  - Complex multi-column multi-row card alignment and gap normalization.

## Scope & File Ownership
- You own:
  - `/Users/tt/teamwork_projects/voo_design/TEST_INFRA.md`
  - `/Users/tt/teamwork_projects/voo_design/TEST_READY.md`
  - New test suites under `tests/unit/`, e.g.:
    - `tests/unit/smart_spacing_snapping.test.js`
    - `tests/unit/distribute_spacing.test.js`
    - `tests/unit/gap_property_controls.test.jsx` (or `.js`)
- DO NOT modify production implementation code (`src/canvas/**`). Test writer ONLY writes tests and documentation.

## Completion Criteria
1. Author `TEST_INFRA.md` at project root.
2. Implement test files with comprehensive assertions covering Tiers 1-4.
3. Verify test runner execution (`npx vitest run ...`).
4. Author and publish `TEST_READY.md` summarizing test counts and coverage per tier and feature.
5. Write `handoff.md` in your working directory and notify the orchestrator via `send_message`.


## 2026-10-20T22:13:20Z
You are the E2E Test Suite Architect & Writer for VOO Design's Smart Spacing & Gap project.
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_test_writer_spacing_e2e
Project root: /Users/tt/teamwork_projects/voo_design

Responsibilities:
1. Initialize your progress.md with timestamp.
2. Author /Users/tt/teamwork_projects/voo_design/TEST_INFRA.md following the project testing methodology (Tiers 1-4).
3. Implement comprehensive unit/e2e test suites covering Tiers 1-4 for snapping, overlays, distribution math, degenerate edge cases, and property controls.
4. Execute tests via npx vitest run and ensure they run cleanly.
5. Publish /Users/tt/teamwork_projects/voo_design/TEST_READY.md when tests are ready.
6. Write handoff.md in your working directory and notify the orchestrator via send_message.
