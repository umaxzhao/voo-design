# Incremental document dirty checkpoints

Scope: `documents.dirty-checkpoints`, shared engine/history UI, keyboard and
Agent entry points. Verified source `ba834ccee348abbea025111b9e86ce53820b5b8c`,
against baseline main `8c270d0`. `native_studio` remains excluded.
No controls, dependencies or persisted-format changes.

## Cause and implementation

The preceding production profiles left full-page saved/dirty serialization as
a major edit hotspot after reducing effect readbacks. `snapshotDoc` reused a
string only until the document reference changed, so each small edit serialized
all page nodes again. Real-file applied snapshots are about 43 million
characters; this is not an empty/imported-baseline-only optimization.

`createDocumentSnapshotState` retains the last explicit snapshot and one saved
checkpoint. As in history and render caches, engine nodes/nested scene data are
immutable. Dirty checking skips unchanged node references, canonicalizes changed
records through the existing node serializer and compares page fields only if
all node payloads still match. Node count/order, canonical default/transient
fields, metadata and manual value restoration keep their prior meaning. Results
are reused only until the document or applied baseline changes.

Saving/explicit serialization still builds the exact same canonical JSON.
The existing page-field builder is extracted without removing the complete node
list needed by modifier validation. Saved canonical records are reused instead
of reparsing a large JSON string. No hash collisions, new document format or
history-position approximation is introduced. Pixel buffers, pixel selections
and pending transforms retain their independent dirty flags.

Unknown/legacy baselines conservatively use exact historical full-string
comparison until a matching checkpoint is known. Null remains untracked; the
existing empty baseline remains unsaved. The public applied-document string and
session schema stay unchanged. Font completion retains its existing explicit
snapshot path; this batch does not remove every possible serialization.

## Reproduction and acceptance

| Context | Assertions | Evidence |
| --- | --- | --- |
| Original history API | A one-node edit in 1000 records serializes the whole document. | Original unit fails; retained red log |
| Actual original editor | Eight edits plus manual restore cause nine full 1002-node serializations. | Actual browser red retained |
| Incremental dirty state | Changed record only, unchanged baseline, no full snapshot; exact canonical serialization retained. | Targeted units passed |
| Saved equality | Undo by reference, manually restored values, count/order, metadata, transient blob/default adjustments and actual adjustments. | Targeted units passed |
| Compatibility | Unknown/legacy/null/empty baseline, generic history fallback, pixel/transform flags. | Targeted units passed |
| Actual editor | Zero full snapshots across isolated edits; real arrow/undo/redo, actual MCP styles, save marker, capture/restore session. | Targeted browser passed |
| Full release | Clean ba834cc: 105/105 steps, 101 core browsers, 4819 units passed / four skipped, design lint 1446 files. | Passed; eleven standalone checks not run |
| Production | Independent canonical bytes and real interaction receipts in private dirty-checkpoints/. | Separate post-publication evidence; not inherited from the core gate |
| Remaining | Direct mutation of immutable engine nodes, every legacy format, asynchronous native writes, signed Electron and physical devices. | Not certified |

Six new units are registered with documents ownership. The helper runs inside
the existing core editor-effects suite; unique suite ownership and its original
layout/effect/resource checks remain intact. Related module plans include layout
and compositing rather than registering a suite twice.

## Retained exploratory outcomes

A first checkpoint prototype reparsed the saved JSON. Real-file key median was
262ms, but the import JS heap sample was about 411MiB. Reusing canonical records
instead measured 253ms and about 368.5MiB in another exploratory run. These
separate shared-host samples are not a controlled memory guarantee or final
performance comparison. Both retained correct key positions and undo/redo.
The discarded prototype is not deployed.

Original failures, an incorrect launch directory, initial duplicate suite
registration, pilots and all source changes remain in private evidence. They
are not relabeled as passing application tests. Final measurements must follow
the complete clean release, use fresh forward/reverse production runs on the
read-only original file, and retain actual key waits separately from synchronous
API setup and explicit checkpoint creation. Record the imported baseline and explicit saved-checkpoint context separately,
alongside exact pixels, original file hash and source revisions.

Candidate 85361f3 stopped at full-unit step 4: the public model-export guard
needed the intentional one-argument `serializeDocumentFields` addition.
All previous names/arity checks remain; no failure is skipped or weakened.
The corrected committed candidate requires a fresh complete release.

## Final fixed-source comparison

Four fresh production sessions, before/after/after-reverse/before-reverse, with
a uniform ten-second pause before each. Both versions use the same CPU sampling,
real file chooser, API setup and actual eighteen arrow inputs. Original imported
baselines are clean and contain 43137170 characters; these are valid saved
checkpoints, not an empty unsaved sentinel. Shared host loads are retained.

| Observation | Forward before -> after | Reverse before -> after |
| --- | --- | --- |
| Actual key median | 579 -> 278ms | 582.5 -> 260ms |
| Actual key mean | 593.8 -> 279.0ms | 616.0 -> 266.2ms |
| Fifty synchronous API setup edits | 1292.3 -> 1372.8ms | 1422.1 -> 1451.1ms |
| Same 1000x800 viewport difference | 0 pixels | 0 pixels |

Key medians improve 52.0/55.4%. API setup is 6.2/2.0% slower in these runs;
this batch does not establish a batch-edit speedup or eliminate layout cost.
The host was shared and highly loaded; script waits are not physical input
latency, GPU FPS or a Figma comparison. All raw samples/outliers remain retained.

Both pairs preserve selected IDs, positions, fifty-entry history and actual
keyboard undo/redo. All five decoded pages / 56422 nodes match old VOO layout,
canonical serialized values and exact serialized JSON, including one resize per
page; inputs remain unchanged. Import retains all 478 assets and 247642346
asset bytes. Original file SHA-256 remains
`ddf80a00291c5c79ebc30c9b71c7c4180a74ca80311a170ed16f2aeed006b2c2`.
This is regression equivalence, not complete original Figma fidelity.

Private dirty-checkpoints/ retains failed source/export registration attempts,
pilots, full clean release, raw paired profiles/pixels, exact script/source
receipts and independent GitHub/deployment/production checks. Only the corrected
full release is complete; no earlier failure is relabeled or stitched into it.
Later documentation commits do not change the application or registered tests.
