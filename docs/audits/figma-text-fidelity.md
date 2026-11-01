# Native Figma text appearance

Scope: `text.imported-appearance`, Figma mapping, text measurement and font
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

## Acceptance rows

| Context | Assertions | Evidence/status |
| --- | --- | --- |
| Original units | RAW ratio, mixed-size native appearance, layout without replacement metrics, portable restoration. | Four failed assertions retained; original editable-layout assertion passed. |
| Original browser | Real native import, missing font and original 258x126 layout. | Failed: replacement layout width 43 instead of 258. |
| Unit repair | RAW ratio, exact outlines, no replacement metrics, edit invalidation, portable cache, malformed data, SVG/Skia routing, instance overrides and one parsed path. | Targeted checks recorded separately. |
| Real browser | Native triangle glyphs at 36/64px, no installed face, zero replacement measurements, exact Canvas/SVG pixels, recolor/content edit, real keyboard undo/redo, cold `.voo` reopen. | Targeted browser passed; full committed gate pending. |
| Actual NBA mapping | Four pages retain geometry/assets; 756/757 text layers now carry original glyph appearance. | 350 assets / 258136898 bytes retained. |
| Source omission | One SFProText Semibold `9:41` clock has no glyph data, fill or stroke outline in the original. | Fallback remains; exact reconstruction not certified. |
| Performance | Actual large Page 1 import, text metrics, input/camera work in fresh production browsers before/after. | Pending fixed-source measurement. |
| Publication | Exact source, PR checks, canonical bytes and public interaction. | Separate post-publication receipt required. |

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
The original `.fig` must be imported again: older imports discarded glyph data
and cannot recover it from an already-pruned saved document.
