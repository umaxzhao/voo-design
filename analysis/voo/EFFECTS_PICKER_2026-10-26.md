# Effects picker alignment with the voo-run design editor · 2026-10-26

Requested: keep the voo-run design-editor classification — colour-code
adjustments vs filters, with templates beside the kind list.

## Shipped
- `ADJUSTMENTS` group + icons: green `#7fd4a8`
- `FILTERS` group + icons: blue `#38bdf8`
- `EFFECTS` group + icons: purple `#b3a0ff` (same accents as the stack rows)
- Template column always renders when the layer can take adjustments, not just
  image layers. Image layers preview on their own bitmap; frames/groups/shapes
  preview on a small reference swatch (sky / skin / foliage / neutral bands +
  white/black patches) so tint, B&W and contrast presets stay judgeable.
- Template tiles without a thumbnail use a flat reference swatch (no gradient).

## Screenshot
`analysis/voo/assets/effects-picker-2026-10-26.png` (Frame selected, picker open)
