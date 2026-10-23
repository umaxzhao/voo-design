# BRIEFING — 2026-10-21T23:31:00Z

## Mission
Investigate Requirement 3 (Memory, Texture & Undo/Redo Optimization) and Requirement 4 (Verification & Deployment Infrastructure) to produce an in-depth survey and implementation roadmap.

## 🔒 My Identity
- Archetype: explorer
- Roles: [explorer, investigator, synthesist]
- Working directory: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3
- Original parent: e373ed8c-e5d7-49c6-b3e6-deef122fd1dc
- Milestone: survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Scope: R3 (Bitmap/Texture cache, gl_spatial texture deallocation, undo/redo contracts & memory footprint) and R4 (Vitest/E2E test suite baseline, linting, deploy scripts)
- Write report to handoff.md in working directory
- Deploy target fixed to `la` (103.114.160.86), never `pt`

## Current Parent
- Conversation ID: e373ed8c-e5d7-49c6-b3e6-deef122fd1dc
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `src/canvas/editor/bitmap_cache.js`
  - `src/canvas/editor/gl_spatial.js`
  - `src/canvas/editor/gl_adjustments_pipeline.js`
  - `src/canvas/editor/gl_adjustments_textures.js`
  - `src/canvas/editor/image_pyramid.js`
  - `src/canvas/editor/editor_engine.js`
  - `src/canvas/editor/editor_history.js`
  - `src/canvas/editor/editor_engine_history_state.js`
  - `src/canvas/undo-action-contracts.js`
  - `src/canvas/editor/editor_undo_actions.js`
  - `src/shared/editor-document-contract.js`
  - `src/canvas/editor/viewport_culling.js`
  - `src/canvas/editor/chrome_draw.js`
  - `src/canvas/editor/chrome_layers.js`
  - `scripts/check-design.mjs`
  - `scripts/deploy-editor.sh`
  - `package.json`, `vite.config.js`
  - Test suites in `tests/`
- **Key findings**:
  1. `bitmap_cache.js` uses item count `BITMAP_CACHE_MAX = 128` without memory/byte budgeting. 128 2048x2048 images consume > 2GB of memory.
  2. `refreshBitmapCachePins()` scans ALL 50-100 snapshots on every edit with `JSON.parse`, pinning all historical images and preventing LRU eviction while causing 100-300ms frame lags.
  3. `editor_engine.js:118` initializes `createBitmapCache()` with NO `onEvict` callback, orphaning WebGL textures in `glAdjustments` and pyramid LOD tiers.
  4. Full document tree deep-cloning and `JSON.stringify` on every commit destroys structural sharing, multiplying memory consumption 50x.
  5. 3 Design.md lint violations in `src/canvas/components/editor_toolbar.jsx` (`shadow-sm` instead of `shadow-pop`).
  6. Existing test baseline has 101 test files / 1367 tests. 1 flaky race condition in `adversarial_welcome_dashboard_challenge.test.js:68` due to file sorting order under parallel load. Zero tests currently cover texture deallocation, byte-based LRU, or diff patches.
  7. Production build (`npm run build`) succeeds cleanly in 5.7s.
  8. Deployment script strictly targets `la` (`103.114.160.86`) to `/var/www/voo.run/editor/`.
- **Unexplored areas**: None within R3/R4 scope.

## Key Decisions Made
- Architected comprehensive 5-component report in `handoff.md` detailing exact architecture, bottlenecks, diff patch design, byte budgeting, and implementation roadmap.

## Artifact Index
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/handoff.md — Final survey report
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/progress.md — Liveness & progress tracker
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/BRIEFING.md — Persistent context
