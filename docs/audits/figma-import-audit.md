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

### Final sequential measurements, still below performance acceptance

Both complete production runs were serialized after this task's unit/browser
workers and metadata diagnostics finished: before `b20bb5b`, after
`3dfad79396e229cf9a0e888f52842f49b31c3e1a`. Chromium used Apple M4 Pro Metal,
1440 × 1000, DPR 1, fresh profiles, the identical read-only `test.fig`, external
network blocked and the same picker/camera/wheel script. The homepage was ready
before opening the file; import timing starts at file input change. The final
build includes the recorded upstream changes; results do not isolate each fix's
causal contribution. This remains one pair on a shared development machine,
not a portable performance guarantee. OS load averages are retained in receipts.

| Measurement | Before | After |
| --- | ---: | ---: |
| Loading ended | 20.28 s | 12.69 s |
| Pan rAF cadence | 1.95 callbacks/s | 5.54 callbacks/s |
| Zoom rAF cadence | 0.95 callbacks/s | 1.78 callbacks/s |
| Six wheel samples, median | 638 ms | 199 ms |
| Wheel sample range | 578–2,902 ms | 178–1,003 ms |
| Longest import main-thread task | 3.745 s | 1.882 s |

These are callback timings, not GPU FPS. Only seven/three before and seventeen/
six after pan/zoom intervals were recorded. Pauses remain failures: large-scene
navigation is not certified smooth. Both runs completed without page script
errors; each stored 478 assets. The original file's size and SHA-256 still match.
Earlier exploratory measurements overlapped a private diagnostic and remain
archived separately; they are not averaged into this comparison.

Evidence: private `/tmp/voo-fig-opt-before-controlled/`,
`/tmp/voo-fig-opt-after-controlled/`, `/tmp/voo-fig-controlled-comparison.json`,
`/tmp/voo-fig-opt-properties/`, baseline failing regression log
`/tmp/voo-fig-optimization-baseline.log` and independent multi-fill crop
red/green logs. The initial sandbox full-unit failures remain recorded.

Still unverified/incomplete: signed Electron, every page at readable scale,
source fonts, nonuniform text affine scaling, arbitrary reflection combinations,
rich text/strike-through/vertical alignment, complete shadow stacks, live
component links, variable bindings/aliases, prototype/export/grid metadata and
child grow/stretch sizing. Corner smoothing is metadata only.
`native_studio` remains excluded.

### Cold-start New regression discovered by the release gate

The `ea90962` gate passed 4,608 unit assertions (four skipped), then stopped
at 37/91 recorded steps after `continuous-creation` timed out creating its
first document. An isolated repeat passed, so the first failure was retained
as an intermittent startup failure, not discarded as a pass.

Holding the lazy welcome module before its listener subscribes deterministically
reproduces a lost New request. The title bar now retains one pending intent
until the existing dashboard creation handler subscribes. Desktop and overflow
entries share that request operation; the actual workspace creation path stays
shared with presets. Fresh workspace and recent-file names are checked before
writing, so an early request cannot replace an existing Design1.voo based on
an unloaded/filtered dashboard list. A registered title-bar browser scenario
seeds Design1.voo, clicks New while the dashboard is blocked, verifies exactly
one Design2.voo and compares the original bytes. Unit coverage retains latest
naming, one-time replay and listener cleanup. No extra default UI is added.

Behavior owner: `workspace.cold-start-new`. The final gate is rerun on the
committed combined source, including upstream i18n/vector/text fixes. The
initial aborted/incomplete reports remain separate evidence.

### Published verification — 2026-11-01

- Clean unchanged source `dd6936840b8cb5ee34062e81774ea528b959769a` passed all
  **91/91** release steps: module registration, production build, design lint,
  4,615 unit assertions (four skipped) and 87 core browser suites. Exact evidence:
  `/tmp/voo-fig-opt-release-combined.json` and its `.log`. This is a new complete
  execution after the recorded `ea90962` failure; earlier runs were not relabeled.
- `3dfad79` separately passed eight integration steps, including 19 bitmap/
  document-reference unit assertions and Figma import, image history, project
  round-trip and deterministic cold-New browser scenarios. Evidence:
  `/tmp/voo-fig-integrated-checks.json`. Its production build was deployed using
  `scripts/deploy-editor.sh`; the SSH backup and successful preflight are retained.
- A parallel Browser-dock release subsequently published `6d8cef7`, containing
  all this task's Figma/editor changes unchanged plus the right-dock/exclusion
  behavior. It was preserved. That feature's integration receipt belongs to
  `47471c9`: build/lint, 4,637 full-unit passes (four skipped) and three browser
  suites. `47471c9..6d8cef7` changes documentation only; neither integration
  inherits `dd69368`'s complete 91-step execution.
- Current canonical HTML and eight critical resources match the actual
  `6d8cef7` deployment byte-for-byte. Independent production Chromium imports
  the generated native archive and passes crop/cover/independent image fills,
  rotation, overflow, two-mask pixels, cached-pass equality, typed variables,
  constraint-aware resize and undo/redo, with no page script errors.
  Evidence: `/tmp/voo-fig-deployment-proof.json`,
  `/tmp/voo-fig-production-fidelity.json` and `.png`. This specifically tests
  the DOM input path after homepage/document readiness, not the native FSA or
  operating-system chooser.
- Production attempts before the final pass are retained: an unobserved file
  chooser, an early-engine pixel mismatch, and an HTML revision mismatch during
  parallel publication. The final run explicitly checks actual HTML, imported
  node identity and open-guard completion before the unchanged pixel assertions.
- Persistent private bundle: `figma-import-optimization/` in the current Codex
  visualization artifacts folder, including original receipts and SHA-256
  manifest. No private `.fig`, decoded design or commercial screenshot is
  committed. Twenty-one separately registered checks and native/paid-service
  contexts are not certified by this release; functional coverage stays partial.

### OpenPencil control and further rendering optimization — 2026-11-01

Owner: `compositing.clip-run-culling`, with `canvas.performance`. The original
253,604,553-byte `test.fig` stays read-only; no private fixture is committed.
OpenPencil is independently installed at
`/Volumes/TD/Projects/open-pencil-benchmark`, served at `http://127.0.0.1:5188/`.
Its official source is unmodified. Both v0.16.0 (`ffe2fc5`) and master
`e0defef2298957b7f36f19d6a7847a37f3e8ac44` build using the declared Bun 1.4.2.
An earlier build with system Bun 1.3.12 failed; that is runtime mismatch evidence,
not an upstream product defect. Local startup instructions are beside the clone.

Both OpenPencil builds produce nonfinite default fit camera coordinates on this
file. v0.16.0 additionally throws on a null gradient shader; its callback scores
are invalid and discarded. Official master already guards that shader. Its
control run manually restores finite camera coordinates without changing graph
data, waits for the official navigation settlement hook, and verifies changing
canvas screenshots with zero page script errors during camera/wheel sampling.
Blocked online fonts remain console errors and 31 font faces are unavailable.

Master first-page readiness is 7.577 s in the settled run. It initially stores
24,025 nodes (20,992 descendants on the active page); other pages populate on
first visit, taking 3.246/1.116/3.136 s and reaching 58,504 nodes. VOO eagerly
imports all five pages, so initial readiness alone is not equal import work.
Both retain 478 images, four variable collections and five variables. Different
expanded node counts do not establish missing properties or visual parity.

The camera control uses production builds, fresh Chromium 156/Metal on M4 Pro,
1440x1000/DPR1, external network blocked, zoom 0.024, 10-second sinusoidal pan
and zoom plus six real wheel inputs. UI remains visible: OpenPencil's artwork
surface is 924x931 versus VOO's 1428x948. This is an observed application test,
not a pure engine ranking. OpenPencil master records 1.175 pan / 0.734 zoom
rAF callbacks/s, wheel median 667 ms; it is also visibly slow. These are callback
cadences, never GPU FPS, and the manual-camera qualification is essential.

VOO changes share equal ancestor Frame clips only for consecutive paints on
one context, clear them around isolated containers/mask chains, restore the
caller state on failures, and enable conservative offscreen culling for mixed
layer passes. The existing 240-world-pixel safety margin is retained. Static
vector empty-effect results are cached; image/text results retry for asynchronous
resources. Immutable isolated container paints retain identity across camera
passes and invalidate when their source node is replaced.

Red regressions retain 200 clip operations for 200 sibling paints, three image
fills including one beyond the safety margin, repeated empty-effect readback,
and changing isolated paint identity. Green assertions require two clip runs,
two nearby image fills, every visible RGBA byte unchanged, caller-clip cleanup,
empty-vector reuse, image/text retries and edit invalidation. Existing native
Figma crop/cover/rotation/overflow/mask/variables/undo/cold-reopen checks remain.
Private evidence is under `/tmp/voo-open-pencil-comparison/`; red/green logs use
`/tmp/voo-clip-*`, `/tmp/voo-container-paint-*` and `/tmp/voo-empty-effect-*`.
The sequential VOO comparison uses baseline application `b965942` (all later
`68c3790` changes are documentation) and the final performance patch. Initial
readiness changes from 12.249 to 11.003 s; pan cadence from 3.306 to 6.020 and
zoom from 0.960 to 1.776 callbacks/s. Three repeated full-pass diagnostics reduce
effect pixel reads from 97 (2,098,764 pixels) to two (84,535 pixels) each. The
intermediate clip-only trial (3.707/1.111 callbacks/s) is retained separately.
These are single sequential shared-machine samples, not universal speedups;
61/18 final pan/zoom intervals still show unacceptable stalls. Final fixed-
revision release and production proof are recorded after verification below;
no pending gate is counted as passed.

Still partial: readable-scale fidelity across every page/font/property, signed
Electron, other GPUs/input devices, all effect/mask combinations and sustained
smooth large-scene navigation. `native_studio` remains excluded.
