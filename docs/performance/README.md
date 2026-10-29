# Performance evidence map

These documents measure different things. Keep their raw results separate;
merging numbers into one before/after table would mix backends and environments.

| Document | Scope | How to use it |
| --- | --- | --- |
| [Generated canvas benchmark](../canvas-perf-benchmark.md) and [JSON](../canvas-perf-results.json) | Node document/index/mutation CPU timings | Generated together by `tests/unit/canvas_perf_harness.js`; paths stay fixed |
| [Local drag](canvas-fps-local-drag.md) | Historical 2026-10-23 Canvas2D / SwiftShader drag profiling | Explains local repaint changes; not the present hardware GPU FPS gate |
| [Camera tiles](canvas-fps-tiles.md) | Historical 2026-10-23 Canvas2D camera tile experiments | Explains raster/cache evidence and limitations |
| [WASM architecture](wasm-engine.md) | Implementation, data contracts and feature flag | Design reference, not a benchmark result |
| [WASM benchmark](wasm-engine-bench.md) | Node/native linear vs production R-tree vs WASM timings | Mutation and query costs; not end-to-end presented frames |
| [Editor verification](../audits/editor-completion-verification.md#rendering-and-measured-performance) | 2026-10-27 hardware Chromium/CanvasKit pan, zoom, drag | Latest recorded full nine-scenario browser gate; read its scene/coverage limits |

Reproduce current browser measurements with `npm run test:e2e:fps`. The default
30 FPS gate covers synthetic rectangle scenes; specify hardware/software mode
and node counts explicitly when comparing runs. Do not compare a profiled run
with an unprofiled run, a drag-only run with a full sequence, or CPU microseconds
with displayed FPS. WASM remains experimental and off by default because
measured mutation gains do not establish a browser-wide gain.

## Editor download boundaries

Run `npm run analyze:editor` on a clean checkout to record the exact revision,
minified chunk membership and static entry dependency closure. The report goes
to the system temporary directory by default; an explicit output path is also
accepted. `build.write` is disabled, so analysis does not replace `dist/`. Keep
the JSON with local release artifacts rather than adding a dated file here.

A clean reconstruction of `1b262b0` measured 3,026,856 bytes of static entry JS
(891,759 bytes summed gzip). The maintenance change defers the initial editor,
separates the inspector and loads export builders only when used. Compare the
new report against that baseline; a renamed/smaller feature chunk alone is not
proof of a smaller initial download. Runtime-requested welcome/localization
chunks, CSS, fonts and WASM are outside this static-closure metric. The browser
`editor-loading` suite separately checks actual first-welcome requests and
that opening/returning to the editor preserves artwork and undo history.

The `5004f42` static-entry baseline is 1,232,507 bytes (356,535 summed gzip).
The next boundary change separates agent settings/model menus from tool
executors, draft lookup from serialization, and welcome metadata from design
contract validation. File parsers and generation contracts load on use. The
browser gate also rejects first-welcome requests for canvas tools, scene
variables/Auto Layout/snapping and the full font index. These runtime checks
matter because a dynamically loaded welcome chunk is outside the static-entry
metric. Re-run the analyzer for exact bytes at the release being considered.

Extracting gestures and shared camera hooks reduces the editor container from
5,037 to 4,343 lines and removes its two dependency-rule suppressions; it does
not by itself reduce the loaded editor chunk. The navigation gate exercises
real pointer pan/drag/cancellation, zoom, history and welcome round trips.
Other oversized editor modules still need behavior-preserving maintenance.
The following batch removes the remaining explicit Hook dependency suppressions.

The next structural extraction reduces `image_editor.jsx` from 4,343 to 3,967
lines by moving mobile panels, media import, feedback and image actions into
focused Hooks. These remain static imports; the extraction is a maintenance
improvement, not evidence of a smaller editor download. `editor-refactor` mounts
the real Hooks in React with recorded engine interfaces to check focus targeting,
touch events, independent feedback timers and unmount cleanup. The full editor
release suites separately cover actual engine and document behavior.

PropTypes diagnostics now fail unit tests and browser release checks. Sparse
multi-selection transform defaults and real inspector edit/undo are covered;
`hook-lifecycle` also exercises full-page callback routing and read-only Inspect
colour previews. SSR-only markup tests do not establish lifecycle behavior.

The following extraction moves frame properties/resizing, component source
resolution and property-library actions into focused modules. `editor-context`
uses real engines to check constraint reflow, commit/undo and live/snapshot
resolution order; the extraction keeps those APIs synchronous.

Optional surfaces have a separate download boundary. A `lazy()` declaration
alone does not defer a closed dialog when it is always mounted. Surfaces now
mount on first use and retain their instance after closing so Find query state
survives. The context menu loads on demand as well. `editor-optional-loading`
blocks cold module requests and checks Escape/outside cancellation, canvas
pixels, keyboard actions and reopening state. Re-run the bundle analyzer on
the release commit; the clean `baaed91` editor chunk baseline is 1,093,665
bytes (324,155 gzip). Its static import closure totals 2,513,663 bytes, including
shared entry chunks and excluding optional runtime imports. Neither figure is
an FPS measurement or a complete first-open network total.

Stroke parity uses the existing authoritative Canvas2D fallback for additional
paint lists and image/text strokes that the Skia scene format cannot carry.
This prioritizes correct pixels; it does not establish a hardware-GPU speedup.
Merged Boolean strokes now share local contours between Canvas2D and SVG.
The `boolean-stroke-export` gate checks four operations, three stroke positions,
paint alpha, nested holes, operand transforms and distant world coordinates
against explicit expected pixels. Curved operands retain the existing polygon
kernel's approximately 0.25 document-pixel tessellation tolerance; this is not
an unlimited-precision Bezier operation or a new GPU performance measurement.

The `svg-frame-clipping` gate checks transformed, rounded ancestor Frame clips
in the full PNG compositor and decoded SVG, including clipping-mask chains and
Frame selection exports. Ordinary folders preserve ancestry metadata, and
independently exported children remain standalone. Actual inspector toggles,
resize/move, screenshots and undo/redo exercise the visible stage as well.
Nested Frame clips use Canvas2D compatibility while the flat Skia adapter has
no representation for them. Boolean path operands and operand transforms unsupported
by the native painter use the same compatibility route. This does not certify general SVG layer effects.
The following `container-opacity` gate isolates a Frame/Group subtree before
applying alpha, including overlapping children, nested containers, clipping
chains and PNG-only adjustment backdrops. SVG adjustment effects remain outside
the supported export scope. Native blend modes composite the completed layer
once against its backdrop. PSD-only blend math is supported in PNG; SVG rejects
these unsupported modes explicitly instead of silently exporting normal blend.
Only non-unit-alpha containers become atomic layers;
their existing internal paint order is retained. An interleaved malformed
subtree uses its first member's paint slot, while ordinary opaque containers
retain the established flat order. The visible stage, one-step history and
project readback have separate browser assertions.

`boolean-resize` checks the shared synchronous mutation path through numerical
edits, real pointer handles, agent calls, constraints and project readback.
Stored operands and active child layers resize together; explicitly updated
batch children are not scaled twice. Regular resize retains scalar stroke and
radius values. An operand whose anisotropic transform exceeds the persisted
shear range is baked to an editable path so save/reopen preserves its geometry;
undo restores the original shape and hierarchy. This is correctness work, not
evidence of a faster Boolean kernel.

The following session extraction reduces `image_editor.jsx` from 3,687 to
3,330 lines. The new `editor-session` gate mounts real React Hooks with two
engines to check eviction snapshots, deferred selection, component-source return
contexts, the live-page cap and remote-listener cleanup. These are static imports;
the structural reduction alone is not evidence of a smaller initial download.

The next structural batch reduces the editor container to 3,135 lines and the
Page component from 1,330 to 168. Page activation, eviction, independent Skia
canvas refs, imports and title controls retain their interfaces in focused
modules. `editor-page-composition` covers real mount/unmount pixels, deduplicated
external images, title double-click rename and notice controls. Auto Layout's
public exports remain synchronous after normalization and reflow are separated.

Comments have a genuine optional download boundary: an empty, closed canvas
keeps the launcher while its thread views and controller load on demand. Saved
comments load their pins automatically. `comments-loading` blocks and fails real
module requests, checks cancellation and retry without replacing the canvas,
and verifies post/reply undo. `comments-lifecycle` checks initial unread pins,
camera geometry, draft/reply/filter retention, stale callbacks and unmount
cleanup. Escape registration remains eager so a cold feature cannot clear the
canvas selection while it is being dismissed. Compare clean release bundle
reports and network assertions; file splitting alone does not reduce download.

The next maintenance batch separates optional raster action implementations
from the always-mounted Hook. Matting, selection repair, repaint, outpaint and
image processing load at the action boundary; the Hook itself stays synchronous.
`raster-loading` checks actual network requests, click-time targets, cancellation,
single stroke consumption and bitmap/undo behavior. A physical ONNX model run
is not part of that loading-contract test.

Generated-output actions must also reach the application's real persistence
sink. A successful CPU/provider result alone is insufficient: a separate
candidate must load its new bitmap, leave the source intact and survive project
save/reopen. Candidate creation belongs to the existing page workflow; it does
not add a second generation menu or replace the source image silently.
The default free-canvas root must expose those actions too: the
`root-contextual-toolbar` gate starts with the actual New action and checks
one selection bar, pointer access, object/camera anchoring and empty-selection
cleanup. The final raster UI check keeps that root and a real containing Frame;
an artificially bounded document is insufficient coverage for this entry point.
`frame-child-pointer` additionally exercises multiple real children inside a
Frame. A successful click on an unparented image does not establish that Frame
children can be selected and moved independently of Group promotion.

Destructive Boolean and stroke expansion have a synchronous public mutation
contract. Their geometric implementation is split into focused modules while
remaining synchronously available; moving it behind a Promise would change
existing callers and history semantics. Do not report a lazy-loading benefit
for that structural change. The `destructive-boolean` browser suite checks
actual content pixels, stable layer IDs, result selection and source history.

`hook-lifecycle` checks React engine activation, overlay commits, page readiness,
draft/locale behavior, actual image loading and the independent CanvasKit canvas.
The source-comment policy test prevents reintroducing explicit dependency-rule
suppressions; it does not pretend the undeclared react-hooks plugin is installed.

## Snapping coverage

The legacy `tests/unit/snapping_e2e.test.js` filename denotes unit tests. Its grid,
pixel and option coverage is now mandatory and split into files under 400 lines.
The previous runtime probe incorrectly skipped five implemented isometric cases
because its point was outside the acquisition tolerance. Removing that gate
also removes pass-without-assertion fallbacks. Nearest isometric vertices are
checked against independent lattice enumeration, including adjacent staggered
rows and negative coordinates. `editor-snapping` separately uses real pointer
gestures, document pixel exports and undo/redo at different zoom levels.

## GPU spatial-filter correctness

`tests/e2e/gl-spatial-parity.e2e.mjs` replaces the three Node-only placeholder
skips with real WebGL2 shader execution and readback. Its 54 parameter pairs
cover high-pass, clarity and motion blur with opaque/mixed-alpha images, small
and large radii, preview scaling, live stacks and positive/negative angles.
Raw and visible RGBA retain the original per-channel tolerance of 3; the local
ANGLE SwiftShader run measured a maximum difference of 1 and verifies resource
release. CPU/GPU direction precision and radius bounds are now shared. This is
correctness evidence for that software renderer, not a physical-GPU FPS result
or a guarantee for every driver.
