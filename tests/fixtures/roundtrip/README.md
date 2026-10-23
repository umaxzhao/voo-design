# Round-trip fixtures

Nine small original synthetic design files, licensed MIT under this repository's license. No downloaded material. Regenerate with `node tests/fixtures/roundtrip/generate.mjs`.

- `layout-1..3.fig`: real compressed Kiwi Figma containers; page, frame, group, rectangle, ellipse, editable text and a vector triangle, differing geometry/colors.
- `poster-1..3.psd`: real layered Photoshop documents written by ag-psd; folder, raster layers, editable text metadata and a layer mask.
- `graphic-1..3.svg`: linear/radial gradients, clipping, masking, text and translated groups.

These deliberately exercise format features; a successful import alone does not establish lossless original-format export.
