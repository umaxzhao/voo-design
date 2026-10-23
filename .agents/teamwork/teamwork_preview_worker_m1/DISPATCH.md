# Dispatch for Worker M1 (CanvasKit Assets & R-Tree Spatial Index)

## Mission
Implement Milestone 1 (M1) of the VOO Design single-canvas and streaming import project.
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Mandatory Reading
1. Authoritative user request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Explorer 2 handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_2/handoff.md`
4. Explorer 3 handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_3/handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership
You exclusively own and may modify or create the following files:
- `scripts/copy-canvaskit-wasm.mjs`
- `package.json` (add copy:canvaskit script and hook into copy:ort / prebuild / predev)
- `src/canvas/editor/spatial_index.js`
- `src/canvas/editor/doc_ops_nodes.js`
- `src/canvas/editor/doc_ops_selection.js`
- `src/canvas/editor/viewport_culling.js`
- `tests/unit/spatial_index.test.js`
- `tests/unit/viewport_culling.test.js`

Do NOT edit any files outside this list.

## Implementation Details
1. **CanvasKit Asset Copy**:
   - Create `scripts/copy-canvaskit-wasm.mjs`: copy `canvaskit.js` and `canvaskit.wasm` from `node_modules/canvaskit-wasm/bin/` to `public/`.
   - Update `package.json` to execute `copy:canvaskit` in `predev` and `prebuild` alongside `copy:ort`.
   - Run `node scripts/copy-canvaskit-wasm.mjs` to ensure the assets are in `public/`.
2. **2D R-Tree Spatial Index (`src/canvas/editor/spatial_index.js`)**:
   - Implement a clean, zero-dependency 2D R-Tree class `SpatialIndex` conforming to `PROJECT.md § Interface Contracts`.
   - Methods: `constructor(maxEntries = 16)`, `insert(item)`, `remove(item)`, `clear()`, `load(items)` (bulk loading), `search(box)`, `pointQuery(point)`.
   - Handle edge cases: empty trees, duplicate coordinates, zero-width/height bounds, infinite coords protection.
3. **Spatial Hit-Testing (`src/canvas/editor/doc_ops_nodes.js`)**:
   - In `nodeAtPoint`, use `spatialIndex.pointQuery(point)` or spatial candidate bounding-box lookup to quickly eliminate non-candidate nodes before performing detailed transform checks. Fallback gracefully if no index is attached.
4. **Spatial Selection (`src/canvas/editor/doc_ops_selection.js`)**:
   - In `nodesWithin`, use `spatialIndex.search(rect)` to quickly retrieve overlapping nodes in $O(\log N + K)$ before geometric fine filtering.
5. **Frustum Culling (`src/canvas/editor/viewport_culling.js`)**:
   - Update culling utilities to leverage `spatialIndex.search(visibleRect)` to return only visible node IDs.
6. **Testing & Verification**:
   - Write comprehensive tests in `tests/unit/spatial_index.test.js`: bulk loading, insert, remove, clear, bounding box query, point query, negative coordinates, 10,000+ nodes benchmark.
   - Run `npm test` and ensure all 54+ test suites pass without regression.
   - Run `npm run build` and ensure build succeeds.

## Output
Write your handoff report to:
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1/handoff.md`
Report back via `send_message` when done.


## 2026-10-20T19:05:23Z
[Message] timestamp=2026-10-20T19:05:23Z sender=cfb4e057-d564-4239-bddc-8aa79de99f63 priority=MESSAGE_PRIORITY_HIGH content=You are Worker M1 (CanvasKit Assets & R-Tree Spatial Index).
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY FIRST STEP:
Read the authoritative user request at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
Also read your complete dispatch at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1/DISPATCH.md
And read the project blueprint:
/Users/tt/teamwork_projects/voo_design/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
Implement Milestone 1 (M1):
1. Create scripts/copy-canvaskit-wasm.mjs and update package.json so canvaskit.js and canvaskit.wasm are copied to public/. Run it to copy files.
2. Implement src/canvas/editor/spatial_index.js (clean, zero-dependency 2D R-Tree class matching PROJECT.md interface contract).
3. Integrate spatial index into src/canvas/editor/doc_ops_nodes.js (nodeAtPoint point queries).
4. Integrate spatial index into src/canvas/editor/doc_ops_selection.js (nodesWithin box queries).
5. Integrate spatial index into src/canvas/editor/viewport_culling.js.
6. Write comprehensive tests in tests/unit/spatial_index.test.js.
7. Run `npm test` and `npm run build` to verify all tests pass.
8. Write handoff.md and send message back to orchestrator.


## 2026-10-20T22:09:54Z
[Message] timestamp=2026-10-20T22:09:54Z sender=cfb4e057-d564-4239-bddc-8aa79de99f63 priority=MESSAGE_PRIORITY_HIGH content=**Context**: Quota reset period has passed and system is fully available.
**Content**: Please resume execution of Milestone 1 from your last progress step.
**Action**: Implement Task 1 through Task 8, verify with builds and tests, and report back when complete.
