Canvas camera raster tiles (2026-10-23)
======================================

This benchmark measures the Canvas2D editor engine with Chromium/SwiftShader,
a 1440×1000 browser viewport and the unchanged two-second pan/zoom/drag sequence.
It does not measure presented frames from the separate CanvasKit shared-scene
renderer. `.fps-baseline.txt` contains the unmodified run; `.fps-after.txt`
contains the final comparable run. Both logs stay uncommitted.

Evidence
--------

CPU profiles were captured before renderer changes for pan and zoom at 5,000
and 20,000 nodes. Raw files are
`/tmp/fps4-before-{5000,20000}-{pan,zoom}.cpuprofile`; summaries are in
`/tmp/fps4-profiles-before.txt`. Profiled runs are outside the comparable table.

The original 20k pan profile samples 2,647.73 ms: 2,411.74 ms idle,
197.03 ms unattributed program work and 35.77 ms inclusive in the editor render
stack. Zoom samples 2,262.87 ms: 1,982.64 ms idle, 246.21 ms program work and
34.02 ms in the render stack. The 5k render stacks total 33.55 ms pan and
9.16 ms zoom. These profiles do not support blaming JavaScript text shaping
or React for the rectangle fixture's low camera FPS. Native/deferred rendering
and scheduling lie outside their attribution.

The first tile-renderer compositor traces are in
`/tmp/fps4-trace-20000-{pan,zoom}.json`. Zoom records 495.8 ms in GPU raster
end/flush operations (164.9 ms maximum), versus 56.3 ms animation-frame JavaScript.
Pan records 335.4 ms in those flushes (208.5 ms maximum). Durations are nested;
do not sum them with enclosing GPU tasks. That isolated trial reports
39.52 / 13.59 FPS; it is not substituted for the final full sequence.

After eliminating whole-stage camera compositing, profiles in
`/tmp/fps4-presented-*` attribute only about 1 ms of the 20k zoom sample to
`drawTiles`, with 28.76 ms total in the editor render stack. GPU raster flushes
still consume 831.6 ms pan / 870.6 ms zoom, with individual stalls above 200 ms.
A diagnostic disabling CSS backdrop filters reaches 60 FPS pan / 40 FPS zoom
at 20k nodes (`/tmp/fps4-no-backdrop.txt`). This identifies live UI backdrop
rasterization as a major remaining cost, beyond content rasterization. That
diagnostic changes the UI and is not used as the final FPS table.

Implementation
--------------

Content uses 512×512 physical-pixel tiles with one-pixel bleed, keyed by
quarter-octave zoom bucket and tile X/Y. Pan reuses overlapping tiles and paints
newly exposed regions. Zoom freezes its source scale for the gesture, scaling
existing rasters rather than rerasterizing on each wheel update. Newly exposed
world regions can still require missing tiles.

On mounted, active 2D stages, stable tile canvases are compositor resources
under one shared CSS camera transform. They do not require submitting another
full-stage bitmap every frame. A separate sparse screen-space canvas carries
selection outlines/handles, including the size chip; complex overlays retain
full-stage bounds. Hidden or inactive fallback canvases never overlay Skia.
Unmounted canvases retain ordinary canvas compositing.

The hidden engine canvas is synchronized on demand for eyedropper sampling
using current document/camera state. Export paths retain authoritative rendering.
After the viewport's existing 400 ms quiet interval, the visible stage returns
to authoritative output at exact DPR. Settled snapshots copy physical pixels
1:1 and match the destination context's raster attributes. CPU/GPU antialiasing
can differ at fractional coordinates, so the destination backend is preserved.

Refinement warms one final-bucket tile per animation frame directly, without
redrawing the displayed stage, notifying React or touching history. Any input
render request immediately cancels stale background refinement. This also
prevents asynchronous warm-up from racing drag edits and pixel readbacks.

The tile LRU retains at most 48 MiB per stage across all zoom levels, counting
raster pixel bytes. Eviction/disposal zeroes backing stores. Immutable node
changes invalidate tiles intersecting old/new visual bounds; text bounds include
conservative glyph overhang. Insert/delete use local bounds; painter-order
changes conservatively clear tiles. Page/background/crop, DPR, size and loaded
font changes invalidate cached content. Exact snapshots are separately capped
at 48 MiB; oversized stages/extreme zoom-out use authoritative rendering rather
than allocating or iterating an unbounded tile grid. DOM presentation and queued
refinement are removed on disposal.

Selection, hover and inspector revisions do not invalidate content. Small drag
damage retains the previous round's clipped renderer. Eligibility is deliberately
bounded to independent solid rectangles and ordinary text; masks, backdrop
artwork effects, animation, mixed DOM scenes and unsupported transforms retain
authoritative rendering.

Paragraph layouts use a context-local LRU keyed by content, font/style,
letter spacing and wrap width, bounded by 256 entries / 1 MiB. Font loading
invalidates layouts and content rasters. Returned line arrays are copied.
Native glyph rasterization remains Canvas2D's responsibility; tiles avoid
repeated painting during camera motion.

Rendering remains coalesced through the engine's single rAF request. Eligible
text documents now defer inspector notifications until settling, as rectangle
documents already did. Active DOM text/region editors retain live camera
synchronization. Drag previews still bypass history, font loads and notifications
and commit through the existing gesture end path.

On known software GPU drivers, a temporary gesture preview tier pauses live
CSS backdrop blur in the editor UI; artwork effects are unchanged. It restores
the original settled styles and shares ownership across stages. Hardware and
unknown drivers retain the normal visual tier. A one-time driver probe releases
its temporary GL context immediately. This is a transient UI quality tradeoff,
not a claim that live backdrop blur became free.

Validation and reproduction
---------------------------

```
flock /tmp/voo-e2e.lock npm run test:e2e:fps
flock /tmp/voo-e2e.lock env VOO_FPS_NODES=5000,20000 VOO_FPS_SCENARIOS=pan,zoom VOO_FPS_PROFILE=/tmp/camera.cpuprofile npm run test:e2e:fps
flock /tmp/voo-e2e.lock env VOO_FPS_NODES=20000 VOO_FPS_SCENARIOS=pan,zoom VOO_FPS_PROFILE=/tmp/camera.cpuprofile VOO_FPS_TRACE=/tmp/camera-trace npm run test:e2e:fps
npx vitest run --maxWorkers=2 --minWorkers=1
```

Profiling writes one raw file per node count/scenario before pixel validation.
Optional traces include compositor/GPU events. All browser runs are serialized
with `/tmp/voo-e2e.lock`; the harness closes its browser and terminates its own
Vite process in `finally`.

The harness starts Vite on an isolated available local port. One queued trial
found 5197 occupied; the original readiness check accepted the other server
while its own child exited on the bind error. That trial is discarded
(`/tmp/fps4-offscreen-cpu.txt`). Explicit `VOO_URL` still opts into an existing
server. `VOO_FPS_DETAILS=1` records the actual stage's backing attributes,
presentation state and active backdrop surfaces, then samples idle rAF outside
the timed interactions. `VOO_FPS_DISABLE_BACKDROP=1` is diagnostic-only.

Settled pan/zoom pixels are compared with independent authoritative renders
at DPR 1/1.25/2, both raster backends, odd stage sizes and fractional cameras,
including translucent overlaps, wrapped text, text edits, undo, background
changes and selection handles. Those tests mount real DOM tile layers and
verify their removal on settle. Existing drag pixel comparisons remain enabled.
Unit coverage includes LRU bounds/disposal, local ink invalidation, structural
edits, frozen zoom scale, refinement cancellation, tile layer identity/cleanup,
sparse chrome, synchronous readback, paragraph reuse and camera notification
semantics.

Final validation (continuation)
-------------------------------

The full `npx vitest run --maxWorkers=2 --minWorkers=1` run completed with
202 passing files and six failed assertions. Four are the known failures:
`contextual_island` dispatchToAgent and all three `electron_cli_bridge` cases.
The two additional wall-clock gates (`e2e_acceptance_criteria` T4.1 and
`canvas_perf_benchmark`) both passed on focused reruns without source changes.
The full run also reported two missing-`requestAnimationFrame` exceptions from
the viewport settling callback; that callback is unchanged from HEAD, and the
focused acceptance rerun completed without those errors. No implementation
changes were needed during this continuation. `git diff --check` passes.

The first queued browser attempt could not start Vite because the host's
inotify watcher limit was exhausted. The comparable retry uses
`CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=10000` for Vite file watching, retaining
the default benchmark scenarios, sample duration, viewport and browser flags.
