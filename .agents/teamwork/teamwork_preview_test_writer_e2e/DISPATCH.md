# Dispatch for E2E Test Writer (Requirement-Driven Opaque-Box Test Suite)

## Mission
You are the E2E Test Writer for the VOO Design single-canvas and streaming import project.
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_test_writer_e2e`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Mandatory Reading
1. Authoritative user request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Explorer 3 survey: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_3/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership
You exclusively own and may create or modify the following files:
- `TEST_INFRA.md`
- `TEST_READY.md`
- `tests/unit/e2e_acceptance_criteria.test.js`
- Any other new test files under `tests/unit/` or `tests/e2e/`

Do NOT edit any implementation code in `src/`.

## Scope & Deliverables
1. **Create `TEST_INFRA.md`** at project root:
   - Document test philosophy, feature inventory, 4-tier methodology, and coverage thresholds.
2. **Implement 4-Tier Test Suite**:
   - **Tier 1 (Feature Coverage, >=5 tests per feature)**:
     * R1: Streaming import, stage progression, cancellation, chunk emission, error handling.
     * R2: Unified canvas viewport, single surface context, frame topology preservation, artboard matrix transforms.
     * R3: R-Tree spatial index queries, visible viewport culling, hit-testing accuracy.
     * R4: Skia WASM asset presence, surface rendering, batching/caching behavior.
   - **Tier 2 (Boundary & Corner Cases, >=5 tests per feature)**:
     * Empty files, 0-size rects, negative coordinates, massive coordinates (>100,000px), corrupted archives, single-layer vs 10,000-layer trees.
   - **Tier 3 (Cross-Feature Combinations, pairwise coverage)**:
     * Streaming import + concurrent pan/zoom.
     * Multi-artboard layout + R-Tree frustum culling.
     * Selection marquee across artboard boundaries.
   - **Tier 4 (Real-World Workload Scenarios, >=5 scenarios)**:
     * Large design system with 1,000+ component instances.
     * Deeply nested layer hierarchy with vector paths and shadows.
     * High-frequency rapid pan/zoom stress test.
3. **Publish `TEST_READY.md`**:
   - Once all test files are implemented and verified to run with `npm test`, create `TEST_READY.md` summarizing tier counts and test runner command.
4. **Run Verification**:
   - Run `npm test` to ensure existing and new tests pass cleanly.

## Output
Write your handoff report to:
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_test_writer_e2e/handoff.md`
Report back via `send_message` when done.


## 2026-10-20T19:05:23Z
You are E2E Test Writer (Requirement-Driven Test Suite).
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_test_writer_e2e
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY FIRST STEP:
Read the authoritative user request at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
Also read your complete dispatch at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_test_writer_e2e/DISPATCH.md
And read the project blueprint:
/Users/tt/teamwork_projects/voo_design/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
1. Create TEST_INFRA.md at project root with complete 4-tier methodology, feature checklist, and thresholds.
2. Implement 4-tier test suite in tests/unit/e2e_acceptance_criteria.test.js (and additional test files if needed) covering:
   - Tier 1: Feature Coverage (>=5 tests per feature across R1-R4)
   - Tier 2: Boundary & Corner Cases (>=5 tests per feature)
   - Tier 3: Cross-Feature Interactions (pairwise combinations)
   - Tier 4: Real-World Application Workloads (complex documents, 10,000+ nodes, rapid viewport changes)
3. Verify tests pass with `npm test`.
4. Publish TEST_READY.md at project root.
5. Write handoff.md and send message back to orchestrator.


## 2026-10-20T22:10:25Z
**Context**: Quota reset period has passed and system is fully available.
**Content**: Please resume execution of E2E Testing Track.
**Action**: Create TEST_INFRA.md, implement the 4-tier requirement-driven test suite, publish TEST_READY.md, and report back when complete.
