# VOO Design — FEATURES (narrative map of what exists today)

Read-only inventory of `/Users/tt/teamwork_projects/voo_design` at analysis time. Every claim cites a
file (and symbol) in the repo; test paths are named where a test actually exercises the behaviour.
Machine-readable rows live in [`features.jsonl`](features.jsonl) (164 rows).

Legend: **I** = implemented (works, code + wiring), **P** = partial (exists but a named edge is
missing/disabled/stubbed), **M** = missing_expected (searched, not found — pattern recorded),
**U** = unknown/low-confidence.

Repo shape: 349 files in `src/canvas/editor/` (334 top-level modules + `command_table/`),
96 top-level React entries in `src/canvas/components/` (69 `.jsx`), 77 property-panel modules,
106 files in `src/shared/`, 17 in `electron/`, 87 test files (75 top-level under `tests/unit` + 12 in `tests/unit/figma`; plus `tests/setup.js`), ~986 declared `it()/test()` cases.

---

## 1. Document / file — **I** mostly, **P** autosave & share

| Surface | Status | Evidence |
|---|---|---|
| New design canvas | I | `src/canvas/editor/scene_doc_factory.js:createDocument`, presets in `editor/canvas_presets.js` |
| Open `.voo` | I | `src/canvas/store/project_io.js:readProjectBytes`; `tests/unit/voo_binary.test.js` |
| Save `.voo` | I | `project_io.js:saveProjectFile`, `save-queue.js`, `electron/voo_format.js`; `tests/unit/voo_file_save.test.js` |
| Save As SVG / PSD / FIG | P | `store/save_formats.js:SAVE_FORMATS`, `formatSaveLosses`; lossy: `svg_document_io.js:SVG_WRITABLE_KINDS`, `figma/voo-to-fig.js:figSaveLosses` |
| Autosave / recovery | P | `components/editor_hooks/editor-autosave.js:createEditorDraftSaver` (600 ms debounce) but `use_editor_autosave.js` returns no-ops when `disabled`, and standalone desktop is documented as manual-save (Ctrl/Cmd+S) |
| Recent files + dashboard | I | `components/welcome_dashboard.jsx`, `store/recent_files.js` (max 50, localStorage) |
| Workspace folders / trash | I | `services/workspace_storage.js` facade over `electron_driver.js`, `web_fsa_driver.js`, `web_idb_driver.js`; `electron/workspace_manager.cjs` |
| Rename / duplicate / delete page | I | `components/editor_page_title.jsx`, `components/canvas_tab_bar.jsx` |
| Share by link / live room | **P (dead)** | `store/share_actions.js:shareWorkflow` needs `state.collabSession`, which nothing creates; `collab/use_collab.js` is a standalone stub. See WEAKNESSES §2 |

No cloud document store: the tree has no server API for documents (only IDB/FSA/Electron FS and the
hosted `voo.run` collab config URL). **U** on whether the shipped desktop build persists to a server.

## 2. Canvas — **I** with two notable partials

- **Rendering**: Canvas2D node renderers (`render_node_dispatch.js`, `render_nodes.js`, per-kind
  `render_*_node.js`) are the default stage; a Skia path exists as a parallel host
  (`skia_scene_adapter.js`, `skia_host.js`, vendored `vendor/voo-canvas-core`). GL adjustment
  pipeline (`gl_adjustments*.js`, `gl_spatial*.js`) with CPU fallback (`cpu_adjustments*.js`).
- **Viewport I**: `editor_viewport.js:createViewport` (zoom/pan/fit) with panel-aware fit insets
  (`editor_panel_layout.js`); `tests/unit/viewport_math.test.js`.
- **Snapping I**: `scene_snapping.js:snapNodeBounds` — object edges/centres/canvas bounds, guide
  lines, equal-spacing gap snapping, zoom-adaptive threshold, alt/ctrl bypass. Very well tested
  (`smart_spacing_snapping`, `snapping_e2e`, `smart_snapping_guides`, `snapping_controller`).
- **Grid — P**: a view-only grid overlay is drawn (`editor/chrome_draw.js:245` grid overlay, toggled
  from the zoom bar → `engine.setGrid`) and rect/isometric grid-snap maths exists — but both
  `snapNodeBounds` call sites pass **no options**, so `options.snapToGrid` is always false and grid
  snapping is unreachable from the UI (`editor_pointer_move.js:361`, `editor_pointer_transform.js:529/638`).
- **Rulers — M**: `grep -rni ruler src/` ⇒ 1 hit (a serialisation comment). `doc.guides` is persisted
  and consumed by snapping, but no ruler UI creates guides (`grep -rn guides src/canvas/components/` ⇒ 0).
- **Performance I**: `spatial_index.js` (STR R-tree, 14+14 tests), `viewport_culling.js`
  (240 px margin, 13 tests), `bitmap_cache.js` (128-entry LRU), `image_pyramid.js` (mip tiers),
  `render_cache.js`/`repaint_route.js`.
- **Multi-page I**: pages are store nodes + `canvas_tab_bar.jsx`; `presentation/` reuses pages as slides.

## 3. Tools — **I**, broad

34 tool ids in `editor/tool_ids.js`; the toolbar exposes 9 primary tools
(`components/editor_toolbar.jsx`) with family sub-bars (`editor_tool_subbar.jsx`, `editor_shape_menu`,
`editor_pen_menu`, `editor_lasso_menu`, `editor_marquee_menu`, `editor_fill_menu`,
`editor_healing_menu`, `editor_pie_menu`).

- Shape set: rect/ellipse/line/polygon/star/arrow (`editor_pointer_shapes.js`,
  `drawing_api_shapes.js`) — also 6 agent commands.
- Pen family: pen / curvature pen / free pen (`editor_pen.js`, `_pen_edit`, `_pen_draft`,
  `_pen_subtools`, `_pen_math`; `tests/unit/pen_curve_math.test.js`, `pen_hybrid_agent.test.jsx`).
- Brush family with 7 modes incl. smear/dodge/burn/sponge (`brush_properties.js`), `.abr` preset
  parser (`abr_parser.js`), stylus pressure (`brush_pressure.js`).
- Healing family: AI repair / spot / patch / clone (`editor_repair_tools.js`, `local_ai_repair.js`).
- Selection tools: region, marquee (rect/ellipse), wand, freehand + magnetic lasso
  (`editor_pointer_selection.js`, `pixel_selection_wand.js`, `editor_magnetic_lasso.js`).
- Crop with 3 modes (`editor_crop.js`, `crop_geometry.js`, `crop_panel_fields.js`).
- Eyedropper/fill/gradient (`eyedropper_properties.js`, `editor_pointer_gradient.js`).
- Perspective/distort/puppet warp (`editor_pointer_warp.js`, `perspective_geometry.js`,
  `puppet_warp*.js`, `mesh_transform*.js`) — **P**: no tests for warp/puppet/mesh (grep in tests ⇒ 0).
- Keyboard-first tool switching: `editor_constants.js:TOOL_KEYS/TOOL_KEY_FAMILIES/cycleToolFamily/
  toggleToolKey` (Photoshop toggle V→B→B→V, ⇧P free pen), tested in `navigation_ergonomics.test.js`.

## 4. Selection / transform — **I**

Marquee add/subtract (`editor_pointer_marquee.js`), pixel-selection mask with contour + morphology
(`pixel_selection*.js`), refine as `refine_selection` command and "Feather selection" context item,
free transform / scale / rotate / skew (`editor_transform_api.js`, `box_transform_math.js`,
`transform_api_*.js`; `tests/unit/box_transform.test.js`, `selection_transform.test.js`),
align/distribute/equal-spacing (`align_ops.js`, `distribute_spacing`-family inside it,
`components/editor_properties/align_section.jsx`) with the deepest test suite in the repo
(`distribute_spacing.test.js` 22, `smart_spacing_snapping` 17, `align_section.test.jsx` 10,
`gap_property_controls.test.jsx` 14), power duplicate + linear/grid/circular arrays
(`doc-ops-*-array.js`; `tests/unit/power_duplicate.test.js`), arrow-key nudge with burst-coalesced
history (`use_editor_shortcuts.js:309`).

## 5. Vector — **I**, strongest engineering area

Bezier paths + anchor/handle editing, non-destructive boolean nodes with a polygon clipping engine
(`path_boolean_engine.js`; `boolean_engine_e2e` 37, `path_boolean_topological_invariants` 27,
`challenger_m1_boolean_stress` 22), expand stroke (`path_expand_stroke.js`, 34 e2e tests), offset
path (`path_offset.js` + node wrapper), corner radii/smoothing (`scene_model_core.js`),
stroke style incl. alignment/dash (`stroke_style.js`), gradient model (`gradient_model.js`),
shape→path (`shape_to_path.js`), path menu (convert to path, path→shape/selection, type-on-path
attach/detach, edit SVG) and SVG parse/serialise. **P** only on SVG export coverage (6 writable
node kinds) and curve fidelity inside booleans (curves are adaptively flattened to polygons).

## 6. Text — **I** on editing, **M** on reusable styles

Text tool with on-canvas DOM overlay (`components/editor_text_overlay.jsx`), baked metrics
(`text_metrics.js`, `text_fidelity.js`), 1,949-entry Google Fonts index (`google_fonts_index.js`)
+ bundled OFL families + lazy font loading (`font_loader.js`), numeric variable weights
(`scene_model_core.js:TEXT_FONT_WEIGHTS`, options in `text_section.jsx`), align/tracking/leading,
text effects (shadow/stroke/gradient fill in `scene_model_text_effects.js`), text on path
(`text_on_path.js`; 17+3 tests), IME composition component (`ime_input.jsx`).

**Missing**: reusable named text styles (see §9), local/system font enumeration (`grep 'localFont|
system font'` in font_loader/font_picker ⇒ 0), vertical text / paragraph spacing.

## 7. Layout — **P**

Auto layout exists as opt-in group reflow: `editor/scene_auto_layout.js:normalizeAutoLayout`
(direction, gap, padding, align, justify incl. space-between) + `auto_layout_section.jsx` +
`auto_layout_child_section.jsx`. **No tests** for it (`grep -rli auto_layout tests/` ⇒ 0) and no
Figma frame sizing modes (hug/fill) beyond content reflow.

**M — resize constraints**: `editor/content_constraints.js` is about *locks* for agent edits
(`lock`, `lockPosition`, `lockImagePixels`, `lockTransparency`), not Figma constraints. Searches:
`grep -rni 'pinLeft|pinRight|constraintType|horizontalConstraint' src/` ⇒ 0;
`grep -rni constraint src/canvas/components/editor_properties/` ⇒ 0.

Layout generation (AI) has a substantial skill/geometry library: `layout_skills*.js`,
`layout_geometry.js`, `layout_palette.js`, `layout_art_direction.js`, `layout_critique.js`,
`layout_document_quality.js`, `workflow_layout.js`, plus an HTML→layers pipeline
(`html_import_*.js`, `html_flex_layout.js`, `html_grid_layout.js`, `streaming_layout_preview.jsx`).
That pipeline is **AI-preview only** — there is no File → Import HTML.

## 8. Components — **P**

Main component extraction + detach (`component_extract.js`), live instances
(`instance-snapshot.js`, `instance-view.js`, `editor_instance_child_rows.jsx`), three override
fields only — **text, fill, visible** (`instance-overrides.js:OVERRIDE_FIELDS`) — and nested
canvas/page instances (`canvas-composition-model.js`, `canvas-instance-graph.js`).
**P**: no geometry/stroke/effect/image overrides, no reset-instance, and **no tests** for
component_extract/instance-overrides (`grep -rli component_extract|instance-overrides tests/` ⇒ 0).
**M — variants**: `grep -rni 'variantSet|componentProperty|componentProperties' src/canvas/editor/` ⇒ 0.

## 9. Variables / styles — **P** (variables) / **M** (styles)

- **I (narrow)**: document color variables (`scene_color_variables.js:addColorVariable/
  bindColorVariable/deleteColorVariable`) bound to `fill` or `stroke`, panel
  `color_variables_section.jsx`. Flat hex list, document scope, no collections/modes/aliases, no
  numeric/string variables. No dedicated test file.
- **M — reusable styles**: no named color/text/effect style library. `grep -rni 'colorStyles|
  paintStyles|effectStyles|textStyles:' src/canvas/editor/scene_model*.js` ⇒ 0; the "Text style"
  section is a per-node collapsible panel, not a shared style.
- Artifact design systems (`design_systems.js`, 6 presets, primitive/semantic/component tiers)
  style **AI-generated** canvases; they are not document styles.

## 10. Effects — **I**

9 layer effect kinds (`scene_model_text_effects.js:normalizeEffects` — shadow, glow, innerShadow,
innerGlow, satin, bevel, fill, gradientOverlay, stroke), 25 blend modes (16 native + 9 PSD-only
through `blend_math.js:CUSTOM_BLEND_MODES`), 21 adjustment kinds
(`adjustment_kinds.js:SIMPLE_ADJUSTMENTS`) applied via CPU kernels (`cpu_adjustments*.js`) or GL
(`gl_adjustments*.js`), filter presets (`filter_presets.js`), tone LUTs + histogram
(`tone_lut*.js`, `histogram.js`). Tests are thin here: `inner_shadow_spread.test.js` only for
effects; no test for blend_math, pixel_filter, gl_*.

## 11. Masks — **I/P**

Layer raster masks with brush painting and lifecycle (`editor_mask_brush.js`,
`editor_mask_lifecycle.js`, `editor_mask_ops.js`, `mask_contour.js`), clipping masks
(`doc_ops_clipping.js:createClippingMasks` + `⌥⌘G`), selection contour/morphology helpers.
**P/M**: no vector/boolean mask affordance (`grep 'vectorMask|maskPath'` ⇒ 0), and no dedicated
mask tests (`grep -rli 'editor_mask|mask_contour' tests/` ⇒ 0; the 4 "mask" hits are other suites).

## 12. Image — **I** for local AI, **P** for several adjuncts

Import/replace media, non-destructive crop + destructive bake (`image_layer_crop.js`,
`crop_destructive.js`), on-device matting (`local_matting.js` + `matting_models.js` rmbg-1.4),
upscale (`local_upscale.js`, `upscale_tiling.js`), inpainting/repair (`local_inpaint.js`,
`local_ai_repair.js`), outpaint (`outpaint_*.js`, 18 files), auto-enhance/portrait-retouch/saliency
(`auto_enhance*.js`, `portrait_retouch*.js`, `saliency_map.js`), AI layer split
(`use_editor_layer_split.js`, capability-gated). Histogram + levels/curves
(`histogram.js`, `tone_curves_widget.jsx`).
**P/U**: outpaint, auto-enhance, retouch and saliency have **no tests**; AI layer split needs a host
chat session and is declared unavailable on standalone web (`platform_capabilities.js`).

## 13. Motion — **P**

Video layers are real: `editor/scene-video.js` (node kind `video`, in/out point, volume, mute, loop)
and `video-layer-runtime.js` (one `HTMLVideoElement` per layer). The module header is explicit:
*"There is no shared timeline."* No keyframes, no playhead, no multi-clip animation model
(`grep -rni keyframe src/` ⇒ storyboard AI strings only). The motion toggle in the properties header
is gated by `EDITOR_BETA_ENABLED`. Storyboard AI (`video_storyboard_feedback.js`, storyboard i18n)
is a generation workflow, not canvas animation.

## 14. Prototyping — **M**

`grep -rniE 'prototyp|hotspot|navigate to|interaction:' src/canvas/` ⇒ 0 (all "interaction" hits are
pointer/commit-boundary code). Presentation mode exists but is a linear slideshow, not an
interactive prototype (§15). Expected gap vs Figma/Pen.

## 15. Presentation — **I**, untested

Pages form a deck (`presentation/presentation-document.js:validatePresentationMetadata`,
`getPresentationPages`), viewer/runtime (`components/presentation/presentation_viewer.jsx`,
`presentation_runtime.js:readPresentationDeck`), page menu + own undo stack
(`presentation_page_menu.jsx`, `use_presentation_history.js`), and two real exporters: PPTX
(hand-written OOXML: `presentation-pptx*.js`) and PDF (`presentation-pdf.js`) behind
`presentation_export_dialog.jsx`. No speaker notes/presenter view, and **no tests**
(`grep -rli presentation tests/` ⇒ 1 unrelated hit).

## 16. Export — **I** (6 dialog formats + 3 extra surfaces)

Export dialog formats: png / jpeg / webp / svg / psd / pdf (`editor_export_dialog.jsx:FORMATS`),
with scale 1–4 (raster only), JPEG/WebP quality, and frame / selection / slices ranges
(`editor_export_selection.js`, `editor_export_regions.js`). Beyond the dialog: `.fig` save
(`figma/voo-to-fig.js` + `fig-kiwi-writer.js`, 6 tests), HTML/CSS handoff
(`editor_html_export.js:documentToHtml`), Copy HTML/CSS + Copy SVG in the context menu, PPTX/PDF
deck export. **P**: `.fig`/SVG/PSD are lossy with explicit loss reporting; no GIF/video export
(`grep -rniE 'remotion|exportVideo|gif|mediarecorder' src/` ⇒ 0 canvas export).

## 17. Import — **I** on 4 formats, **M** on Pen/PDF/HTML

`project_io.js:readProjectBytes` branches on extension: `.voo`, `.svg`
(`svg_document_io.js:svgBytesToVooFile`), `.psd` (`psd_to_voo.js:psdBytesToVooFile`), `.fig`
(`figma/figma_import_client.js:importFigFile` — deepest area: 12 Figma test files, kiwi/schema/
text/vector/glyph/instance/effects). Media import for images/video/audio
(`components/editor_media_source.js`).
**M**: no Pen `.pen` importer (grep `.pen` ⇒ only the pen tool), no PDF import (`grep pdf
project_io.js` ⇒ 0), no user-facing HTML import (parser is AI-preview only), no Sketch/Affinity.

## 18. AI — **P** overall (important)

- **Local, on-device: I.** Matting / upscale / inpaint / repair through ONNX Runtime Web
  (`ort_runtime.js`, `ai_capabilities.js`, `model_asset_loader.js`; `model_asset_loader.test.js`).
  Weights are not in the repo: bundled in the desktop installer, downloaded from
  `VITE_MODEL_BASE_URL` on web (README).
- **Provider registry: I.** 21 provider modules (`src/shared/providers/*`) + `provider_registry.js`;
  `agent/image_generation.js:runImageJob` dispatches through it.
- **Legacy provider client: STUBBED.** `src/canvas/provider_client.js` throws
  `"Cloud AI generation runtime is not configured in standalone mode."` for submit/fetch/stream/ASR,
  returns `[]` from `listProviderModels`, `null` from `getProviderConfig`, and
  `{success:false}` from `testProvider`. Consumers: AI layout generation
  (`store/layout_action_helpers.js`), AI layer repaint (`editor/layer_repaint.js`), provider cards and
  model lists in settings. `model_route_resolver.js` is likewise a stub returning `null`/`[]`.
- **AI layout generation: P.** `streamLayoutText` routes CLI model ids (claude:/codex:/antigravity:)
  through the real desktop CLI bridge (works), everything else through the stubbed client (throws).
- **Agent canvas tools:** 2 function schemas (`agent/canvas_tools.js`: generate_image,
  describe_selection) alongside the 40-command editor command table.

## 19. Agent — **I**, the most thoroughly delivered subsystem

CLI agents (`src/shared/cli-agents.js`: Claude Code default, Codex, OpenCode, Antigravity opt-in),
dual-channel bridge (Electron IPC `preload.cjs:localCli` + web loopback ws://127.0.0.1:4179
`electron/cli_bridge_server.js`), streaming adapter
(`components/agent-panel/codex_transport.js:streamCodexCompletion`), agent panel with transcript,
model/status pill, plan steps, tool-call cards, diff cards, session history
(`components/canvas_agent_panel.jsx`, `agent/session_history.js`), contextual island bar
(`components/editor_contextual_taskbar.jsx`), MCP server (`electron/agent_mcp_server.js`,
initialize/list_tools/call_tool), and a 40-command editor command table
(`editor/command_table/`) with validation, receipts and undo metadata — all 40 definitions have
implementations. Tests: bridge protocol/stress/adversarial, onboarding, contextual island, CLI step,
provider registry, session history (15 files mention agent).

## 20. Collaboration — **P (dead code)**

A complete P2P stack exists — room ids (`collab/room.js`), framed protocol + chunked blobs
(`protocol.js`, `chunking.js`), presence colours (`presence.js`), identity (`identity.js`), WebRTC
transport with TURN config fetch (`webrtc_transport.js`, `collab_config.js`), session state machine
(`session.js`), stroke bus (`stroke_bus.js`), lifecycle. But **nothing instantiates it**:
`grep -rn createCollabSession src/` ⇒ definition only; `collab/use_collab.js` returns a constant
`status:"off"` snapshot; `share_actions.js` reads a `collabSession` that is never created.
No collab tests (`grep -rli collab tests/` ⇒ 0). Only identity name/avatar in settings is live.

## 21. Comments — **M** (design comments), **I** (image annotations)

No canvas comment model or UI: `grep -rln comment src/` ⇒ 6 files, all i18n or fig-zip fields.
The annotation subsystem (`annotations/image_annotations.js:createAnnotation`, point/box, 0-1
normalised coords, notes) is for marking reference images sent to AI models — not collaboration.

## 22. Dev mode / code handoff — **P/M**

Copy HTML/CSS (`editor/editor_context_menu.jsx:editor.menu.copyHtmlCss`), Copy SVG, full-page HTML
export (`editor_html_export.js`). **M**: no inspect panel, no measurement overlay, no dev mode —
`grep -rniE 'devMode|dev_mode|codegen|inspect panel' src/` ⇒ 0.

## 23. Plugins — **M** (runtime plugin API), **P** (two integrations)

`computer_use_plugin.js` (browser-extension toggle, persisted), and a "Plugins & Skills" catalog
(`node_store_skill_catalog.js`) that is content, not code. `grep -rniE
'registerPlugin|pluginAPI|loadPlugin|manifest.json' src/` ⇒ 0 — no third-party plugin runtime.

## 24. Performance — **I**

R-tree spatial index, viewport culling, LRU bitmap cache, image pyramid tiers, render cache/repaint
routing, GL adjustment pipeline with CPU fallback. Benchmarks are absent; tests cover index/culling.

## 25. Shortcuts — **I**

62 key bindings in `use_editor_shortcuts.js`, tool keys/families/toggle in `editor_constants.js`,
grouped catalog `src/shared/editor-shortcut-catalog.js:DESIGN_SHORTCUT_GROUPS`, in-app reference
modal (`shortcut_reference_modal.jsx`) + settings section, history shortcut pipeline
(`editor-shortcut-pipeline.js`), 40-command agent command table.

## 26. Settings — **I**

Drawer (`settings_drawer.jsx`) with general/profile/avatar (`settings_general.jsx`), workspace
directory (`WorkspaceSettingsSection`), language, providers/models (`provider_settings.jsx` +
`provider_card.jsx` + verification state), agent settings (`agent_settings.jsx`), shortcuts
(`settings_shortcuts.jsx`), onboarding re-trigger. Server-side preferences: none.

## 27. Onboarding — **I**

Four-step wizard (`components/onboarding/OnboardingGuide.jsx` + `onboarding_state.js`):
workspace setup → agent select → live CLI detect/test → ready. Persists
`voo.onboarding.completedVersion` + workspace path, `shouldShowOnboarding()` re-shows if either is
missing, `navigator.webdriver` bypass for CI. Note PROJECT.md describes 3 steps; code ships 4
(`GUIDE_STEPS` legacy 3-step list retained for old tests). Resumable draft step state.

## 28. Accessibility — **P**

107 component files use `aria-label`, 62 use `focus-visible` rings, the design linter enforces the
focus-ring token (`scripts/check-design.mjs` → `design/lint.cjs`), modals have keyboard hooks
(`use_export_dialog_keyboard.js`). But: no focus-trap implementation
(`grep -rni 'focusTrap|trapFocus' src/` ⇒ 0), no accessible tree for the canvas surface
(`aria-activedescendant|role="tree"` in the layers panel ⇒ 0), and no automated a11y test.

## 29. i18n — **I** (2 locales)

English and Chinese dictionaries with **exact 4,081/4,081 key-shaped-line parity** across
`src/shared/i18n/*-en.js` and `*-zh.js` (aggregated by `en.js`/`zh.js`), a `t()` helper and
`use_i18n.js`, runtime language switch in settings. Only two locales; no RTL, no locale negotiation.

## 30. Storage / workspace — **I**

`.voo` v1 container with JSON document + binary image table (`electron/voo_format.js`,
`store/voo_binary.js`), IndexedDB stores for documents/images/assets/thumbs (`src/storage/db.js`,
`store/db.js`, `asset_library.js` on 3 IDB stores with LRU budget), three workspace drivers behind
one facade, serialised save queue (`save-queue.js`), persistence contracts with quota detection
(`src/shared/persistence_contract.js`), generated-asset retention protocol
(`image-retention-protocol.js`, `image-publication*.js`), local user profile
(`user_account_storage.js`, guest only — no real auth).

---

### Cross-cutting observations for the gap report

1. **Two AI worlds**: local ONNX AI (works offline, tested) vs hosted/providers. The legacy hosted
   client is a deliberate stub in this standalone repo, so anything built on it (AI layout, AI
   repaint, provider model lists) is non-functional here.
2. **Complete-but-unwired subsystems**: collaboration (entire stack, zero call sites) and share links.
3. **Model exists, UI/plumbing missing**: rulers/guides, grid snapping, component variants,
   constraints, reusable styles, prototyping, comments, timeline.
4. **Engineering depth is uneven**: booleans/paths/SVG/figma/spacing/snapping/workspace/agent bridge
   have very strong test coverage; presentation, motion, masks, effects, auto layout, image adjuncts
   and component instances have little or none. See `COVERAGE.md`.
