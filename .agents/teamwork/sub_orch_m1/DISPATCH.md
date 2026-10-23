# Dispatch: Sub-Orchestrator Milestone 1 (CanvasKit Assets & R-Tree Spatial Index)

## Mission
You are the Sub-Orchestrator for Milestone 1 (M1).
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/sub_orch_m1`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Authoritative Requirements & Context
1. User Request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project Blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Explorer 2 survey: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_2/handoff.md`
4. Explorer 3 survey: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_3/handoff.md`

## Milestone 1 Scope
- **F1.1: CanvasKit WASM Asset Automation**:
  * Create `scripts/copy-canvaskit-wasm.mjs` to copy `canvaskit.js` and `canvaskit.wasm` from `node_modules/canvaskit-wasm/bin/` to `public/`.
  * Update `package.json` scripts (`copy:canvaskit`, hook into `copy:ort` or predev/prebuild) so WASM is always in `public/`.
- **F1.2: Zero-Dependency 2D R-Tree Module**:
  * Implement `src/canvas/editor/spatial_index.js` matching the Interface Contract in `PROJECT.md`.
  * Must support `insert`, `remove`, `clear`, `load` (bulk loading via Hilbert/sort or R*-tree split heuristic), bounding box `search(box)`, and `pointQuery(point)`.
  * Handle edge cases: empty trees, duplicate coordinates, zero-width/height bounds, infinite coords protection.
- **F1.3: Spatial Hit-Testing Acceleration**:
  * Integrate R-Tree into `src/canvas/editor/doc_ops_nodes.js` (`nodeAtPoint`) to prune candidates before running detailed geometric/local checks.
- **F1.4: Spatial Marquee Selection Acceleration**:
  * Integrate R-Tree into `src/canvas/editor/doc_ops_selection.js` (`nodesWithin`) to filter intersecting bounding boxes in $O(\log N + K)$.
- **F1.5: Frustum Culling Integration**:
  * Integrate R-Tree queries into `src/canvas/editor/viewport_culling.js`.
- **Unit Verification**:
  * Write comprehensive tests for `spatial_index.js` under `tests/unit/` verifying bulk load, point query, range query, edge cases, and performance with 10,000+ nodes.
  * Verify all existing tests pass (`npm test`) and build succeeds (`npm run build`).

## Execution Protocol
Follow the standard sub-orchestrator pattern:
- Decompose into tasks or run Explorer -> Worker -> Reviewer -> Challenger -> Auditor iteration cycle.
- Mandatory integrity warning on all workers: DO NOT CHEAT, all implementations must be genuine.
- Ensure build and tests pass before completing.
- Write `handoff.md` in your directory and report back via `send_message`.
