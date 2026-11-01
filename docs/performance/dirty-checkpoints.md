# Incremental document dirty checkpoints

Scope: `documents.dirty-checkpoints`, shared engine/history UI, keyboard and
Agent entry points; `inspector.field-commit` for the coalesced numeric display.
Verified combined source `bf9672972d0046fdd94324c4679d63fcd717c112`,
against baseline main `0f096fa`. Historical 8c270d0/ba834cc runs below remain
explicitly pre-integration evidence. `native_studio` remains excluded.
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
| Full release | Clean bf96729: 105/105 steps, 101 core browsers, 4831 units passed / four skipped, design lint 1446 files. | Passed; eleven standalone checks not run |
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

## Pre-integration fixed-source comparison

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

## Published-main integration

Remote 0f096fa contains separately verified layer-order and loading-clearance
fixes, preserved in the combined candidate. The ba834cc results above remain
pre-integration evidence only. The complete fresh gate and paired measurements
against 0f096fa are recorded below; no earlier result certifies the changed
combined source.

The first combined gate on 817d9b3 stopped at inspector step 84: actual
multi-selection rotation undo restored both model values but left the field
display stale. Isolated repeats passed on both 817d9b3 and main 0f096fa; those
repeats do not erase the original incomplete gate. A controlled real-field
publication harness then reproduced the same display gap deterministically:
commit and immediate undo publish the original value before the panel renders.
The effect previously observed only value changes. Reconcile every unfocused
render without overwriting a focused draft; retain Enter, Escape and blur
assertions plus the original real-engine/MCP undo scenario. This is part of
`inspector.field-commit`; add explicit field and harness ownership. The failing
harness and corrected targeted inspector run are retained. That updated source
required the complete clean gate and fresh measurements recorded below.

## Final combined acceptance

Fixed bf96729 reruns the complete unchanged core gate: 105/105 steps,
101 core browser suites, 4831 units passed / four skipped, 1446 design files
passed. Eleven standalone suites remain not run. Original failing gates remain
independent incomplete receipts; this is one fresh clean execution.

Four new production-browser sessions compare current main 0f096fa against
bf96729, in forward and reverse order with the same uniform ten-second pause.
The real imported baseline remains clean and 43137170 characters long.

| Observation | Forward before -> after | Reverse before -> after |
| --- | --- | --- |
| Actual key median | 620.5 -> 299.0ms | 655.5 -> 299.5ms |
| Fifty synchronous API setup edits | 1424.0 -> 1438.1ms | 1501.8 -> 1471.6ms |
| Same 1000x800 viewport difference | 0 pixels | 0 pixels |

Key medians improve 51.8%/54.3%. API setup changes +1.0%/-2.0%.
These are actual key-to-script-settle waits on one shared host, not physical
input-to-photon latency, GPU FPS or Figma parity. All raw samples, load averages,
CPU profiles and exact viewport pixels remain in private evidence.

All five decoded pages / 56422 nodes retain old VOO settled layout, serialized
values and exact canonical JSON, including one representative resize per page.
All 478 assets / 247642346 asset bytes remain; the original file hash is unchanged.
This does not certify every original Figma property, effect, font or page pixel.
The numeric regression also checks focused drafts, Enter, Escape and blur; the
real multiselection/MCP undo assertion remains unchanged.

Publication receipts, deployed canonical bytes and actual production checks
are recorded separately in private `dirty-checkpoints/`. Those receipts do not
extend the above local coverage to signed Electron or physical devices.

## Production follow-up: external image history

The first bf96729 production run failed the full-history image redo assertion;
an instrumented repeat reproduced it. Native pixels, zoom and selection had
passed, but these runs remain incomplete. The saved source still contained an
imported picture removed from the live engine. A later store tick treated it
as a new external delivery, appended a new layer and truncated the redo branch.
An actual cold portable-document reopen reproduced the same defect before the
repair, without replacing the imported scene artificially.

`documents.external-image-history` tracks image identities for one ready page
activation. Initial and locally observed images, successful deliveries and
concurrent already-present results cannot be re-ingested after deletion/undo.
Pending deliveries retain their separate guard; failed/missing assets remain
retryable and errors are still reported. New store-delivered images continue
to appear exactly once. No independent UI/shortcut history path is introduced.

Four new units cover baseline/local replacements, pending results, failure
retry and independent page lifetimes. Actual cold image history checks retain
50 entries, keyboard delete/undo/redo, node counts and exact source pixels;
the same checks pass on a genuinely new store-delivered image. The initial
full gate and performance measurements above remain fixed bf96729 evidence.
The follow-up candidate requires another complete gate, new paired measurements
and a fresh complete production receipt; neither failed production run is
converted into a pass.
