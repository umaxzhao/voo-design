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
| Signed world coordinates | Normalising negative roots moved unrelated siblings and grew the document on every drag step. Native artwork outside the original page had no hit surface; Canvas2D media was physically clipped. | `frame-negative-space.e2e.mjs` checks real pixels, labels, selection, independent child movement and exact undo/redo on all sides in both renderers. A viewport-sized surface preserves the world origin and bounds allocation by the visible workspace. |
| Legacy page edges | An uncropped free root still exposed document-edge resize hit regions at world zero; those could intercept Frame moves and Alt duplication and shift every sibling. | `frame-negative-space.e2e.mjs` uses an uncropped free root and verifies the absence of page-edge controls while retaining real Frame/child gestures across zero. Fixed documents keep their page resize controls. |
| Colour readback | The detached free-canvas measurement pass included selected borders and hovered corner controls, so sampling a red layer could return the control's mint colour. | `frame-reparent-contracts.e2e.mjs` explicitly keeps the object hovered and verifies its corner-control and selection-border pixels against the artwork colour. The readback uses a pure full-surface layer pass rather than the chrome pass. |
| Complete duplication | Alt-click cloned before any movement, cancellation retained edits, and recursive copies shared mutable data or retained old clipping links. | `frame-alt-duplicate.e2e.mjs` and `frame-duplicate-contracts.test.js` check nested content, independent data, internal links, one history entry and cancellation. |
| Reparenting | Drops could target a concealed rear Frame or a clipped descendant, split a nested paint block, or move new roots below a locked background. | `frame-reparent-contracts.e2e.mjs` checks real pointer drops, visible pixels, stacking, locks, complete subtrees and exact history restoration. |
| Image SVG copy | The node/clipboard SVG entry points omitted bitmap resource callbacks, so persisted image-only nodes disappeared from the result. | Signed-coordinate selection exports check embedded SVG pixels against PNG and current composited sampling. |
| Shared viewport surfaces | A focused root's full-viewport hit plane could hide other documents even when its artwork did not overlap them. | `frame-surface-camera.e2e.mjs` checks separate document focus and selection, actual pixels, pan/zoom, resize and DPR 2. Pointer reach follows clipped artwork rather than the full raster window. |
| Global adjustments | The legacy document-origin effect plane left negative and overflow artwork unadjusted. | `frame-adjustment-space.e2e.mjs` checks signed-coordinate pixels and composited sampling through camera changes and history. Free roots use the existing device-sized adjustment compositor. |

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
- Free-canvas node coordinates remain signed and stable. Rendering and hit
  windows follow the viewport without rewriting siblings, crop or document
  dimensions. Explicit selection exports retain their own signed bounds;
  this change does not redefine the full-document crop/export contract.
- Selected Frame PNG exports retain their own adjustment children, excluding
  adjustment metadata from bounds and excluding effects outside that selection.
  History stores the selection unit as well as its leaf IDs so a restored
  Group remains a complete unit on the next copy or drag.
- An internal two-finger navigation handoff finishes the preceding edit once;
  actual OS cancellation, Escape and blur restore the pending move instead.
  The existing real-touch `editor-refactor.e2e.mjs` keeps both contracts visible.

## Existing skipped contracts

The four collaboration skips are explicit workflow-era contracts: workflow
graph migration, workflow-store write barriers, workflow undo ownership and a
resource-authorization policy not defined by the free-canvas bridge. They are
not evidence that those scenarios work. They remain separate from the editor
renderer and interaction assertions above and must stay visible in test totals.

## UI and interaction sweep

The post-closeout sweep uses isolated real Chromium sessions, including trusted
touch input. It checks the current interface at 320, 390, 768 and 1440 pixels
and in narrow landscape, in both languages and interface themes. Screenshots
are visual evidence in the temporary audit directory; the assertions below are
retained in the release gate so this review is repeatable.

| Surface | Confirmed issues repaired | Retained browser coverage |
| --- | --- | --- |
| Welcome and files | Outside-pointer dismissal removed the file menu before its commands could run; cards lacked a keyboard-open target and nested menus could be clipped. | `ui-home-settings.e2e.mjs`: create/open/rename, stars, search, views, project folders, file menus, dialog focus, first-run flow and responsive geometry. |
| Settings | Modal focus could escape and was not restored; profile translation keys leaked into the UI. Changing the recovery-copy preference changed Hook order and crashed an open editor. | `ui-home-settings.e2e.mjs`: all Settings tabs, keyboard navigation, nested popovers, language/theme and the live preference switch. `ui-global-interaction.e2e.mjs`: the mounted production autosave Hook writes only while enabled and preserves its queue across toggles. |
| Inspector | Escape committed numeric previews instead of cancelling; nested paint-menu Escape cleared the selection. Narrow tab labels intercepted the panel toggle. | `ui-inspector-interaction.e2e.mjs`: actual edits, Enter/blur/Escape, exact undo, paint-menu ownership, tabs and real hit testing. |
| Touch workspace | Contextual actions inherited the camera transform and ran offscreen. Intermediate panel height transitions displaced the opposite toggle; the bottom More menu could open above the visible workspace. | `ui-responsive-editor.e2e.mjs`: immediate panel switching, viewport transitions, menu navigation and containment, contextual actions, camera gestures and Agent-panel entry. |
| Global commands | Search and command dialogs did not close from their non-input controls; the mobile title menu had no arrow navigation or initial focus. | `ui-global-interaction.e2e.mjs`: search/replace and undo, command empty states, modal focus/restore, export transparency states and touch-title menu Home/End/Escape. |

The existing renderer, export, drawing/retouch, page-drag, comments, loading and
history suites still run alongside this UI sweep. They are not replaced by
geometry-only assertions. These checks do not authorize or make paid provider
requests, submit authentication forms, or certify native Electron dialogs.
Uncommitted DeepSeek connector/plugin changes in the primary workspace are
preserved separately and are outside this verified commit.
