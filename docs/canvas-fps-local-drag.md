Canvas local drag repaint measurements (2026-10-23)
=================================================

Same harness, 1440×1000 viewport, 2-second samples, headless Chromium
156.0.8078.4 with SwiftShader, Canvas2D renderer. The original full baseline
is retained in the uncommitted `.fps-baseline.txt`; the final unprofiled
full-sequence run is in the uncommitted `.fps-after.txt`.

| Nodes | Pan before → after | Zoom before → after | Drag before → after |
| --- | --- | --- | --- |
| 1,000 | 36.96 → 40.00 | 10.78 → 12.38 | 7.56 → 18.20 |
| 5,000 | 9.55 → 13.50 | 9.34 → 11.22 | 6.24 → 23.31 |
| 20,000 | 8.70 → 10.24 | 7.76 → 8.23 | 8.03 → 16.52 |

Drag improves 2.4× / 3.7× / 2.1× respectively. Pan/zoom rendering is unchanged;
their differences should be treated as run variability on this shared machine.
The 60 FPS goal remains unmet in the full sequence. Optimized drag-only runs
measured 43.33 and 59.51 FPS; these are diagnostic runs, not replacements for
the comparable full-sequence table. A profiled full sequence measured 21.43 FPS
for 20k drag. The spread is material, so a single best result is misleading.

The bottleneck and change
-------------------------

A CDP CPU profile of the original renderer's 20k drag attributes 2,478.85 ms
of 3,498.43 ms sampled wall time (71%) to `drawCachedStage`. Native canvas
`save`/`restore` calls account for 2,101.05 ms and `drawImage` for 228.72 ms;
surface creation/painting accounts for 850.75 ms inclusive. These are nested
costs and must not be summed. Canvas native calls can include deferred raster
work, so this is evidence of rendering/compositing cost, not evidence that
JavaScript state-stack bookkeeping itself takes seconds. React rendering
also appears (562.44 ms inclusive), but the cache/render stack dominates.

Code inspection confirms that the old local drag path clears the entire
stage and composites two full-stage surfaces around the moving rectangle.
For small valid damage, the cache now delegates to the existing clipped
renderer instead. That renderer queries the spatial index for the union of
old/new bounds, then repaints intersecting rectangles in painter order.
Camera/split surfaces are released when switching to local repaint. Large
damage and cases without engine-validated damage retain the existing paths.
The engine already checks viewport, DPR, stage size, selection and render
version before supplying damage; the optimization preserves those checks.

The optimized 59.51 FPS drag-only profile attributes 209.36 ms of 2,371.19 ms
to `drawCachedStage`. Remaining CPU work includes `syncSpatialIndex`,
`previewDirtyRect`, rectangle iteration and immutable document updates.
These still scan node arrays; this change does not claim to eliminate all
whole-document work. Text shaping and worker rendering are unchanged.

Profiling is isolated to the largest drag sample through `VOO_FPS_PROFILE`.
The harness writes the raw profile immediately after capture and reports
self/inclusive sampled wall time with the new summary helper. For example:

```
VOO_FPS_NODES=20000 VOO_FPS_SCENARIOS=drag VOO_FPS_PROFILE=/tmp/drag.cpuprofile flock /tmp/voo-e2e.lock npm run test:e2e:fps
```

The original renderer was profiled from a source snapshot with its unchanged
stage cache. That diagnostic run measured 2.34 FPS and then failed the new
opaque-overlap pixel check; it is not substituted for the saved baseline.
Raw profiles remain in `/tmp/fps3-baseline-original.cpuprofile` (original)
and `/tmp/fps3-drag-optimized.cpuprofile` (optimized).

Validation
----------

The final full benchmark passed exact preview-versus-full-render pixel
comparisons for opaque and translucent overlapping rectangles and selection
handles. The original split-layer path fails the new opaque comparison.
Unit coverage verifies small-damage delegation without surface allocation,
camera surface release, large-damage fallback, and CPU sample attribution.

`npx vitest run --maxWorkers=2 --minWorkers=1` was run. It reported 197 passing
files, 2,254 passing tests, nine failures and six worker errors under contention.
Failures include the known contextual-island dispatch and three Electron
bridge tests, plus timeouts in spatial/CLI stress and single-canvas integration.
An isolated rerun of those stress/integration files plus the two changed test
files passed all five files / 56 tests. No workspace/file-management code was
changed. All browser runs used `/tmp/voo-e2e.lock`; the harness closes its browser
and terminates its own Vite process in `finally`.
