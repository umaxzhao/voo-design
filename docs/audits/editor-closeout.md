# Editor renderer and interaction closeout

This review combines the mesh-gradient, automatic visual-reference, mobile page
ordering and stretch-layout deliveries. A previous commit's green report does
not verify later changes. Run `node scripts/verify-editor-release.mjs` on a clean
commit; its JSON report identifies the exact source and all executed gates.
Keep raw reports outside the repository rather than creating duplicate dated
verification documents.
The shared browser fixture waits until the document-entry pointer guard is off
before exercising controls, so temporary disabled inspector hit regions cannot
hide a stacking or interaction failure.

## Confirmed defects and coverage

| Area | Defect or missing evidence | Repeatable verification |
| --- | --- | --- |
| Mesh gradient | The parser returned points, but both canvas adapters expected ordinary gradient stops and painted nothing. SVG also lacked a valid mesh paint definition. | `mesh-gradient.e2e.mjs` compares Canvas2D, native Skia, PNG and SVG pixels, vector silhouettes, transforms, opacity, fill stacks, MCP edits, history and project reopen. |
| Automatic reference images | The reference-image helper bypassed `agent.confirmBeforeImage`, unlike the independent image-slot helper. | `html_pipeline/images.test.js` and `reference-confirmation.test.js` prove that only strict `false` allows an automatic request, supplied references remain usable, layout creation continues and variants share one permitted reference. Providers are mocked; these checks make no paid requests. |
| Page ordering | The old browser script assumed an external server and did not open an editor document. Pointer ownership and dismissal also left drag edge cases unverified. | `pages_dnd.e2e.mjs` opens the real editor through the isolated fixture and checks mouse and trusted touch input, rename/click behavior, scrolling, drag cancellation, cleanup, hit testing and safe-area layout. |
| Stretch | The initial tests covered a subset of geometry without proving the real inspector, MCP and persistence paths. | `auto-layout-stretch.test.js` adds vertical, wrap, hug, nested constraints, purity and convergence. `stretch-layout.e2e.mjs` checks real inspector pixels, the MCP alias, one-step undo/redo, build-layout acceptance and project save/reopen. |
| Batch creation | `build_layout` suppressed intermediate history but finished through an ineffective commit alias; runtime failures could retain a partial tree. | `build-layout-history.e2e.mjs` checks a single committed tree, nested batching and failure rollback without destroying the document, interaction context or redo branch. |
| Comments | An enclosing stacking context trapped floating comments below the inspector even though their own panels had a higher local layer. | `comments-loading.e2e.mjs` and `comments-lifecycle.e2e.mjs` retain real filter/reply clicks, loading recovery, layered Escape and unchanged selection. |

## Product and implementation boundaries

- The existing mesh representation is ordered SVG radial overlays over a base
  colour. Rendering support preserves that representation; it does not claim
  native Pen mesh interpolation or shader-fill compatibility.
- Native Skia supports mesh vector fills through the existing image-paint
  resource path. Unsupported mesh text/stroke scenes use the existing Canvas2D
  fallback. Fixed-size cached tiles avoid per-frame SVG decoding; this module's
  cache is not a bound on all paint-pattern or decoded-resource memory.
- Native `.fig` paints cannot express this mesh composite. Export must report
  the loss rather than crash or claim an editable native mesh.
- The image confirmation fix adds no new setting or dialog. Automatic
  reconstruction references follow the same opt-in rule as automatic image
  slots. The tests verify request suppression, not provider output quality.
- Stretch stays behind the existing advanced Auto Layout entry. Cross-axis hug
  retains measured dimensions, wrapping stretches within each line, and nested
  size constraints retain priority. The inspector's constants/alignment mapping
  are extracted without adding visible controls.
- A touch family button uses the full existing tool tile: tap an inactive
  family to activate its tool, then tap the active family to choose a variant.
  It does not overlay two competing hit regions or double the toolbar width.
- Chromium touch and safe-area emulation provide repeatable browser evidence;
  they do not certify every physical iPhone, browser or assistive technology.

## Existing skipped contracts

The four collaboration skips are explicit workflow-era contracts: workflow
graph migration, workflow-store write barriers, workflow undo ownership and a
resource-authorization policy not defined by the free-canvas bridge. They are
not evidence that those scenarios work. They remain separate from the editor
renderer and interaction assertions above and must stay visible in test totals.
