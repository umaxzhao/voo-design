# Figma native-file import acceptance

## Desktop real-file audit — 2026-10-31

**Status: imported, with confirmed property losses and unacceptable interaction
stalls in the measured large-document context. Full fidelity is not verified.**

Scope: `documents.import-export`, `vectors.format-losses`, `text.typography`,
`text.font-loading`, layout/component semantics, `compositing.frame-clips`,
`compositing.masks` and canvas interaction performance. This audit changes no
application behavior. `native_studio` is excluded.

### Fixed source and method

- Application revision: `9c5a063e874aaa5346a1804171d414740463032a`.
- User-supplied local fixture: `test.fig`, 253,604,553 bytes; Kiwi 106,
  29,235 source records, five CANVAS records including one internal resource
  canvas, 478 image resources. No private fixture or design screenshot is
  committed to this repository.
- Actual production build, fresh isolated Chromium profile, 1440 × 1000,
  DPR 1; external requests and the user's loopback CLI services blocked.
- Actual top-bar picker import, IndexedDB counts, loading completion,
  long-task/heap instrumentation, shared camera operations, real wheel input,
  screenshots and CPU sampling. Original fixture stays read-only.
- Instance expansion and background leaves produce 56,431 output layers;
  this increase alone is not duplicate-ID evidence. No duplicate IDs,
  dangling parentId or dangling clipTo were found in the imported model.
- A GUID-tagged diagnostic copy has the same 56,431 layers and zero
  differences across 27 checked scalar/style fields versus the unmodified
  streaming import. Property checks compare native records with these
  matched outputs, not merely converter warnings.

### Attribute results

Counts below refer to original source records, excluding repeated instance
expansion. Denominators include only source nodes matched to an output;
this table is not a census of every visual combination.

| Attribute | Matched original records | Result |
| --- | ---: | --- |
| Hidden/visible | 474 | Correct for checked values |
| Non-default opacity | 1,469 | Correct for checked values |
| Text content and font size | 5,464 | Correct for matched text; nine other nonempty text records belong to flattened Boolean subtrees, not established missing glyphs |
| Locked state | 197 | Lost |
| Rotation field | 1,617 | Not retained; visual affine fidelity also needs checking |
| Auto Layout configuration | 1,286 | Lost |
| Non-default resize constraints | 13,209 | Lost |
| Independent corners / smoothing | 115 / 24 | Lost |
| Frames with clipping disabled | 3,145 | Imported with clipping enabled |
| Non-centered non-vector stroke / dash parameters | 604 / 56 | Not retained as source parameters |
| Text decoration / vertical alignment / styled ranges | 47 / 78 / 116 | Lost |
| Component instances | 985 | Expanded to ordinary containers; live component relationship lost |
| Variable collections / variables | 4 / 5 | Incorrectly mapped to rectangle layers |
| Image crop transforms | 223 | Not retained as editable image transforms |
| Multiple shadows of the same type | 94 | Complete shadow list not retained |
| Prototype interactions / export settings / layout grids | 194 / 1,105 / 8 | Not imported |
| FRAME records carrying resizeToFit | 3,591 | Still mapped to Frame; original Group semantics need native-type confirmation |

All 478 source image hashes match their archive keys; the browser stores
478 assets. This does not certify crop, fit, transforms, image decoding or
pixel parity for every layer. Thirty-two font family names are retained;
23 are outside the importer's bundled/Google availability catalog. That
catalog does not establish actual OS font availability. Network fonts were
blocked, so not every observed fallback is a product defect.

The importer reports 90 approximated Boolean objects and five approximated
polygons, plus four variable collections and five variables treated as
shapes. `mask-applied` is a processing note, not an error. The warnings do
not report every silent property loss in the table.

Gradients, multi-fill, blend modes, basic effects and masks have mapped
representations but are **partial/unverified for complete visual parity**.
Low-resolution source/import overview thumbnails are insufficient for a
restoration percentage: background pixels dominate and text is too small.
A same-name desktop Figma frame provided qualitative reference only; the
connector lacked access and the online file's exact snapshot was not certified.

### Performance evidence

These are measurements on the current shared development machine, not
portable performance guarantees or a signed Electron acceptance result.

| Context | Observed result |
| --- | --- |
| Fresh Node conversion processes, excluding UI/storage | 7.11 / 7.70 / 9.60 s; file reads separate |
| Production Chromium / SwiftShader, complete runs | Loading ended at 16.96 / 23.42 s |
| Production Chromium / Apple M4 Pro Metal | Engine ready at 7.50 s; loading ended at 30.93 s |
| Metal idle / pan / zoom rAF cadence | 60.0 / 1.26 / 0.52 callbacks per second |
| Metal longest pan / zoom sample gap | 1.25 / 4.28 s |
| Six real wheel inputs followed by two frames, Metal | 0.783–4.809 s per sample |
| Longest observed import main-thread task, Metal | 10.624 s |
| Post-import JS heap, Metal | About 368.5 MiB; not total or peak application memory |

Pan/zoom counts were only four/three frame intervals; their long stalls are
observed failures, not stable FPS estimates. CPU self-time points to mask
compositing (~21.6%) and ancestor frame clips (~8.6%), with substantial
Canvas2D state/draw/readback calls. No single root cause is claimed fixed.

The Metal run completed these measurements and then lost its browser target
during a focused-detail screenshot. Cause is unconfirmed; that run remains
**incomplete**, not passed. The second software-renderer run completed.
Different GPU/cache/run contexts must not be averaged into one FPS result.

### Evidence and remaining work

- Existing Figma units: 17 files / 135 assertions passed on the fixed source.
  These synthetic cases do not cover the real-file losses above.
- Local artifacts: `/tmp/voo-fig-audit/`; persistent private report bundle:
  `figma-import-audit/` in the current Codex visualization artifacts folder.
  It contains the file fingerprint, source/output checks, exact environments,
  profiler, scripts, screenshots, raw logs and evidence hashes.
- Failed/partial: large-document camera responsiveness, native property
  mapping, component/variable semantics and complete source style fidelity.
- Not executed: native Electron/installer acceptance, every font, all pages
  at full resolution, save/cold reopen, edit/undo/redo and every property mix.
- Next: fix clipping/affine/image/variable mapping and expensive mask repaint;
  preserve layout/component semantics; then complete stroke/text/effect
  fields and source-font high-resolution comparisons. No deployment is
  required for this audit-only documentation update.

## Native property and compositor remediation — 2026-10-31

Status: targeted native import regressions repaired; full source fidelity and
large-document responsiveness remain partial. This section supersedes only
the specific losses below, not the remaining acceptance gaps above.

### Implementation and verified scope

- Native `frameMaskDisabled`, lock state, axis constraints, independent corner
  values, stroke alignment/caps/joins/dashes, underline and Auto Layout intent
  are mapped. Parent affine matrices compose once into world coordinates.
  Native `FRAME + resizeToFit` becomes a non-clipping Group. Authored positions
  are retained on import; layout changes use the existing reflow operations.
- Four variable collections and five variables in the actual fixture retain
  typed per-mode values; their nine former rectangle layers disappear. The
  result has 56,422 layers, 478 streamed image assets with matching SHA-1 keys,
  no duplicate layer IDs and no dangling parent IDs.
- Image cover/contain/tile and active native manual-crop transforms use the
  shared image-paint renderer. The earlier 223-transform loss count included
  inactive transforms on FILL paints: these must not override FILL behavior.
  This distinction follows [Figma ImagePaint](https://developers.figma.com/docs/plugins/api/Paint/).
- Immutable render-pass documents and bounded multi-mask caches survive camera
  changes. Hidden previews, changed paint scope and newly decoded image paints
  invalidate cached mask results; videos bypass this static bitmap cache.
- New registered `figma-import-fidelity` imports a real generated Kiwi archive
  through the file picker and asserts crop/cover/rotation/overflow/mask pixels,
  independent multi-image fill transforms, unchanged second-pass bitmap reuse,
  constraint-aware frame resizing, undo,
  redo and binary save/cold reopening. No private document is a committed test.

Private source/output matching retains separate denominators for flattened
or structural records. Checked original outputs include 1,291 Auto Layout
containers, 13,223 non-default constraints, 188 locked artwork nodes (the nine
other locked records are variables), 3,145 disabled clips, 3,591 native Groups,
162 image-bearing nodes with active manual crops, 109 non-outlined corner
configurations, 604 stroke alignments and 15 non-outlined dash configurations. These checks establish mapped values,
not pixel parity for every real-file combination. Corner smoothing is metadata
only; outlined paths already bake their stroke/corner geometry into fills.

### Measured large-file improvement, still below acceptance

Both complete local production runs used Chromium/Metal on Apple M4 Pro,
1440 × 1000, DPR 1, fresh profiles, the identical read-only `test.fig`, external
network blocked and the same picker/camera/wheel script. The before build is
`b20bb5b`; the after build is `6bb6ac4` plus this remediation. Upstream changes
between those bases concern inspector typography and Agent UI. These are single
runs on a shared development machine, not portable performance guarantees.

| Measurement | Before | After |
| --- | ---: | ---: |
| Loading ended | 21.19 s | 19.20 s |
| Pan rAF cadence | 2.02 callbacks/s | 4.31 callbacks/s |
| Zoom rAF cadence | 0.69 callbacks/s | 1.62 callbacks/s |
| Six wheel samples, median | 623.5 ms | 276 ms |
| Wheel sample range | 562–3,068 ms | 207–1,314 ms |
| Longest import main-thread task | 3.777 s | 3.773 s |

These are callback timings, not GPU FPS. Only seven/three before and fourteen/
five after pan/zoom intervals were recorded. The remaining pauses are failures;
this optimization does not certify smooth navigation or fix long import tasks.
Before-run import overlapped the private metadata diagnostic; camera/wheel
samples completed after the unit workers had exited. No cross-run averages or
restoration percentage are claimed.

Evidence: private `/tmp/voo-fig-opt-before/`, `/tmp/voo-fig-opt-after/`,
`/tmp/voo-fig-opt-properties/`, baseline failing regression log
`/tmp/voo-fig-optimization-baseline.log` and picker regression log
`/tmp/voo-fig-browser-fidelity.log`. An initial unprivileged full unit run had
41 failures including denied loopback listeners, watcher notifications and a
25 ms performance threshold; it is retained, not represented as a pass.
Final committed-source release evidence is recorded in `quality-progress.md`.

Still unverified/incomplete: signed Electron, every page at readable scale,
source fonts, nonuniform text affine scaling, arbitrary reflection combinations,
rich text/strike-through/vertical alignment, complete shadow stacks, live
component links, variable bindings/aliases, prototype/export/grid metadata and
child grow/stretch sizing. `native_studio` remains excluded.
