# DISPATCH — E2E Test Writer (Performance & Quality Architecture)

## Working Directory
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/test_writer_e2e`

## Mandatory Reference Documents
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST READ FIRST)
- `/Users/tt/teamwork_projects/voo_design/PROJECT.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All tests must be genuine. DO NOT create trivial or vacuous assertions. Tests must exercise actual canvas engine logic and verify performance, bounding accuracy, and memory management under realistic workloads.

## Objective & Scope of Changes
You are the E2E Test Writer for the VOO Design Performance Architecture Upgrade.
Your scope:
1. Create `TEST_INFRA.md` at project root following the 4-tier methodology:
   - Tier 1: Feature Coverage (>=5 test cases per feature for core performance capabilities)
   - Tier 2: Boundary & Corner Cases (empty canvas, single node, 1000+ nodes, extreme zoom 0.01x to 64x, extreme coordinates)
   - Tier 3: Cross-Feature Combinations (spatial culling + snapping + layer caching + undo/redo)
   - Tier 4: Real-World Workload Scenarios (massive 1000-node UI mockup with cards, text, drop shadows, continuous pan and drag)
2. Implement comprehensive, production-grade test suites in `tests/unit/`:
   - `tests/unit/performance_e2e_culling_snapping.test.js`:
     Tests `SpatialIndex` accuracy with `nodeVisualAABB` effect padding, 1000+ node culling correctness, boundary edge cases, and offscreen caching.
   - Tests for neighborhood snapping candidate query vs full scene scan.
   - Tests for LRU bitmap cache byte budgeting and eviction.
3. Publish `TEST_READY.md` at project root summarizing test runner command, test breakdown, and feature checklist.

## Exclusive Write Ownership
You exclusively own and may edit/create:
- `TEST_INFRA.md` (project root)
- `TEST_READY.md` (project root)
- `tests/unit/performance_e2e_culling_snapping.test.js` (or related test files in `tests/unit/`)
DO NOT modify implementation files under `src/canvas/`.

## Verification Requirements
Run your tests using `npx vitest run <your_test_files>` and document passing results in your `handoff.md`.

## Deliverables
- `TEST_INFRA.md` at project root
- `TEST_READY.md` at project root
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/test_writer_e2e/handoff.md`
- Send completion message to caller when done.
