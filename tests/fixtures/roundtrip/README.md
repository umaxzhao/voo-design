# Round-trip fixtures

Nine small original synthetic design files, licensed MIT under this repository's license. No downloaded material. Regenerate with `node tests/fixtures/roundtrip/generate.mjs`.

- `layout-1..3.fig`: real compressed Kiwi Figma containers; page, frame, group, rectangle, ellipse, editable text and a vector triangle, differing geometry/colors.
- `poster-1..3.psd`: real layered Photoshop documents written by ag-psd; folder, raster layers, editable text metadata and a layer mask.
- `graphic-1..3.svg`: linear/radial gradients, clipping, masking, text and translated groups.

These deliberately exercise format features; a successful import alone does not establish lossless original-format export.

Run the browser regression with Vite serving `127.0.0.1:5253`:

```sh
ROUNDTRIP_PHASE=after flock /tmp/voo-e2e.lock node tests/e2e/roundtrip.e2e.mjs
```

`ROUNDTRIP_FILTER=layout-1` (or `poster`) limits a diagnostic run to matching
fixture names. Omit the filter for the complete nine-fixture acceptance run.
Each fixture gets a fresh browser context to isolate imports between fixtures. Navigation waits for DOM content rather than all network loads;
UI waits allow 90 seconds and import/font operations allow 120 seconds on shared
machines. Progress logs distinguish import completion, editor mount and font
readiness. Screenshots and JSON documents are saved under
`/workspace/tmp/shots-roundtrip/`; native `.voo` reopening must preserve the
normalized layer tree and produce a zero pixel difference.
