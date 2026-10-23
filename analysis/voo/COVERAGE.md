# VOO Design — COVERAGE (quantitative breadth of the repo)

All counts produced by the commands shown, run at analysis time against
`/Users/tt/teamwork_projects/voo_design` (read-only). Test-case counts are declared
`it()/test()` occurrences (some suites use loops/`it.each`, so the executed count can differ).

## 1. Surface counts

| Surface | Count | How measured |
|---|---:|---|
| Editor engine files (`src/canvas/editor/`) | **349** | `find src/canvas/editor -type f \| wc -l` |
| — top-level engine modules | 334 | `ls src/canvas/editor/*.js*` |
| — command-table modules | 15 | `ls src/canvas/editor/command_table/` |
| React component entries (`src/canvas/components/`, top level) | **96** | `ls src/canvas/components \| wc -l` |
| — `.jsx` of those | 69 | `ls src/canvas/components/*.jsx` |
| Property-panel modules (`components/editor_properties/`) | **77** | `ls … \| wc -l` |
| Sub-modules in `components/` subdirs (agent-panel, onboarding, presentation, ui, editor_hooks, …) | 108 | 96 top-level entries − 96 + 204 total files − 96 |
| Files under `src/canvas/` total | 699 | `find src/canvas -type f` |
| `src/shared/` files | 106 | `find src/shared -type f` |
| Provider modules (`src/shared/providers/`) | 24 files (18 `provider_*`) | `ls src/shared/providers \| wc -l` |
| Electron main/preload modules | 17 | `ls electron/` |
| i18n dictionary modules | 34 | `ls src/shared/i18n` |
| — i18n keys (en) | **4,081** | `grep -cE '^\s*"[^"]+":' src/shared/i18n/*-en.js` |
| — i18n keys (zh) | **4,081** | same for `*-zh.js` (exact parity) |
| Locales | 2 (en, zh) | `en.js`, `zh.js` |
| Test files | **87** | `find tests -name '*.test.js*' \| wc -l` (86 under `tests/unit` incl. 12 in `tests/unit/figma`, + `tests/setup.js` = 88 files) |
| Declared test cases | **~986** | `grep -rhcE '^\s*(it\|test)\(' tests/unit/**` |

## 2. Feature primitives

| Primitive | Count | Source |
|---|---:|---|
| Tools (`TOOL`) | **34** | `src/canvas/editor/tool_ids.js` |
| Primary toolbar tools | 9 | `src/canvas/components/editor_toolbar.jsx` (select, perspective, distort, puppet warp, region, brush, crop, eraser, text) |
| Tool families / cycles | 10 keys | `editor_constants.js:TOOL_KEY_FAMILIES` |
| Shape primitives | 6 | rect, ellipse, line, polygon, star, arrow |
| Brush modes | 7 | normal, smudge, blur, sharpen, dodge, burn, sponge |
| Healing modes | 4 | aiRepair, spot, patch, clone |
| Node kinds | 11 | `scene_doc_factory.js:NODE_KIND` (image, rect, ellipse, path, text, region, boolean, group, adjustment, video, canvasInstance) |
| Editor agent commands | **40** | `command_table/definitions_part1-4.js` |
| — commands with implementations | 40/40 | `implementations_part1-4.js` + `executor.js` gesture map |
| Keyboard bindings | 62 | `src/canvas/use_editor_shortcuts.js` |
| Documented shortcut rows | ~60 in 5 groups | `src/shared/editor-shortcut-catalog.js:DESIGN_SHORTCUT_GROUPS` |
| Blend modes | **25** | `scene_model_core.js:BLEND_MODES` (16 native + 9 PSD-only) |
| Layer effect kinds | **9** | `scene_model_text_effects.js:normalizeEffects` |
| Adjustment kinds | **21** | `adjustment_kinds.js:SIMPLE_ADJUSTMENTS` |
| Canvas size presets | data table | `editor/canvas_presets.js` |
| Property panel sections | 14 top-level | `properties_panel_sections.jsx` (Align, AutoLayout, AutoLayoutChild, Colour, ColorVariables, Combine, LayerEffects, Media, PuppetPin, Shape, Text, Transform, Warp, AffinityAdjustment) |
| Agent CLI providers | 4 | `cli-agents.js` (Claude Code, Codex, OpenCode, Antigravity opt-in) |
| In-canvas agent tool schemas | 2 | `agent/canvas_tools.js` (generate_image, describe_selection) |
| Design-system presets | 6 | `design_systems.js:defineSystem` |
| Google Fonts index entries | **1,949** | `editor/google_fonts_index.js` |
| Workspace storage drivers | 3 | `services/drivers/` + `workspace_storage.js` |
| Collaboration modules | 12 | `src/canvas/collab/` (none wired) |

## 3. Formats

| Direction | Formats | Evidence |
|---|---|---|
| Export (dialog) | png, jpeg, webp, svg, psd, pdf | `components/editor_export_dialog.jsx:FORMATS` (line 8) |
| Export (other surfaces) | `.fig`, HTML/CSS page, PPTX deck, PDF deck | `figma/voo-to-fig.js`, `editor/editor_html_export.js`, `presentation/presentation-pptx.js`, `presentation/presentation-pdf.js` |
| Export ranges | frame, selection, slices | `editor_export_selection.js`, `editor_export_regions.js` |
| Import (project) | `.voo`, `.svg`, `.psd`, `.fig` | `store/project_io.js:readProjectBytes` |
| Import (media) | images (png/jpeg/webp/gif…), video (mp4/webm/mov/m4v), audio | `components/editor_media_source.js`, `shared/command-protocol.js` |
| Import (missing) | `.pen`, `.pdf`, `.html`, `.sketch` | see WEAKNESSES §3 |
| Save-back formats | `.voo` (lossless), `.svg`, `.psd`, `.fig` (lossy w/ loss report) | `store/save_formats.js:SAVE_FORMATS` |

## 4. Panels / dialogs / dialogs-in-counts

96 top-level component entries include: `editor_toolbar`, `editor_tool_subbar`, `editor_layers`,
`editor_history_panel`, `editor_properties/*`, `editor_export_dialog`, `editor_context_menu`,
`editor_shape_menu`, `editor_pen_menu`, `editor_lasso_menu`, `editor_marquee_menu`,
`editor_fill_menu`, `editor_healing_menu`, `editor_pie_menu`, `editor_path_menu_items`,
`editor_media_source`, `editor_canvas_presets`, `canvas_tab_bar`, `font_picker`, `scrub_field`,
`color_picker/*` (9 files), `settings_drawer` + 5 settings sections, `shortcut_reference_modal`,
`welcome_dashboard`, `canvas_agent_panel`, `editor_contextual_taskbar`, `agent_settings`,
`provider_*` (8), `onboarding/*` (12), `presentation/*` (7), `SvgEditModal`, `image_editor`,
`loading_modal`, `document_loading_overlay`, `tool_call_card`, `info_hint`, `toggle`, `flat_select`,
`ui/*` (7 primitives).

Dialogs/menus with explicit keyboard handling: export dialog (`use_export_dialog_keyboard.js`),
shortcut reference modal (search + Escape), presentation export dialog, onboarding
(draft-step persistence).

## 5. Tests by area (files → declared cases)

| Area | Test files | Cases | Notes |
|---|---|---:|---|
| Vector / booleans / paths | `boolean_engine_e2e` (37), `path_boolean_topological_invariants` (27), `challenger_m1_boolean_stress` (22), `path_boolean_engine` (14), `expand_stroke_e2e` (34), `path_offset` (12), `path_offset_node` (6), `path_menu_actions` (8), `pen_curve_math` (7) | **167** | deepest area |
| Spacing / snapping / align | `snapping_e2e` (48), `smart_spacing_snapping` (17), `distribute_spacing` (22), `smart_snapping_guides` (4), `snapping_controller` (3), `align_section` (10), `gap_property_controls` (14) | **118** | second deepest |
| Workspace / storage / settings | `workspace_storage` (21), `adversarial_storage_challenge` (26), `workspace_electron_ipc` (20), `workspace_folders` (8), `workspace_dashboard_integration` (11), `adversarial_workspace_*` (47), `recent_files_and_welcome` (10), `settings_workspace` (8), `settings_providers` (8), `adversarial_settings_workspace_challenge` (15) | **174** | |
| Agent / CLI bridge / onboarding | `challenger_stress_cli` (29), `cli_bridge_protocol` (12), `challenger_cli_bridge_stress` (17), `provider_cli_registry` (15), `cli_run_text_handler` (8), `cli_agent_step` (4), `chat_stream_headers` (2), `agent_session_history` (3), `onboarding_guide` (7), `onboarding_agent_model` (3), `onboarding_workspace_guide` (13), `adversarial_onboarding_guide_challenge` (12), `contextual_island` (20), `pen_hybrid_agent` (5), `e2e_acceptance_criteria` (56), `adversarial_m1_stress` (19) | **225** | |
| Figma import/export (`.fig`) | `tests/unit/figma/*` (12 files) + `voo_to_fig` (6) + `adversarial_figma_streaming_corruption` (24) + `svg_document_io` (6) + `psd_to_voo` (6) + `voo_binary` (8) + `voo_file_save` (7) + `save_formats` (5) | **148** | `.fig` round-trip is a strength |
| Performance / viewport | `spatial_index` (14), `challenger_spatial_viewport_stress` (14), `viewport_culling` (13), `viewport_math` (3) | **44** | |
| Text | `text_on_path` (17), `text_on_path_engine_ops` (3), `google_fonts_index` (3) | **23** | no text-style/IME tests |
| Editor integration / misc | `single_canvas_integration` (11), `design_store` (8), `document_loading_overlay` (2), `editor_canvas_tree_row` (4), `selection_transform` (2), `box_transform` (7), `power_duplicate` (1), `scene_video_layer` (2), `bitmap_display_downscale` (2), `paint_persist_retry` (2), `inner_shadow_spread` (2), `html_export_video_layer` (2) | **45** | |
| Image / AI assets | `canvas_image_generation` (6), `model_asset_loader` (5) | **11** | local ONNX model loading only |
| Ergonomics / navigation | `navigation_ergonomics` (5), `interaction_ergonomics_parity` (4) | **9** | |
| Isolation / safety | `adversarial_isolation_electron_safety` (8) | **8** | |

**Totals: 87 files, ~986 declared cases.** The counts per area overlap where a file spans areas
(e.g. `e2e_acceptance_criteria` covers spacing + clipping + adjustments); the table attributes each
file once.

## 6. Areas with NO tests (explicit)

Search basis: `grep -rli '<term>' tests/` and reading every test filename.

| Area | Term(s) searched | Result | Risk |
|---|---|---|---|
| Prototyping / interactions | `prototyp`, `hotspot`, `interaction:` | 0 | feature absent anyway |
| Collaboration | `collab`, `presence`, `webrtc`, `roomId` | 0 | entire stack untested + unwired |
| Comments | `comment`, `annotation` | 0 | feature absent |
| Masks (raster layer masks) | `editor_mask`, `mask_contour` | 0 (4 "mask" hits are clipping-store assertions in other suites) | mask painting untested |
| Effects rendering | `blend_math`, `pixel_filter`, `node_effects`, `gl_adjustments` | 0 (only `inner_shadow_spread`) | 25 blend modes untested |
| Auto layout | `auto_layout`, `autoLayout` | 0 | reflow untested |
| Components / instances | `component_extract`, `instance-overrides`, `instance-snapshot` | 0 | component system untested |
| Variables / styles | `colorVariable`, `color_variables` | 0 dedicated (1 snapshot mention) | |
| Presentation | `presentation` | 1 unrelated hit | deck + PPTX/PDF untested |
| Motion / video | `video-layer-runtime`, `timeline`, `keyframe` | only `scene_video_layer` (2 cases for node normalisation) | playback untested |
| Warp / puppet / mesh | `warp`, `puppet`, `mesh_transform` | 0 | |
| Lasso / magnetic lasso / brush | `magnetic_lasso`, `brush_pressure`, `paint` | 0 (only `paint_persist_retry`, persistence) | |
| Image adjuncts | `outpaint`, `auto_enhance`, `portrait_retouch`, `saliency`, `layer_split` | 0 | low-confidence features |
| Export dialog / PDF / HTML / PPTX | `export_dialog`, `editor_export`, `pptx`, `pdf` | 0 (only `html_export_video_layer`) | |
| Dev mode / codegen | `devMode`, `codegen` | 0 | absent |
| Accessibility (canvas/modals) | `aria`, `focus trap`, `a11y` | 1 (align_section focus token) | |
| i18n key parity | `i18n` | 4 (settings/onboarding touch strings) | parity asserted by count only |
| Grid snapping | `grid` snapping | 0 (snapping tests use object snapping) | unreachable by design |

## 7. Documentation vs code drift

- `PROJECT.md` describes a **3-step** onboarding; the shipped guide has **4 steps**
  (`onboarding_state.js:ONBOARDING_STEPS`) with the 3-step list kept as `GUIDE_STEPS` for old tests.
- `TEST_READY.md` claims **61 files / 686 tests**; today the tree has **87 files / ~986 cases**.
- `README.md` lists export formats as PNG/JPG/WebP/SVG/PDF/PSD/HTML — the dialog additionally offers
  slices/selection ranges, and `.fig` save exists but is not advertised in the README.
- `analysis/README.md` says "335 engine files"; today `find` counts **349**.
- `PROJECT.md` milestone table marks M2 IN_PROGRESS and M3/M4 PLANNED, yet the corresponding code
  (onboarding, island bar, agent panel) is present and tested — the status table is stale.
