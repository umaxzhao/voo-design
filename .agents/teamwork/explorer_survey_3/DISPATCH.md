# DISPATCH — Explorer Survey 3 (R3: Memory, Texture & Undo/Redo & R4: Verification Infra)

## Objective
Investigate the existing codebase for Requirement 3: Memory, Texture & Undo/Redo Optimization, and Requirement 4: Verification & Deployment Infrastructure.
Specifically explore:
1. `src/canvas/editor/bitmap_cache.js`, `src/canvas/editor/gl_spatial.js`, and texture management in WebGL/2D canvas rendering.
2. How bitmap/texture caches currently store, track, and evict images and rendered offscreen surfaces (LRU policy, memory limits, WebGL texture deallocation `gl.deleteTexture`, garbage collection triggers).
3. How undo/redo history is currently implemented (e.g. in `src/canvas/undo-action-contracts.js`, document state management, history stacks). Is it deep cloning the full tree on every action? How can structural sharing or diff-based patches be integrated?
4. Existing test suites (`tests/unit/`, Vitest configuration, coverage, number of existing test suites/tests).
5. Existing linting rules (`scripts/check-design.mjs`, `npm run lint:design`) and build/deploy script (`scripts/deploy-editor.sh`).
6. Identify gaps between current implementation and R3/R4 requirements.
7. Recommend concrete technical design, file boundaries, exports, and implementation steps.

## Reference Files & Documents
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST READ)
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/orchestrator_11/DISPATCH.md`
- `src/canvas/editor/bitmap_cache.js`
- `src/canvas/editor/gl_spatial.js`
- `src/canvas/undo-action-contracts.js`
- `tests/`
- `scripts/deploy-editor.sh`

## Deliverable
Write your findings to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/handoff.md` with sections:
- Executive Summary
- Bitmap & Texture Cache Architecture & LRU Strategy
- Undo/Redo Snapshot Mechanism & Structural Sharing / Diff Patches
- Test Suites & Verification / Deployment Analysis
- Concrete Recommendations & Implementation Roadmap for R3 and R4
Update `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/progress.md` during execution.
Send completion message back to orchestrator.


## 2026-10-21T23:23:26Z
You are explorer_survey_3.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3.
You MUST read:
1. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
2. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/DISPATCH.md

Your task is to explore and analyze the codebase for Requirement 3: Memory, Texture & Undo/Redo Optimization, and Requirement 4: Verification & Deployment Infrastructure.
Investigate `src/canvas/editor/bitmap_cache.js`, `src/canvas/editor/gl_spatial.js`, `src/canvas/undo-action-contracts.js`, test suites in `tests/`, and deploy scripts.
Write your detailed report to /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_3/handoff.md and update progress.md.
When finished, send a message to the orchestrator (caller) with a concise summary and path to your handoff.md.
