# Background draft computation

Scope: `documents.autosave`, `workspace.covers`, related camera performance.
Baseline is `6f4a8bd569ea2f593d4fde4490d18089944a965e`. Final application
content is bound to the source/build hashes in private
`background-draft-performance/`, with the resulting local commit in
`raw/revision.json`. Earlier camera evidence remains separate; it does not
certify this changed persistence path. No file-format or font/keyboard changes.

## Reproduced cost and implementation

The preceding NBA profiles showed cover SVG construction/URI encoding and
binary packaging running on the interaction thread. Moving only SVG generation
and binary encoding to a worker left a first SVG decode/rasterization long task
of 704 ms in the pilot; its observed idle rAF maximum was 233.7 ms. This pilot
is not final performance evidence. Worker `createImageBitmap(SVG Blob)` fails
for both simple and embedded-PNG SVG in the isolated Chromium probe, while its
PNG control succeeds; SVG rasterization cannot simply move to that API here.

Final live covers use the existing authoritative renderer on a separate canvas
at DPR1 and at most 512 pixels per side. The live editing canvas is not resized,
read back or exported. Only an immutable, finite clipping-Frame scene with a
stable artwork revision and ready image/mask resources qualifies. Image paints,
unproven bounds, incomplete resources, unavailable engines and changing stamps
retain the portable cover fallback. The canvas allocation is released after
PNG encoding; one latest small PNG is retained per live engine and reused when
only camera/selection notifications change. This is not a global memory claim.

Fallback SVG construction and canonical `.voo` encoding run in one owned module
Worker, using the existing `projectCover` and `encodeVooBinary` implementations.
The encoded result buffer is transferred back; editor-owned buffers are never
detached. The worker has one active job, explicit error/message/timeout handling,
abort termination, stale-result guards and 30-second idle release. Failures do
not silently run expensive encoding on the UI thread. Cover failure remains
optional, as before; encoding failure reports false and preserves stored data.

Canonical pages are captured synchronously before asynchronous work. Draft
jobs and their IDB commits share an ordered queue, so an older completion cannot
overwrite a later snapshot. The UI scheduler has one active controller and one
coalesced pending notification. Revision changes/unmount cancel active
computation and pending work. Cancellation before publication drops the result;
an already-started IDB transaction is allowed to finish before the next commit.
The exported direct snapshot API can still queue multiple callers: no fixed
global bound is claimed for callers bypassing the scheduler.

## Native same-file comparison

Input: read-only `/Volumes/TD/download/NBA-Land-UI-V3.voo`, 31,900,716 bytes,
SHA-256 `8bf368d5c6b7cb1276f63f1dc262ec763fc266c404a4b97aee202914d929c4f8`.
It contains 15,036 nodes, **149 media assets plus one preview** in its original
binary index. Each run imports a byte-identical copy using its own temporary
Electron profile/documents directory and disables updates.

Final native runtime is Electron 43.4.0 / Chromium 150.0.7871.224, Apple M4 Pro
ANGLE Metal, visible window, actual 1440x991 CSS pixels/DPR1. Each mode records
120 rAF intervals. CPU sampling, Worker message/clone instrumentation and the
main-thread LongTask observer are enabled in both versions. Runs alternate
baseline/candidate/candidate/baseline/baseline/candidate; no builds or browser
regressions run concurrently. Labels are `native-background-final-before1..3`
and `native-background-final-after1..3` in `raw/final-comparison.json`.

| Camera-loop observation | Baseline, three runs | Candidate, three runs |
| --- | --- | --- |
| Zoom-in maximum frame interval | 466.8 / 633.4 / 464.7 ms | 85.1 / 81.6 / 81.7 ms |
| Zoom-in P95 | 18.6 / 18.5 / 18.5 ms | 18.3 / 18.5 / 18.5 ms |
| Pan maximum | 18.6 / 18.8 / 34.8 ms | 18.6 / 18.7 / 18.7 ms |
| Zoom-out maximum | 49.3 / 18.6 / 18.7 ms | 18.7 / 18.6 / 18.7 ms |

These are camera-domain script/rAF measurements on a shared host, not physical
input-to-presentation latency, complete application long-task maxima or a Figma
comparison. Cold import work precedes these loops and still has long tasks.
The ordinary P95 was already near the display cadence; the improvement is in
the repeated long stalls. Roughly 80 ms maxima remain. Main-thread canonical
scene collection, message cloning, storage and other work are not eliminated.
Worker heap is not included in the recorded main-thread heap sample, so no
total-memory reduction is claimed.

Every final native run verifies the persisted draft after timing: all 15,036
canonical scene nodes match the live serializer, each of the 149 original media
payloads matches its independent SHA-256, and the preview is PNG. This is not
the same as byte-identical whole files: the canonical serializer and new cover
are allowed to change representation. Worker request/result traces prove the
live candidate actually used background encoding and completed storage.

## Acceptance and limits

| Context | Verified assertions | Remaining |
| --- | --- | --- |
| Worker lifecycle | Busy rejection, timeout, abort, stale messages, runtime/startup/message failures, idle disposal | Installed/signed-app CSP failure and OS suspension |
| Format | Same canonical encoder, exact bytes for equal input, output-only buffer transfer, Unicode, errors | Every legacy/broken document |
| Live cover | Separate <=512px/DPR1 canvas, release, resource/stamp fallback, exact unchanged editing RGBA/geometry/document | All effects, font readiness and native Retina |
| Portable cover | Actual no-engine worker cover/encode plus existing red/green cover pixels, reload and read-only recovery | SVG rasterization can still be expensive on this fallback |
| Publication | Synchronous snapshot capture; queued edits encode/persist in order; newer draft wins; abort and deferred commit | Unbounded direct caller traffic and native transaction interruption |
| User interaction | Real engine selection/dirty state, two-page assets, canonical bytes and awaited undo/redo | All editing operations and physical keyboard/IME |
| Native NBA | Three paired runtime sessions, canonical saved scene and every media hash | All source Figma properties and signed installed app |

Full units: **5,011 tests / 612 files pass**, four tests / three files skip.
Application sources were unchanged afterward; the final catalog ownership
addition then passed its 26 targeted unit tests. Design lint, formatting,
module registration and production build pass. Nine targeted browser suites
are recorded in `raw/browser-results.json`; this is not the full 117-suite
release gate. Modules remain partial and historical passes are not inherited.

Retained failures include the worker-only SVG pilot, an incorrect pilot asset
guard expecting 150 media instead of 149 plus preview, a test missing awaits on
async undo/redo, and an invalid image-paint test fixture corrected to the actual
schema. None is relabeled as a passing run. The earlier native fresh-reference
pixel discrepancy remains a known unresolved context; this slice does not
modify its font/rendering implementation or certify it fixed.

Evidence includes raw frame arrays/maxima, CPU profiles, Worker traces, exact
source/build manifests and failed attempts. Input hash is rechecked at delivery.
No original input or native user profile is included in the private handoff.
Work remains local-only: no push, merge, main-tree integration, deployment,
installer/tag or Release. `native_studio` and global quality-progress edits
remain outside this isolated task.
