# DISPATCH — Worker M1: Viewport Culling & Layer Caching Engine

## Working Directory
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1`

## Mandatory Reference Documents
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST READ FIRST)
- `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1/handoff.md` (Full architectural survey & code analysis)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Scope of Changes
Implement Milestone 1 (Features 1–5 in `PROJECT.md`):
1. **Visual Effect Bounds (`nodeVisualAABB`)**:
   - In `src/canvas/editor/viewport_culling.js`, implement and export `nodeVisualAABB(node)`:
     Computes geometric AABB via `nodeAABB(node)`, then accurately expands by stroke width, drop shadow (blur * 2 + spread + Math.abs(offset)), outer glow, and layer blur.
   - Also export this helper and use it wherever visual bounds are needed.
2. **Correct Culling Effect Bypass in `viewport_culling.js`**:
   - In `buildCullableIds(nodes)`: remove the unconditional bypass for array effects (`if (Array.isArray(node.effects) && node.effects.length > 0) continue;`). Nodes with effects CAN and MUST be culled when outside the frustum. Only non-geometric or composite nodes (e.g. `clipTo` targets, adjustments, groups) should be handled specially.
   - In `buildSpatialIndex(nodes)`: index nodes using their `nodeVisualAABB(node)`.
3. **Offscreen Layer Cache (`src/canvas/editor/layer_cache.js`)**:
   - Create `src/canvas/editor/layer_cache.js`:
     Implements `createLayerCache({ maxEntries = 64, maxBytes = 64 * 1024 * 1024 } = {})`.
     Provides LRU OffscreenCanvas (or in-memory canvas) caching for pre-rendered static layers and unchanged groups.
     Keys by `node.id`, node property hash/version, and zoom tier.
     Provides `get(node, zoom, dpr)`, `set(node, canvas, zoom, dpr)`, `invalidate(nodeId)`, `clear()`.
4. **Frustum Culling in `chrome_draw.js`**:
   - In `src/canvas/editor/chrome_draw.js`, leverage `SpatialIndex` when available on the document (`doc.spatialIndex ?? doc._spatialIndex` or passed in options):
     Calculate `visibleRect = visibleWorldRect(viewport, canvas.width / dpr, canvas.height / dpr)`.
     Query `spatialIndex.search(visibleRect)` in $O(\log N + K)$ to obtain visible candidate IDs.
     Filter nodes efficiently so offscreen nodes skip expensive rendering and trigonometric projections.
     Ensure clipping chains and adjustments maintain visual correctness.
5. **Engine Integration**:
   - In `src/canvas/editor/editor_engine.js` / `editor_engine_document.js`: maintain an active `doc.spatialIndex` (built via `buildSpatialIndex(doc.nodes)` using `nodeVisualAABB`) so `chrome_draw.js` and hit testing can query it.

## Exclusive Write Ownership
You exclusively own and may edit:
- `src/canvas/editor/viewport_culling.js`
- `src/canvas/editor/layer_cache.js` (create new file)
- `src/canvas/editor/chrome_draw.js`
- `src/canvas/editor/editor_engine.js` (and/or `editor_engine_render.js`)
- Unit tests in `tests/unit/viewport_culling.test.js` or `tests/unit/layer_cache.test.js`

## Verification Requirements
You MUST run the following build and test commands and document exact outputs in your `handoff.md`:
1. `npx vitest run tests/unit/viewport_culling.test.js tests/unit/spatial_index.test.js tests/unit/challenger_spatial_viewport_stress.test.js`
2. `npx vitest run tests/unit/layer_cache.test.js` (create unit tests for layer cache)
3. Ensure all tests pass with exit code 0.

## Deliverables
- Write `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1/handoff.md` (Observation, Changes Made, Test Commands & Results, Verification).
- Send completion message to caller when done.


## 2026-10-21T23:33:31Z
You are worker_m1.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1.
You MUST read:
1. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
2. /Users/tt/teamwork_projects/voo_design/PROJECT.md
3. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1/DISPATCH.md
4. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1/handoff.md

Your task is to implement Milestone 1: Viewport Culling & Layer Caching Engine (Features 1–5).
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results.
Execute tests, verify passing status, write /Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1/handoff.md, and send a completion message to the orchestrator.
