# VOO Design — WEAKNESSES (concrete partial / missing surfaces, ranked by likely user impact)

Evidence is file+line from the read-only inspection. For every "missing" claim the search pattern is
stated. Rank = expected user-visible impact when comparing VOO against Pen.app 1.2.15 / Figma.

---

## P0 — features users will try first and that are broken or absent

### 1. Hosted/direct-API AI is stubbed out in this build
`src/canvas/provider_client.js` is a stub module:

- line 1–3: *"Standalone decoupled provider client stub. Cloud AI generation runtimes are removed
  from the standalone editor."*
- lines 7, 11, 15, 19: `submitProviderJob` / `fetchProviderJob` / `streamProviderJob` /
  `streamProviderText` → `throw new Error("Cloud AI generation runtime is not configured in
  standalone mode.")`
- lines 23, 27: `submitAsrJob` / `fetchAsrJob` → same for ASR.
- line 31: `testProvider` → `{ success: false, message: "Standalone local mode" }`.
- line 35: `getProviderConfig` → `null`; line 47: `listProviderModels` → `[]`.

`src/canvas/model_route_resolver.js` is the same story: line 2 *"Standalone model route resolver stub"*,
`resolveModelRoute` → `null` (line 6), `resolveProviderForRoute` → `null` (line 10),
`resolveCanvasModelRouteCandidates` → `[]` (line 18).
`src/canvas/rpc.js` lines 46/50/58 return `null` and line 62 is a literal *"No-op in standalone mode"*.

**What still works** (important for fair comparison): local ONNX AI (matting/upscale/inpaint/repair),
the newer `src/shared/providers/provider_registry.js` path used by
`src/canvas/agent/image_generation.js:runImageJob`, and CLI-agent text (desktop). **What is broken**:
- AI layout generation for non-CLI models — `src/canvas/store/layout_action_helpers.js:53`
  `streamLayoutText` falls through to `streamProviderText` (line 88) / `submitProviderJob` (line 94).
- AI layer repaint (`src/canvas/editor/layer_repaint.js:319`).
- Provider settings model lists / route badges (`components/provider_model_list.jsx:11`,
  `provider_route.js:14`, `components/provider_card.jsx:9`) render empty because
  `listProviderModels` returns `[]` and `getProviderConfig` returns `null` — **UI affordance exists
  but is non-functional**.
- Settings copy: `src/shared/i18n/core-en.js:621` *"Standalone mode requires Direct API nodes.
  Please configure API Key first."*

### 2. Collaboration is complete code that nothing calls; share links cannot start a room
- Entire stack present: `src/canvas/collab/` — 12 modules (session, protocol, chunking, presence,
  identity, room, stroke_bus, webrtc_transport, collab_config, session-lifecycle, use_collab,
  blob_worker).
- `src/canvas/collab/use_collab.js` line 5 hard-codes `status: "off"`; re-exported helpers are
  no-ops with comments *"Standalone mode: all images are already local"* (line 16) and
  *"Standalone mode: collab identity is local"* (line 24).
- `grep -rn "createCollabSession" src/` ⇒ **1 hit, the definition** in
  `src/canvas/collab/session.js:52`. Nothing imports it.
- `src/canvas/store/share_actions.js:38` reads `initial.collabSession?.getSnapshot?.()`, but
  `grep -rn "collabSession" src/` ⇒ **this one hit only** — the store never creates it, so
  `shareWorkflow` cannot produce a working `/r/<id>` link.
- `grep -rli "collab" tests/` ⇒ **0** — no behavioural proof either.

- Dead share modules: `src/canvas/store/share_actions.js:2` and
  `src/canvas/store/template_ugc.js:7` both `import { scheduleSave } from "./persistence.js"`, but
  **no `persistence.js` exists** in `src/canvas/store/` (and `template_ugc.js` also imports a missing
  `../template_ugc.js`). Neither module is imported anywhere (`grep -rn "share_actions|template_ugc"
  src/` ⇒ 0 importers, only allow-list mentions in `shared/persistence_contract.js:257` and
  `undo_contracts_workflow.js:299`), so the broken imports are outside the build graph — evidence
  that the sharing path was severed from the app rather than finished.

### 3. No prototyping / interactions, and no canvas comments
- Prototyping: `grep -rniE 'prototyp|hotspot|navigate to|interaction:' src/canvas/` ⇒ **0 hits**
  (all "interaction" strings are pointer/commit-boundary comments). There is no link/hotspot/
  transition model and no prototype player. Presentation is a linear slideshow
  (`components/presentation/presentation_viewer.jsx`).
- Comments: `grep -rln "comment" src/` ⇒ **6 files**, all i18n dictionaries or Figma/zip fields.
  No comment model, no anchored threads, no resolve state. `src/canvas/annotations/*` is AI
  reference-image marking, not collaboration (`annotations/image_annotations.js:createAnnotation`).

### 4. Components: no variants, and overrides are limited to 3 fields
- `src/canvas/editor/instance-overrides.js:12`:
  `OVERRIDE_FIELDS = ["text", "fill", "visible"]` — no geometry/size, stroke, effect, image,
  rotation or nested-instance overrides, and no "reset overrides".
- Variants/properties: `grep -rniE 'variantSet|componentProperty|componentProperties|variants:'
  src/canvas/editor/` ⇒ **0**. `grep -rni 'variant' src/canvas/editor/*.js` ⇒ only unrelated prose
  (shader variant, MLS rigid variant, brush pressure variants).
- No component/instance tests: `grep -rliE 'component_extract|instance-overrides|instance-snapshot'
  tests/` ⇒ **0**. The context menu does expose create/detach
  (`components/editor_context_menu.jsx`: `editor.component.create`, `editor.component.detach`).

### 5. Styles and variables are shallow compared with Figma
- **No reusable color/text/effect style library**:
  `grep -rniE 'colorStyles|paintStyles|effectStyles|textStyles:' src/canvas/editor/scene_model*.js`
  ⇒ **0**. The "Text style" panel (`components/editor_properties/text_section.jsx:95`) is a per-node
  collapsible section, not a shared style.
- **Variables are one flat doc-level color list**:
  `src/canvas/editor/scene_color_variables.js` supports add/bind/delete of hex colors on
  fill or stroke only. No collections, no modes/themes, no numeric/string/boolean variables, no
  aliases (`grep -rniE '\bmodes\b|\bthemes\b' src/canvas/editor/*.js` ⇒ blend/brush "modes" only).
- No dedicated tests for variables or styles.

### 6. Layout: no resize constraints; auto layout is partial and untested
- Constraints: `src/canvas/editor/content_constraints.js` is about **lock semantics** for agent
  edits (lock / lockPosition / lockImagePixels / lockTransparency), not child resize constraints.
  Searches: `grep -rniE 'pinLeft|pinRight|constraintType|horizontalConstraint' src/` ⇒ **0**;
  `grep -rni 'constraint' src/canvas/components/editor_properties/` ⇒ **0**.
- Auto layout: model + panel + reflow exist (`scene_auto_layout.js:normalizeAutoLayout`,
  `auto_layout_section.jsx`, `auto_layout_child_section.jsx`, `layout_*` helpers) but
  `grep -rliE 'auto_layout|autoLayout' tests/` ⇒ **0**, and there is no hug/fill frame sizing
  (search `hugContents|fillContainer` ⇒ 0).

---

## P1 — significant partials

### 7. Rulers and guides are data-only; grid snapping is unreachable
- Rulers: `grep -rni 'ruler' src/` ⇒ **1 hit**, a serialisation comment
  (`scene_model_serialization.js:151`). No ruler component.
- Guides are persisted (`doc.guides`, consumed in `scene_snapping.js:128`) but
  `grep -rn 'guides' src/canvas/components/` ⇒ **0** — no UI creates or drags them.
- Grid snapping: `scene_snapping.js:82` reads `options.snapToGrid` and lines 149/225 implement rect
  and isometric grid snapping, **but both call sites pass no options object**
  (`editor_pointer_move.js:361`, `editor_pointer_transform.js:529` and `:638`), so `snapToGrid` is
  always `false`. The grid toggle only sets the document grid for the *view-only overlay* drawn in
  `editor/chrome_draw.js:245` ("View-only grid overlay (never exported)") and `engine.setGrid`.
  Net effect: the grid button shows a grid but dragging never snaps to it. There is no snap-to-grid
  test (`grep -rli grid tests/` ⇒ only unrelated).

### 8. Motion is a video player, not animation
- `src/canvas/editor/video-layer-runtime.js:4` — *"There is no shared timeline."* Each video layer
  owns an `HTMLVideoElement` loop; in/out points, volume, mute, loop only
  (`scene-video.js:normalizeVideoNode`).
- No keyframes/playhead/easing: `grep -rni 'keyframe' src/` ⇒ storyboard AI i18n only.
- Motion UI is beta-gated: `components/editor_properties/properties_panel_header.jsx:54`
  `{EDITOR_BETA_ENABLED && onToggleMotion ? …}`; playback controls in
  `editor_canvas_instance_properties.jsx:155,246` are also beta-gated.
  `EDITOR_BETA_ENABLED` is false unless `DEV`, `VITE_LOCAL_EDITOR=1` or `VITE_EDITOR_BETA=1`
  (`src/canvas/editor-beta-features.js:16-24`). No test file references the beta module
  (`grep -rln EDITOR_BETA tests/` ⇒ 0).

### 9. Dev mode / code generation is limited to HTML+CSS
- Only Copy HTML/CSS (`editor_context_menu.jsx` `editor.menu.copyHtmlCss`), Copy SVG, and full-page
  HTML export (`editor/editor_html_export.js:documentToHtml`).
- `grep -rniE 'devMode|dev_mode|inspect panel|codegen' src/` ⇒ **0**; no measurement overlay, no
  React/Tailwind output, no inspect sidebar.

### 10. Import/export format holes
- **No Pen `.pen` import.** `grep -rniE '\.pen\b|pen\.dev|pen file' src/ electron/` ⇒ only the pen
  tool + i18n; `store/save_formats.js:SAVE_FORMATS` has voo/svg/fig/psd only.
- **No PDF import.** `grep -rni 'pdf' src/canvas/store/project_io.js` ⇒ 0; no `pdfjs`/`pdf-lib`
  dependency in `src/`.
- **No user-facing HTML import.** The HTML→layers parser exists
  (`editor/html_import.js:incrementalHtmlToDocument`) but is wired only to AI streaming previews
  (`components/streaming_layout_preview.jsx:3`, `store/layout_action_helpers.js:14`);
  `grep -rn 'html_import' src/canvas/store/` ⇒ only layout_action_helpers (generation, not import).
- **Lossy writers**, truthfully reported:
  - SVG writes only 6 node kinds (`store/svg_document_io.js:12 SVG_WRITABLE_KINDS`) and drops
    additional pages (`svgSaveLosses` line 49).
  - FIG writes only frames/rect/ellipse with solid fills
    (`store/save_formats.js:10` comment; `figma/voo-to-fig.js:57 figSaveLosses`).
  - PSD save path loses unsupported nodes; export dialog offers 6 formats only
    (`components/editor_export_dialog.jsx:8 FORMATS`).
- No GIF/video/WebM canvas export: `grep -rniE 'remotion|exportVideo|mediarecorder' src/` ⇒ 0 canvas
  exporter (only the ai-media pipeline in `shared/voo_engine_client.js`).

### 11. Presentation ships but is untested and thin
Deck model/viewer/PPTX/PDF (`presentation/*`, 7 components + 7 engine modules) with **no tests**
(`grep -rli presentation tests/` ⇒ 1 unrelated). No speaker notes or presenter window
(`grep -rni 'speakerNotes|presenterNotes' src/` ⇒ PPTX notes XML writes an empty notes part).
Unsupported slides are rasterised and reported as warnings
(`components/presentation/presentation_export_dialog.jsx`).

### 12. Autosave is disabled in the shipped desktop mode
`src/canvas/components/editor_hooks/use_editor_autosave.js:14` — *"In standalone desktop app mode,
automatic background saving to server/draft is disabled. The document follows Photoshop-style manual
save"*; line 16 returns no-op implementations when `disabled`. The debounced saver itself
(`editor-autosave.js:createEditorDraftSaver`, `EDITOR_AUTOSAVE_DELAY_MS = 600`) is real, so this is a
policy flag, not missing code — but users get no crash recovery by default.

### 13. Desktop-only features are gated and the web build degrades silently
`src/canvas/platform_capabilities.js` declares the split (registry lines 43–107):
- `AI_LAYER_SPLIT` (43) — unavailable on standalone web (`editor.taskbar.splitLayersUnavailableWeb`).
- `REVERSE_PROMPT` (55) — same.
- `NATIVE_MEDIA_SAVE_LOCATION` (80) — desktop only, fallback `browser_download`
  (`editor.exportBrowserLocation` is what the export dialog shows on web).
- `BACKGROUND_AGENT` (88) — desktop/extension only.
- `DESKTOP_INTEGRATIONS` (100) — desktop only (`agent.connection.requiresDesktopApp`).
- `TRIPO_WEB` — requires the browser extension.
Settings/feature copy reflects these, but two long-standing stubs sit underneath:
`src/canvas/provider_client.js` (above) and `src/canvas/rpc.js` no-ops.

### 14. Only one canvas type remains
`src/canvas/editor/canvas-composition-model.js:13` — `CANVAS_TYPES = Object.freeze([CANVAS_TYPE.DESIGN])`
and the file comment: *"Every document is a design canvas. Older files may carry other canvas types
and their data; reading them ignores those fields."* 3D/model/audio media sections exist but are
beta-gated (`media_section.jsx:156`), and canvas-instance playback/3D properties are beta-gated
(`editor_canvas_instance_properties.jsx:155,246`). Any Pen/Figma parity claim about scene/3D/embed
canvases should be treated as absent.

### 15. Untested subsystems (risk of silent regression)
Explicit zero-hit searches over `tests/` (see COVERAGE §6): collaboration, masks, effects rendering
(`blend_math`, `pixel_filter`, `node_effects`, `gl_*`), auto layout, components/instances,
variables/styles, presentation, motion/timeline (beyond node normalisation), warp/puppet/mesh,
lasso/brush/pressure, image adjuncts (outpaint/auto-enhance/portrait/saliency/layer-split), export
dialog & PDF/HTML/PPTX, dev mode, canvas accessibility. The areas with strong tests are booleans/
paths, snapping/spacing, workspace/storage/settings, agent bridge/onboarding, figma import/export,
and spatial performance.

---

## P2 — smaller but real

### 16. No local/system font enumeration
`grep -rni 'localFont|system font|fontFace' src/canvas/editor/font_loader.js
src/canvas/components/font_picker.jsx` ⇒ **0**. Users get bundled OFL families + Google Fonts
(1,949 index entries, fetched on demand); offline users cannot use installed fonts. Font fetches
are network-dependent (`VITE_MODEL_BASE_URL`-style host only for models; fonts come from Google).

### 17. Image adjuncts are low-confidence (heuristic, untested)
`auto_enhance*.js`, `portrait_retouch*.js`, `saliency_map.js`, `outpaint_*.js` (18 files) have
**no tests** and are CPU heuristics; `grep -rliE 'outpaint|auto_enhance|portrait_retouch|saliency'
tests/` ⇒ 0. `local_matting`/`local_upscale`/`local_inpaint` inference paths are likewise untested
beyond model-asset loading (`tests/unit/model_asset_loader.test.js`, 5 cases).

### 18. Accessibility gaps
107 component files use `aria-label` and 62 use `focus-visible`, and the design linter enforces the
focus-ring token (`scripts/check-design.mjs` → `design/lint.cjs`). Missing: focus traps
(`grep -rniE 'focusTrap|trapFocus' src/` ⇒ 0), an accessible layers tree
(`grep -rniE 'role="tree"|aria-activedescendant' src/canvas/components/editor_layers.jsx` ⇒ 0), a
canvas node-tree alternative, and any automated a11y test (only `align_section.test.jsx` asserts
focus tokens; `navigation_ergonomics` covers keyboard paths).

### 19. i18n: only two locales
`src/shared/i18n/` has `en`/`zh` only (4,081 keys each, exact parity). No ja/es/fr/de, no RTL
support (`grep -rni 'rtl|dir="rtl"' src/` ⇒ 0), no locale negotiation from `navigator.language`.

### 20. Stale docs and beta flags
- `analysis/README.md` says 335 editor files; `find` says 349.
- `TEST_READY.md` claims 61 files / 686 tests; today 87 files / ~986 declared cases.
- `PROJECT.md` marks M2 IN_PROGRESS, M3/M4 PLANNED though onboarding/island/agent-panel code is
  present and tested; `PROJECT.md` also describes a 3-step onboarding while the code ships 4
  (`onboarding_state.js:ONBOARDING_STEPS`, legacy `GUIDE_STEPS` retained for old tests).
- `src/canvas/editor-beta-features.js` gates motion/3D/model/playback UI with no test coverage and
  no in-product way to discover it (`grep -rln 'editor-beta-features' src/` ⇒ 5 components, 0 tests).

---

## Method note on "missing" claims

Every `missing_expected` row in `features.jsonl` carries the search pattern(s) used in its
`completeness_note`. Patterns were run with the repo's `grep`/`rg` over `src/`, `electron/` and
`tests/`. Where a feature is absent because a subsystem was deliberately removed from the standalone
build, the stub module is cited rather than "not found" (`provider_client.js`, `model_route_resolver.js`,
`rpc.js`, `collab/use_collab.js`).
