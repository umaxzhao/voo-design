# Task: Canvas performance benchmark harness (NEW FILES ONLY)

You are in `/workspace/wt-perf` on branch `opencode/canvas-perf` (voo-design, React18/Vite/vitest/CanvasKit).

## Goal
Build a reproducible benchmark that measures canvas engine performance at 1k / 5k / 20k nodes (plus image-heavy docs), records BEFORE numbers now, and writes results to disk so later commits can add AFTER numbers.

## Constraints
- Create NEW files only under `tests/unit/` and optionally `docs/` and `scripts/`. Do NOT modify existing production source in this pass.
- Do NOT touch properties-panel UI, electron workspace/file-management, welcome/dashboard.
- Do NOT delete vendor/dist/build files.
- Prefer vitest (node env) measuring pure engine modules already in the repo — no browser required for the primary bench.
- Optional secondary script may use playwright/chromium IF already available; otherwise skip browser FPS and document that gap.
- Keep tests deterministic; use `performance.now()`; print a markdown table.

## What to measure (per node count 1000, 5000, 20000)
1. Document build time (synthetic nodes: mix of rect/ellipse/path/image stubs)
2. Spatial index build (`buildSpatialIndex` / `SpatialIndex` / `syncSpatialIndex` — use whatever the codebase exports from `src/canvas/editor/spatial_index.js` and `viewport_culling.js`)
3. Viewport cull: 100 consecutive pan shifts — avg ms / cull (reuse patterns from `tests/unit/challenger_spatial_viewport_stress.test.js` and `m4_performance_gate.test.js`)
4. Hit-test: 1000 `nodeAtPoint` queries — avg µs (from `doc_ops_nodes.js`)
5. Batch `updateNodes` preview path vs sequential `updateNode` (measure both) — move 50 selected nodes for 60 ticks
6. Simulated pan/zoom matrix cycles (camera math) — 1500 iterations
7. Memory proxy: `process.memoryUsage().heapUsed` delta before/after index+cull (MB)

Also one **image-heavy** case: 500 image nodes + 4500 rects at 5k total.

## Deliverables
1. `tests/unit/canvas_perf_harness.js` — helpers to build docs, run metrics, format table
2. `tests/unit/canvas_perf_benchmark.test.js` — vitest suite that:
   - Runs the metrics
   - Asserts soft gates (generous so CI doesn't flake; e.g. 20k index build < 500ms, cull < 50ms, hit-test avg < 1ms)
   - Writes `docs/canvas-perf-results.json` and updates `docs/canvas-perf-benchmark.md` with a BEFORE table
3. `docs/canvas-perf-benchmark.md` — methodology + BEFORE table + empty AFTER column placeholders
4. Add npm script `"bench:canvas": "vitest run tests/unit/canvas_perf_benchmark.test.js"` in package.json ONLY if needed (minimal edit)

## After writing
Run: `npx vitest run tests/unit/canvas_perf_benchmark.test.js`
Fix until green. Do NOT commit (orchestrator commits).

Study existing tests first:
- tests/unit/challenger_spatial_viewport_stress.test.js
- tests/unit/m4_performance_gate.test.js
- tests/unit/spatial_index.test.js
- src/canvas/editor/spatial_index.js, viewport_culling.js, doc_ops_nodes.js, editor_engine_node_ops.js
