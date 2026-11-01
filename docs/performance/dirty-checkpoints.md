# Incremental document dirty checkpoints

Scope: `documents.dirty-checkpoints`, shared engine/history UI, keyboard and
Agent entry points. Baseline main `8c270d0`. `native_studio` remains excluded.
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
| Full release / production | A new clean fixed revision, complete release and independent deployment/interaction receipts. | Pending fixed evidence |
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
