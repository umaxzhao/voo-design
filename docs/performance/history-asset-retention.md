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
| Core release / production | Requires a fresh clean revision, full release report and deployed asset/interaction receipts. | Pending fixed revision |
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

On the shared M4 Pro host, old/new unchanged medians are 10.51/.016ms and
7.68/.016ms; new-scene medians 7.83/.254ms and 7.80/.247ms. Exact pinned sets
match. Cold collection is 15.0/12.6ms and 9.2/12.1ms, so no first-use gain is
claimed. Raw samples and load are retained in `voo-history-pins-model-bench.json`.
These measure only retention work, not total browser edit latency or GPU FPS.
Earlier audit timings are historical measurements, not this candidate's speedup.

Actual-file production input measurements and the fixed release revision are
recorded after the candidate gate. Do not infer them from the Node probe.
Private evidence belongs in the `history-asset-retention/` visualization artifact;
the original Figma file, decoded nodes and screenshots are not committed.

The first fixed candidate `645f84d` passed 4,760 units/four skips and began
browser checks, then was intentionally stopped after review found its legacy
cache retained complete parsed documents. The GC regression fails on that
candidate and passes after storing ID sets only. Its partial release/log are
retained as `voo-history-pins-release-initial.*`; they are not release success
evidence. The corrected candidate requires a fresh complete gate.
