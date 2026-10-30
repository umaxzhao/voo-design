# Image editor acceptance matrix

This is the maintained coverage map, not a claim that every possible interaction
or platform is certified. Run the checks on the exact clean revision; reports
belong outside the repository. Video is excluded from this audit by request.

## Reproduction

`node scripts/verify-editor-release.mjs` builds the production application, runs
the design gate, every unit test and all registered offline browser suites.
The release report records the revision and rejects source changes during testing.

`node scripts/verify-image-editor.mjs` additionally runs the native Electron
filesystem and bundled-model checks, real network/model inference and the
pan/zoom/drag FPS gate, opening a real document from the workbench first. It records external blockers separately and exits
nonzero if any required check remains blocked. It never makes a paid API call.
Set `VOO_IMAGE_AUDIT_DIR` to an empty evidence directory outside the source tree.

The isolated browser opens a new document through a private MCP relay. Native
tests set private user-data, Documents and workspace directories before starting
Electron. No test edits the user's current document, workspace or OS Trash.

## Functional coverage

| Surface | Acceptance evidence | Boundary |
| --- | --- | --- |
| Workbench, onboarding, Settings | `ui-home-settings`, `ui-global-interaction`, `welcome-covers`, `project-picker` | Real navigation, menus, modal focus, theme/language, cover recovery and document opening. |
| Assets and templates | `editor-resources`, `editor-resources-built` | Production build, persistent workspace Resources, image/SVG/.voo imports, components, template insertion and undo. |
| Selection and Frame hierarchy | `frame-child-pointer`, `frame-negative-space`, `frame-alt-duplicate`, `frame-reparent-contracts`, `frame-surface-camera` | Real selection/movement, negative world coordinates, complete subtree duplication, reparenting, clipping and undo. |
| Tool menu choices | `image-toolbar-complete`, `drawing-retouch` | Every option in seven real tool-family menus. Brush/eraser/blur/sharpen/smudge/dodge/burn/sponge, spot/clone/patch, shapes and pen variants assert pixels or created artwork and undo. Selection-only menu checks are not counted as drawing checks. |
| Pixel selections and deformation | `image-selections-warp` | Rectangle/ellipse/lasso/polygon/magnetic, wand, inversion/clear, perspective/distort/puppet handles, eyedropper, grab-hand camera and crop cancellation. Model prompt focus and Escape do not claim inference. |
| Local AI tools | `image-network` | Real model download, foreground removal with alpha change and undo, a straight object-selection scribble, AI repair with changed pixels and undo, all three upscale choices with actual ONNX execution; network-offline reloading verifies persistent browser bytes and SHA-256. Interpolation fallback cannot pass an AI inference assertion. |
| Tonal adjustments, filters and styles | `image-adjustments-complete` | All 43 adjustment kinds, 11 layer styles and 23 ordered live filters change real exported pixels; undo restores the original; scalar/style redo paints again. These are engine outcome tests, not every possible slider value. |
| Style alpha and text | `image-layer-alpha` | Seven inner styles preserve transparent holes and apply layer opacity once; text bevel renders glyph edges, responds to size, and undoes. |
| Inspector fields | `image-inspector-core`, `ui-inspector-interaction`, `inspector-controls` | Actual image/rectangle/Frame X/Y/W/H/rotation/shear/radius edits, flips, Enter/blur/Escape, mixed selection, color/text/variants, variables, filter ordering and export controls. |
| Layout and masks | `layout-mask-audit`, `stretch-layout`, `frame-clip-review`, `container-opacity`, `frame-adjustment-space` | Layout reflow, nested constraints, stretch/wrap/hug, clipping, layer opacity, masks and frame-scoped adjustments. |
| Boolean/vector exports | `boolean-stroke-export`, `boolean-resize`, `svg-frame-clipping`, `image-svg-parity` | Real SVG decoding compared with rendered pixels, including crop, transforms, opacity, adjustments, styles, shadows, strokes, backdrop blur, glass and global adjustment layers. Backdrop readers use a flattened scene; selection copies include only selected artwork. Ordinary vectors stay vector elements. |
| Images and asynchronous imports | `image-assets-history`, `image-agent-complete`, `generated-output` | In-flight image decoding retains later edits; successful images in one stock batch undo once; partial download failures are returned; generated apply/discard and stale-result ownership. |
| Downloaded export formats | `image-export-formats` | Actual PNG/JPEG/WebP/SVG pixels, parsed layered PSD and PDF page units/embedded RGB, exported through the real dialog. Command recents retain unique rows and keyboard IDs. |
| Native storage | `image-electron`, `workspace-trash-recovery.test.js` | Real image-bearing .voo bytes, folder move/rename, in-app Trash listing/read/restore, collision refusal, rollback on metadata failure and no permanent-delete fallback. |
| Agent/MCP | `image-agent-complete` | A registry guard accounts for all 74 advertised tools. 69 local/document tools use the real relay and assert document results. Five provider/network-dependent tools have explicit external evidence requirements. A successful basic call does not certify every argument combination. |
| Touch and narrow layouts | `pages_dnd`, `ui-responsive-editor`, `ui-global-interaction` | Trusted touch input, long-press page ordering versus scrolling, pinch/cancel, keyboard menus, panel switching, safe-area geometry and contained floating controls. This is Chromium emulation, not physical iOS/Safari certification. |
| GPU and CPU rendering | `gl-spatial-parity`, `mesh-gradient`, `image-adjustments-complete` | Real GL pixel comparisons and Canvas2D/Skia/PNG/SVG paint checks; no assertion that every backend supports every effect natively. |
| Large layer trees | `image-layer-window` | Bounded DOM rows, end-of-list scrolling, pointer/arrow selection, offscreen focus mounting, scrolled pointer reordering with one undo, rename/undo and full-tree search. Variable-height rows are measured without retaining deleted node objects. |
| Performance | `canvas_fps` | Separate pan/zoom/drag measurements at 1k/5k/20k nodes with the existing 30 FPS gate. The fixture uses plain rectangles; results depend on the recorded device/backend. |

The dead `RETOUCH` enum entry was removed; the functioning sidebar Retouch action
is separate. `AI_SELECT` remains an object-selection alias, not an extra drawing
engine. The enumerated tool IDs and real menu submodes are different inventories.

## Defects repaired by this audit

- Large development documents repeatedly validated the same panel model in every
  row and scanned rows quadratically. Scrolled drag slots retain their full root/sibling positions. Immutable successful contracts are shared,
  child presence is indexed and only visible layer rows are mounted. Validation
  errors and full-tree navigation remain active.
- Free canvas roots bypassed the GPU rectangle preview cache. Cached pictures now
  preserve signed/out-of-page bounds and omit sheet clipping. Dense hit regions
  retain exact unions and update only changed nodes; backend routing checks use
  immutable identities. Overlay-only frames build pointer indexes lazily.

- Image/text bevel previously returned without painting and ignored bevel size.
- Inner styles operated on the painted page instead of an isolated layer, losing
  transparent holes and applying partial opacity incorrectly.
- SVG exports silently dropped pixel adjustments and layer styles. Live exports
  now embed affected layers; Save/Export explains the editable-effect limitation.
- Object-selection scribbles were clipped as closed polygons; a straight stroke
  could never select its touched foreground object.
- The hand tool did not initiate shared-camera panning over artwork.
- First-use model dialogs lacked modal focus handling and keyboard cancellation.
- `lint_design` interpreted its execution context as the engine; stretch and
  nullable component overrides had schema/implementation mismatches.
- Imported bitmap IDs could not be vectorized or submitted for image editing;
  vector/icon expansion fragmented history and lacked partial-failure rollback.
- Image insertion captured an old document before decoding and could overwrite
  intervening edits. Decode/staging and synchronous commits now share one path.
- Native deletion could go to an OS Trash that the application could not restore,
  overwrite same-name trash entries, or permanently unlink on fallback failure.
- Upscale choices referenced missing weights. Two pinned, checksum-verified BSD
  models now supply three outputs; the 2x choice downsamples a real 4x inference.
- Recent commands duplicated ordinary palette rows and active-descendant IDs;
  each recent command now appears once. Public stock search falls back to
  Wikimedia Commons while retaining licenses, attribution and upstream warnings.

## Structure and model delivery

Asset tools are separated into shared validation, image, vector and stock/icon
modules behind the existing registration facade. The layer controller delegates
image insertion and SVG editing to focused modules. Duplicate image staging and
the obsolete bevel implementation were removed. New code modules stay below
400 lines; this does not mean all historical oversized application files have
already been refactored. No runtime dependency was added.

Client weights live in tracked `vendor/client-models`, with a pinned provenance manifest and
the upstream BSD notice. Electron builds include these small weights; native IPC
reads them locally. Web builds continue to omit weights from ordinary asset
copying; deployment publishes them independently for first-use browser caching.
Inference stays on the device. General 2x/4x share one weight rather than keeping
duplicate models. Background-removal and repair weights retain their existing
independent delivery and local-cache paths.

## Explicit remaining evidence requirements

- The requested Gen Image/OpenAI generation needs `OPENAI_API_KEY` in the process
  environment. Never read a secret file or paste a key into a report. Provider
  edit/vector requests require their actual configured provider and are not
  certified by mocked contract tests.
- Public stock search is live-tested. Openverse returning zero results triggers
  a real Wikimedia Commons search and image download, with explicit source,
  licenses, attribution and warnings. If both sources fail, that remains blocked.
  The deterministic stock batch test verifies local insertion/history only.
- Browser-extension image generation requires its signed-in extension; it is not
  substituted for the user's requested API workflow.
- Signed installer behavior, native OS file chooser interactions, physical mobile
  devices and cross-OS hardware are not certified by a development Electron run.
- Four legacy collaboration/workflow compatibility tests remain skipped in the
  full suite. They are not counted as passes or removed to improve the totals.
- SVG backdrop blur, glass and global adjustment layers are explicitly flattened
  and pixel-compared, including transparent selection copies. Unsupported SVG
  blend modes still fail explicitly; every possible blend/mask combination is
  not certified. Keep the .voo source for editable effects.
