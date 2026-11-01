# Native Figma text appearance

Scope: `text.imported-appearance`, `compositing.custom-blend-viewport`, Figma mapping, text measurement and font
loading, Canvas2D/SVG rendering and renderer admission. `native_studio` excluded.
Execution receipts remain separate from functional coverage.

## Original file and reproduction

Read-only Desktop `NBA Business 101.fig`, 260094840 bytes, SHA-256
`ef02395035d7d3e8dfd6aca8323e3c32c290c87d8d46927452056f0aa3faa806`.
The file has four pages, 3689 native records, 713 original nonempty text records,
and 757 text layers after component expansion. Twenty expanded text records
carry glyph sizes different from the root size: e.g. a 36px first line and
64px second line were rendered uniformly at 64px. None of these text records
has a nonidentity native affine scale. RAW line height was also divided by
font size although its native value is already an em ratio.

712 original records carry glyph layout. The old mapper retained editable text
but discarded those outlines, so missing fonts changed shape, spacing and
wrapping. The initial baseline was 025058c7. During this task, upstream merged
the consolidation branch in e14ba19f. This repair was synchronized onto that
main revision; earlier targeted results do not certify the updated source.

Independent real-glyph pixel comparison also caught a redundant leading CLOSE
in native glyph streams. Canvas command construction ignores it, but an SVG
Path2D string starting with Z paints nothing. The converter now omits only
closes before the first MOVE; the browser fixture retains that native prefix.
The failing real-glyph comparison is kept separately from final acceptance.

## Performance investigation and blend repair

The font-only source `bc97a0fa107e6809d4c852365711e0aa830b4865` passed all
118 registered release steps (114 browser suites, 4912 units passed / 4 skipped,
1475 design files). It is not the final performance certificate. Two fresh
production orders retained 3897-node Page 1 and matching first-Frame geometry:
real key medians were 774 -> 1244ms and 840 -> 1408ms. Canvas measurements fell
2432 -> 274, but that reduction did not establish an input improvement. Keep
the regression, raw samples and high shared-host load in the private evidence.

A separate six-key CPU profile found pixel readback and custom blend arithmetic
dominated the work. Native Path2D constructions stayed 381 -> 381 and 467 text
cache records retained identity, ruling out repeated native-path parsing in
that sample. The viewport fixture reproduced a 1102x910 readback starting at
(-406,-190) for a 100x80 destination. Processing is now limited to the visible
canvas intersection, with transparent-source arithmetic skipped and original
dissolve coordinates retained. Device-space source placement and cached output
replacement preserve transform, parent clip and opacity. Last exact preview
tiles are bounded to 24 entries. Zero-alpha/vivid-light endpoints avoid NaN.

The independent browser reference checks all nine modes under three viewport,
clip/alpha configurations, cache reuse, offscreen rejection and actual keyboard
edit/undo/redo. The readback-bound, dissolve-phase and vivid-light failures are
retained. Both unit and browser repairs passed targeted checks; the combined
source now has fresh full-gate and paired production receipts below;
older stage results do not certify the final composition. Prior script failures
read unavailable page metadata and waited for an optional warm flag or a stale
camera snapshot; they are harness failures, not accepted timing samples.

## Real-engine leading normalization follow-up

The combined source 97023817 passed its registered 119-step gate (115 browser
suites, 4916 units passed / 4 skipped, 1476 design files). A separate actual
four-page engine audit still failed: all 756 outline records were present, but
only 677 were valid after loading. Exactly 79 records changed only signature
field 7: native 0.75 leading was clamped to 0.8 (77 on Page 1, two on Internal
Only Canvas). The 677 valid records showed no unintended geometry scaling.
That real-file failure is retained; a mapped cache count or isolated glyph
comparison does not certify that the live editor continues to use it.

Text nodes, named styles and the percentage field now share the same positive
1%-300% leading bounds and 1% editing step. Native 75% leading survives style
application and portable normalization. The native browser fixture now uses
0.75 instead of 1.2; two failing unit assertions were retained before repair.
The final source also includes upstream hosted repair/runtime fixes be4426e2
and desktop window chrome 196b6960. Its 121-step gate, live four-page cache audit
and timing receipts were recorded afresh; no historical gate is inherited.

## Repair

Keep the node editable, its source family and native text/style records, plus
a portable native outline/layout cache. Unchanged imported typography uses
those original glyph positions/sizes rather than replacement-font metrics.
Move, recolor and opacity changes retain the cache. Content/typography edits
use normal editable layout; undo restores the original cache. Native cached
text avoids font requests and font measurement until it actually needs new
typography. A weak record-keyed cache parses a Path2D once across repaint,
movement and recoloring; it expires with document/history ownership.

RAW line-height values remain ratios. Component text overrides invalidate
stale master glyphs; native derived replacement glyphs/layout are retained.
Incomplete glyph data is never cached as partial text. Unsupported native
decorations retain editable rendering rather than dropping decoration geometry.
The NBA source has no underlined or decorated text. Canvas2D paints the
outlines, SVG exports them as paths with text titles, and Skia admission uses
the authoritative Canvas2D path instead of substituting another font.

SVG paths preserve appearance, not editable SVG text. Native `.voo` retains
both editable content and the cache. This does not embed or redistribute a
commercial font, and cannot invent glyphs omitted from the source file.

## Final committed acceptance — 2026-11-02

Fixed application/test source `3d71b6d2dda95278810c575cceae390252538e1a`:
**121/121 steps**, 117 core browser suites, 4953 units passed / 4 skipped,
606 unit files passed / 3 skipped, 1481 design files and production build passed.
All assertions remained enabled. The clean source stayed unchanged throughout.
Ten standalone checks are not-run in this local gate; its functional coverage
remains partial. The same source's [CI](https://github.com/umaxzhao/voo-design/actions/runs/41341540741)
passed, including the separately executed actual Linux window job. Formatting
checks covered all 24 task JavaScript/JSX files without changing application code.
A first ad hoc format invocation incorrectly prohibited existing trailing commas;
that configuration failure is retained separately, not treated as a product defect.

Actual native file selection followed by API page activation loaded all four
production pages (12 / 3897 / 70 / 886 nodes). All **756/757** text caches were
valid in the live engine, with zero rescaled native boxes and zero page errors.
This certifies the loaded caches, not pointer interaction with the page switcher.
All 20 mixed-size cases plus one sample per nine outlined families produced
29 isolated comparisons with **zero RGBA differences** against independent
native glyph command construction. Origin/paint normalization limits still apply.

Two fresh production orders compare baseline `196b6960` to this exact source on
the same 3897-node Page 1, first Frame/camera, 1440x1000 viewport, DPR 1,
Chromium 156/Metal, Apple M4 Pro. Real keyboard edits and Ctrl-wheel inputs
include driver round trips and two frames; these are not physical latency/FPS.

| Order | Edit median ms before → after | Zoom median ms before → after | Import interactive ms before → after |
| --- | --- | --- | --- |
| Forward | 717 → 509.5 | 150 → 196.5 | 1996.7 → 2018.4 |
| Reverse | 720 → 463.5 | 150.5 → 151.5 | 1951.9 → 2011.8 |

Edit samples improve 29%-36%; import is not faster. **Zoom is unresolved**:
one order is approximately flat and the other is 31% slower. Keep that adverse
result; no zoom improvement or Figma parity is claimed. Canvas measurements fell
2436/2432 → 10, baseline M measurements 729/727 → 2. Shared-host load, API setup
and original corrected glyph geometry are recorded in raw receipts.

The verified production artifact was deployed via `scripts/deploy-editor.sh`
with build reuse and a server rollback backup. [Canonical preview](https://voo.run/editor/)
HTML plus seven entry/critical assets matched local SHA-256; the real online
native-font and blend keyboard/undo/redo checks loaded **76 distinct JS/CSS**
assets, all byte-identical, with zero page errors. Production cold portable
reopen was not run; that case passed in the unmodified registered local suite.
No desktop installer, tag or Release was issued; existing desktop binaries are
not certified updated by this Web deployment.

[Compact receipt](figma-text-fidelity-evidence.json),
[PR #89](https://github.com/umaxzhao/voo-design/pull/89).
Raw logs/scripts, retained failures, sample screenshots, full gate JSON and
publication hashes are archived locally under
`/Users/tt/.codex/visualizations/2026/10/26/01a175a0-cb5b-7133-9850-c4a861a4b01d/nba-font-fidelity/`.
The archive excludes original FIG/V8 source payloads; its SHA-256 manifest
indexes the preserved evidence. Later documentation-only commits do not change
this accepted application/test source.

## Acceptance rows

| Context | Assertions | Evidence/status |
| --- | --- | --- |
| Original units | RAW ratio, mixed-size native appearance, layout without replacement metrics, portable restoration. | Four failed assertions retained; original editable-layout assertion passed. |
| Original browser | Real native import, missing font and original 258x126 layout. | Failed: replacement layout width 43 instead of 258. |
| Unit repair | RAW ratio, exact outlines, no replacement metrics, edit invalidation, portable cache, malformed data, SVG/Skia routing, instance overrides and one parsed path. | Targeted and final 121-step gate passed on the recorded source. |
| Real browser | Native triangle glyphs at 36/64px, no installed face, zero replacement measurements, exact Canvas/SVG pixels, recolor/content edit, real keyboard undo/redo, cold `.voo` reopen. | Passed in the final committed full gate; public native scenario also passed. |
| Actual NBA mapping | Four pages retain geometry/assets; 756/757 text layers now carry original glyph appearance. | 350 assets / 258136898 bytes retained; all 756 caches valid in the actual four-page engine. |
| Source omission | One SFProText Semibold `9:41` clock has no glyph data, fill or stroke outline in the original. | Fallback remains; exact reconstruction not certified. |
| Performance | Actual large Page 1 import, text metrics, input/camera work in fresh production browsers before/after. | Final paired medians above; edit improved, import/zoom not certified improved. |
| Publication | Exact source, PR checks, canonical bytes and public interaction. | Canonical bytes and 76 actually loaded assets match; online text/blend interactions passed. |

The first synthetic archive omitted required Kiwi fields; those fixture errors
are retained separately and are not application failures. A chained-picker
attempt also failed before the typography assertions. The final scenario uses
an independent cold browser and retains all prior native-import assertions.

## Remaining contexts

Missing-font text editing cannot create unseen characters in an unavailable
face. Arbitrary rich-text edits/reflow, bitmap/rotated glyphs, every affine
combination, every page at readable scale, all effect/stroke combinations,
cross-driver rasterization and signed Electron remain unverified. No overall
Figma restoration percentage or FPS parity is established by these cases.
Two original text nodes also contain inline fill overrides different from the
base paint. Those style rows are retained, but independently painted rich-text
ranges are not repaired by this glyph-layout change. The real-glyph comparison
normalizes origin, fill and stroke/shadow settings; it certifies glyph geometry
in the sampled bounds, not complete page composition or inline paint fidelity.
The original `.fig` must be imported again: older imports discarded glyph data
and cannot recover it from an already-pruned saved document.
