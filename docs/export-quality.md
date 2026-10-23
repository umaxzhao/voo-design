# Export quality audit

The export facade delegates raster work to `editor_export_raster`, selection and
region helpers; SVG uses `documentToSvg`/`nodesToSvg`. The dialog hook flushes edits,
expands component instances and passes encoded files to the shared media saver.

| Area | Current state and changes in this PR | Deferred commercial-quality gaps |
| --- | --- | --- |
| Frame bounds | Page export uses `effectivePage` (including nonzero crop origin). Shared pixel sizing clamps tiny scaled selections to at least one pixel. SVG selection now uses transformed AABBs and a world-coordinate viewBox instead of rebasing only x/y. | Stroke/shadow bleed outside selection geometry; arbitrary rotated artboard clipping. |
| Background | Explicit transparent option travels from dialog to PNG/WebP/SVG/PDF. It suppresses the document sheet, including with blend modes. Opaque export uses the document color or white. JPEG page, selection and slices composite onto an opaque background. | Blend colors necessarily differ when their sheet backdrop is removed. No CMYK/ICC or HDR pipeline. |
| Vector fidelity | Native SVG rects, ellipses, paths, gradients, boolean geometry and masks remain vector. Selection no longer shifts node x/y independently of world-coordinate path data. | Full effect, complex stroke and boolean intersection parity; no vector PDF backend. |
| Text | Editable SVG text/tspans remain text. Dialog now supplies measurement context for wrapped lines in frame and selection SVG. | Font embedding/subsetting, rich run parity and explicit text-to-outline mode; recipient needs matching fonts. |
| Effects | Raster exports use the scene renderer; selection now uses it too, preserving clipping/compositing rather than painting isolated nodes. SVG has partial shadow support. | Full SVG shadow/filter, adjustment, warp and blend parity. Geometry selection bounds can clip effects. |
| Images | SVG hook embeds available images/mattes as PNG data URLs; component instances expand before export. Raster uses full-resolution rendering. | Missing bitmap assets can still be omitted; SVG does not bake every raster adjustment/warp. |
| Scale/DPI | Existing 1x/2x/3x UI controls sampling; page and selection validate scale and keep fractional origins. PDF physical dimensions remain 96 CSS px per inch (0.75 pt/px), independent of sampling scale. | Explicit print DPI metadata and resampling presets; allocation limits/tiling. |
| Multiple outputs | Selection includes group descendants in paint order and excludes hidden ancestors; PNG and SVG share selection filtering. Raster slices retain page-relative cropping, alpha and scale. Unsupported vector/PDF/PSD slice encodings now fail instead of writing PNG bytes with misleading extensions. | Batch multi-artboard export, multipage PDF, ZIP packaging, vector slices. |
| PDF / related | PDF is a single raster image with lossless RGB + alpha for PNG inputs; JPEG input can be embedded. PSD retains its existing layer exporter. Shared saver supports native save/browser download. | Editable/vector PDF text and shapes, PDF/X, color profiles; PSD feature parity. HTML/3D/presentation exporters are outside this PR. |

## Validation and samples

`tests/unit/export_quality.test.js` covers crop transforms, alpha options, JPEG
compositing, fractional sizing, group selection, SVG vector/text preservation and
rotated viewBoxes. Existing SVG mask tests remain relevant.

Start Vite on port 5179 (`VOO_LINK_PORT=18632 npm run dev -- --host 127.0.0.1 --port 5179`),
then run `node tests/fixtures/export-quality.mjs` with Playwright installed.
`EXPORT_SAMPLE_URL` overrides the URL; `PLAYWRIGHT_MODULE` can point at a temporary
Playwright module. The fixture checks actual PNG alpha and crop/selection sizes,
and writes `/workspace/tmp/export-png.png`, `export-jpeg.jpeg`,
`export-selection.png`, `export-svg.svg`, and `export-pdf.pdf`.
