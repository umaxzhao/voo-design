# Plan — orchestrator_3

## Objective
Deliver professional "Smart Spacing & Gap" (智能间距与空隙) system in VOO Design:
- R1: Smart Spacing Guides & Equidistant Gap Snapping
- R2: Distribute Spacing Engine & Math
- R3: Properties Panel & Gap Controls
- R4: Independent Vitest coverage, 100% npm test pass, 0 npm run lint:design violations, clean build, and deployment to `la` (103.114.160.86) with HTTP 200 liveness.

## Dual-Track Execution Strategy

### Track 1: E2E Testing Track
- Agent: `teamwork_preview_test_writer`
- Mission:
  1. Author `TEST_INFRA.md` outlining testing philosophy, feature inventory, 4 tiers of test cases.
  2. Implement comprehensive test suites in `tests/unit/smart_spacing_e2e.test.js` or `tests/unit/gap_snapping_overlays.test.js`, `tests/unit/distribute_spacing.test.js`, and `tests/unit/gap_property_controls.test.js`.
  3. Ensure Tiers 1-4 coverage (Feature coverage, Boundary & Corner, Pairwise Cross-Feature, Real-World Workload).
  4. Generate and publish `TEST_READY.md`.

### Track 2: Implementation Track
- **Milestone 1**: Smart Spacing Guides & Gap Snapping
  - File ownership: `src/canvas/editor/scene_snapping.js`, `src/canvas/editor/chrome_stage_overlays.js`
  - Implementation:
    - In-between gap detection, collinear append gap detection, perpendicular band proximity filter.
    - Dual guide emission: `{ type: "v"|"h", pos }` (for backward compatibility) + `{ type: "gap_h"|"gap_v", ... }` or `{ type: "gap", ... }`.
    - Canvas2D overlay rendering: magenta lines, 8px perpendicular ticks, measurement pill badges `${gap}px`.
    - Bypass on `Cmd/Ctrl` held or global snap disabled; instant cleanup on pointerup.
  - Gate: 2 Reviewers, 2 Challengers, 1 Forensic Auditor.

- **Milestone 2**: Distribute Spacing Engine & Math
  - File ownership: `src/canvas/editor/align_ops.js`
  - Implementation:
    - Segregate Distribute Centers vs Distribute Spacing.
    - Boundary-anchored equal-gap closed-form calculation: outermost items fixed, intermediate items evaluated via closed form without rounding drift.
    - Handle mixed sizes, negative free space (equal overlap), degenerate selections ($N \le 2$).
    - Implement `measureSpacing(nodes, axis)` and `distributeSpacingNodes(nodes, { axis, gap })`.
    - Atomic undo/redo history registration.
  - Gate: 2 Reviewers, 2 Challengers, 1 Forensic Auditor.

- **Milestone 3**: Properties Panel & Gap Controls
  - File ownership: `src/canvas/components/editor_properties/align_section.jsx`, `src/canvas/components/editor_properties/properties_panel_sections.jsx`, `src/canvas/i18n/extended-en.js`, `src/canvas/i18n/extended-zh.js`
  - Implementation:
    - Thread `selectedNodes` from `properties_panel_sections.jsx` into `AlignSection`.
    - Add explicit "Distribute Horizontal Spacing" and "Distribute Vertical Spacing" buttons with bilingual i18n and shortcuts `⌥⇧H` / `⌥⇧V`.
    - Add Gap control row with dominant-axis indicator and `ScrubField` numeric input for $N \ge 2$ layers.
    - Real-time average gap display and custom gap application.
    - Strict adherence to `Design.md` design tokens (0 lint:design violations).
  - Gate: 2 Reviewers, 2 Challengers, 1 Forensic Auditor.

- **Milestone 4**: Final Acceptance
  - Phase 1: 100% of E2E tests pass (Tiers 1-4).
  - Phase 2: Tier 5 Adversarial Coverage Hardening (Challenger -> Worker -> Reviewer).

- **Milestone 5**: Quality Verification & Production Deployment
  - Programmatic verification: `npm test` 100% pass, `npm run lint:design` clean (0 violations), `npm run build` succeeds cleanly.
  - Auto-deploy: `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh` to `la` (103.114.160.86).
  - Production liveness check: verify HTTP 200 on `https://la.voo.run/editor/`.
  - Final human report to Sentinel.
