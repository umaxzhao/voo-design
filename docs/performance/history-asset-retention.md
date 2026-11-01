# History asset retention

Scope: `documents.history-asset-pins`, related `documents.undo-redo` and
`compositing`/`images` resource lifecycle. No controls, dependencies or document
format changes. Autosave serialization and painter/index reuse remain separate.

## Implementation and acceptance

Each engine caches image/mask ID sets by immutable node arrays in a WeakMap.
Its active source map covers the live uncommitted scene and all history entries,
including redo. Reference counts change only when those sources enter or leave.
Dropped history/session sources lose their strong references on the next refresh;
the weak cache does not keep discarded arrays alive. Legacy JSON parsing is
cached as ID sets only for strings still present in the current history. Parsed
legacy documents remain reclaimable, verified in an exposed-GC subprocess. Malformed entries
retain the existing ignore behavior. Bitmap byte budgets and their eviction
policy are unchanged; pinned assets may intentionally exceed that budget.

| Context | Assertion / evidence | Status |
| --- | --- | --- |
| Repeated refresh and selection | Existing nodes are not reread; adding a new scene does not rescan prior history. Original source fails this assertion and repeated legacy parsing. `editor-history-asset-pins.test.js` | Targeted pass |
| Undo/redo and branched edits | Future assets remain pinned until redo truncation; only abandoned branch assets disappear. | Targeted pass |
| Capacity / reset / sessions | Fifty-entry eviction, shared IDs, live uncommitted state, history reset and restored page sessions retain the exact union. | Targeted pass |
| Memory pressure | Real bitmap cache over budget retains historical image/mask entries; abandoned branch drops them, keeping the live bitmap. | Targeted pass |
| Real editor / keyboard | Fifty-five geometry edits fill fifty history entries; keyboard delete, undo, redo and undo retain geometry and exact exported image pixels. Existing delayed insertion, concurrent edits and partial stock failure checks remain. `image-assets-history.e2e.mjs` | Targeted browser pass |
| Core release / production | Clean `9f00367baa9f939341eee8f8d3591bd79bf5f8ca`: fresh 105/105 steps, 101 core browsers, 4,761 unit passes/four skips. Deployment and actual production receipts independently bind the served artifact. | Core execution verified; production tracked by receipts |
| Remaining contexts | Native interrupted writes, signed installers, physical input, every legacy snapshot and total application memory remain unverified. `native_studio` excluded. | Unverified |

Red log: `voo-history-pins-red.log` (two failures, four behavior passes).
Targeted units: nine new checks plus five structural-sharing and five bitmap
cache checks. Real editor log: `voo-history-pins-browser.log` (three contexts).
Execution is separate from exhaustive functional coverage.

## Performance protocol

Node probe uses the existing private decoded first page of unchanged `test.fig`:
17,499 nodes, 154 distinct image/mask IDs. It constructs a synthetic fifty-entry
immutable geometry history, not a recorded user session. Nine unchanged refresh
and nine new-scene updates per run, with forward and reverse variant order.

On the shared M4 Pro host, old/new unchanged medians are 11.35/.017ms and
8.09/.016ms; new-scene medians 8.20/.238ms and 8.25/.234ms. Exact pinned sets
match. Cold collection is 15.6/12.3ms and 8.1/11.9ms, so no first-use gain is
claimed. Raw samples and load are retained in `voo-history-pins-model-bench.json`.
These measure only retention work, not total browser edit latency or GPU FPS.
Earlier audit timings are historical measurements, not this candidate's speedup.

Actual-file production builds compare `b550177` with fixed `9f00367` after
all local gate work finishes. Four isolated cold browsers run before/after,
then after/before; each imports the unchanged 253,604,553-byte desktop file,
prepares fifty real engine geometry-history entries, then performs eighteen
actual alternating arrow keys plus keyboard undo/redo. M4 Pro/Chromium 156,
1440x1000/DPR1, Metal requested; external network/CLI blocked. Raw host loads,
samples, profiles and operation timestamps are retained.

Whole-key waits (including automation/two rAFs) are 557.5→535.5ms in forward
order and 547.5→551.5ms in reverse order. **No stable end-to-end improvement is
established.** These data do not justify a faster-editing or FPS claim.
Both pairs retain equal final geometry and zero pixel differences in the
isolated 1000x800 overview. All 56,422 imported nodes and 478 assets are retained;
the tested active page has 17,499 nodes. No page errors. Original SHA256 remains
`ddf80a00291c5c79ebc30c9b71c7c4180a74ca80311a170ed16f2aeed006b2c2`.
The earlier exploration is retained separately, not pooled into the controls.

The baseline edit profile has about 3.0s exclusive sampled `getImageData` time.
Its minified call site corresponds to `node_effects.js` alpha-map painting;
that cache currently keeps one effect entry per node. Multiple effects may
replace one another, requiring a separate bounded-cache/invalidation study.
This is a next hotspot, not an implemented painter or memory-budget improvement.
Private evidence belongs in the `history-asset-retention/` visualization artifact;
the original Figma file, decoded nodes and screenshots are not committed.

The first fixed candidate `645f84d` passed 4,760 units/four skips and began
browser checks, then was intentionally stopped after review found its legacy
cache retained complete parsed documents. The GC regression fails on that
candidate and passes after storing ID sets only. Its partial release/log are
retained as `voo-history-pins-release-initial.*`; they are not release success
evidence. The corrected candidate requires a fresh complete gate.

The corrected candidate's first release attempt passed 4,761 units/four skips,
but the existing cold-fixture cache-removal assertion failed. A standalone
four-server repetition reproduced the late optimizer write on round six.
Vite 5 captures optimizer cancellation before awaiting dependency scanning;
a scan can create another optimizer after that capture. Test-server teardown
now drains close again before cache removal, using the public close API.
Ten repeated four-server rounds retain exact cache/port ownership checks.
The registered startup suite repeats eight rounds; no functional timeout or
assertion is relaxed. Preserve `release-startup-failure.*` and fixture red/fixed
logs. A new clean source revision must complete the entire release gate.

## Fixed release evidence

`voo-history-pins-release.json` is a single complete fresh run on `9f00367`;
prior interrupted/failed reports are separate. Eleven additional checks remain
not-run and functional coverage remains partial. Build, design lint, module
registration, source formatting and targeted checks pass. Final PR/build,
merged-source equivalence, canonical asset hashes and production interactions
are recorded separately in the private artifact; an earlier version's deployed
pass is not inherited. Signed Electron and physical-device contexts remain open.
