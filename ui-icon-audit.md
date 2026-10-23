# UI icon audit

The home generation pills are centered again. The visible AI generation heading and its yellow sparkle are removed. Functional icons use neutral foregrounds and `currentColor`; purely decorative glyphs are removed.

## Changed files and icon inventory

Paths below are relative to `src/canvas/components/`, unless stated otherwise.

| File | Removed or changed icons / other changes |
| --- | --- |
| `welcome_dashboard.jsx` | Removed the yellow heading Sparkles and amber model-speed lightning bolt. Centered the wrapping pills. Globe, Smartphone, Monitor, Presentation, LayoutDashboard and the functional Other Sparkles use neutral selected-state colors. |
| `community_templates_view.jsx` | Removed hero Sparkles and author emoji avatars. Verified-author CheckCircle2 is neutral. |
| `community_templates_data.js` | Removed author avatars: lightning, credit card, sparkles, palette, chart, shopping bags. Removed example-document decorations: chart, lightning, people, credit card, settings gear, waving hand, notification bell, apple, briefcase, coffee, music and hero sparkles. Removed the resulting empty icon tiles. Functional send/receive arrows are neutral. |
| `first_run_onboarding.jsx` | Removed introductory Sparkles, starter-card Layout, and tour-card Layout, MousePointer2 and Sparkles. The monochrome Command shortcut hint remains. |
| `crash_recovery_prompt.jsx` | Removed decorative RotateCcw tile; corrected existing type-scale lint failures. |
| `settings_general.jsx` | Removed decorative current-workspace Folder and its unused import. Functional FolderOpen remains neutral. |
| `editor_comments.jsx` | Removed decorative title MessageSquare. Functional delete Trash2 is neutral. |
| `editor_contextual_ai_input.jsx` | Removed decorative input Sparkles and its import; removed the reserved left padding. |
| `editor_ai_taskbar_buttons.jsx` | Neutral shared AI button foregrounds and functional More-menu Expand, HD, Layers, Sticker and Wand glyphs. This also makes the repaint button's Sparkles neutral through its existing shared class. |
| `editor_contextual_taskbar.jsx` | Neutral functional agent Sparkles and active action glyphs; corrected existing radius lint failures. |
| `editor_upscale_button.jsx` | Neutral HD glyph in idle, open and busy states. |
| `editor_outpaint_overlay.jsx` | Removed decorative Expand beside the confirmation-bar title. |
| `streaming_layout_preview.jsx` | Neutral agent Cursor; corrected existing background and radius lint failures. |
| `SvgEditModal.jsx` | Neutral success Check. |
| `canvas_agent_panel.jsx` | Neutral selected-model Check. |
| `editor_canvas_tree_row.jsx` | Neutral canvas/component TypeIcon in active, inactive and hover states. |
| `editor_canvas_inactive_layers.jsx` | Neutral selected-group Folder. |
| `editor_page.jsx` | Neutral Frame glyphs for design, motion and 3D canvas types, including focused headers. |
| `editor_layer_thumb.jsx` | Neutral Component thumbnail placeholder. |
| `editor_layers.jsx` | Neutral asset-retry Refresh. |
| `editor_history_panel.jsx` | Neutral active-history Check. |
| `editor_healing_menu.jsx` | Neutral functional active-tool glyphs and ChevronDown. |
| `editor_tool_subbar.jsx` | Neutral inactive AI tool glyphs, including selection, repair and repaint variants. |
| `editor_pie_menu.jsx` | Neutral active and inactive AI tool glyphs. |
| `editor_export_dialog.jsx` | Neutral selected-export-format checkmark. |
| `editor_code_export_dialog.jsx` | Neutral warning AlertTriangle; warning text retains its semantic color. |
| `inspector_primitives.jsx` | Neutral invalid-field SVG indicator. |
| `vector_row.jsx` | Neutral Lock and Unlock. |
| `provider_card.jsx` | Neutral provider-delete Trash glyphs, including hover states. |
| `provider_model_list.jsx` | Neutral model-delete Trash glyph, including hover states. |
| `editor_properties/affinity_adjustment_section.jsx` | Removed decorative adjustment-header KindIcon tile and its unused import. |
| `editor_properties/properties_panel_header.jsx` | Neutral tool-identity Brush, Eraser, VectorSquare, Text, Crop, Pipette, Bucket and SelectionRect; neutral active Motion glyph. |
| `editor_properties/add_kind_picker.jsx` | Neutral functional adjustment/filter/effect KindIcon glyphs; removed the unused per-button accent prop. |
| `editor_properties/layer_effects_section.jsx` | Neutral functional adjustment/filter/effect KindIcon glyphs in enabled and disabled states. |
| `editor_properties/combine_section.jsx` | Neutral active boolean-operation glyphs: union, subtract, intersect and exclude. |
| `editor_properties/text_tool_properties.jsx` | Neutral active Italic and Underline glyphs. |
| `editor_properties/transform_dimension_bar.jsx` | Neutral active Link and Unlink. |
| `editor_properties/variables_panel.jsx` | Neutral Add glyphs, including the colored action button. |
| `editor_properties/color_variables_section.jsx` | Neutral delete Trash. |
| `editor_properties/grid_array_section.jsx` | Neutral delete Trash. |
| `editor_properties/linear_array_section.jsx` | Neutral delete Trash. |
| `editor_properties/style_section.jsx` | Neutral delete Trash. |
| `editor_properties/live_filter_section.jsx` | Neutral remove-control hover foreground; fixes an existing palette violation. |
| `editor_properties/selection_actions.jsx` | Corrected existing placeholder-contrast lint failure. |
| `agent_mcp_settings.jsx` | Corrected existing error-text palette lint failure. |
| `image_size_notice.jsx` | Corrected existing type-scale lint failure. |
| `page_switcher.jsx` | Corrected existing type-scale and radius lint failures. |
| `src/release_ui.jsx` | Corrected existing type-scale and overlay-shadow lint failures. |
| `src/shared/i18n/welcome-zh.js` | Removed `welcome.prompt.aiGenTypes`; added the concise accessible group label `welcome.prompt.generationTypeLabel`. |
| `src/shared/i18n/welcome-en.js` | Same key cleanup and accessible group-label update for English. |
| `tests/unit/community_templates_and_new_project.test.jsx` | Asserts centered pills, no visible AI generation heading, preserved accessible label, neutral selection icons and no decorative community sparkles/emoji. |
| `tests/unit/contextual_island.test.jsx` | Asserts no decorative input Sparkles; updates the stale prompt-event assertion to match the existing deduplicated store-dispatch behavior. |

All existing icon shapes in the shared icon registry already render with `currentColor`; no registry-wide override or new dependency was added. Color swatches, artwork, chart channels, and semantic status text retain their functional colors.

## Verification

- Relevant unit tests: 19 files, 182 tests passed.
- Whole-app design lint: 947 files passed.
- Changed-source formatting: ESLint semicolons, trailing whitespace and final-newline checks passed.
- Production build: passed with `npm --ignore-scripts run build -- --outDir /tmp/voo-ui-build --emptyOutDir`. Resource-copy hooks were skipped to avoid changing ignored generated assets.
- `git diff --check`: passed.

## Git status

Remote synchronization failed because this environment denies writing `.git/FETCH_HEAD`. Staging failed because it denies creating `.git/index.lock`, so no commit could be created. No push was attempted.

Intended commit message: `fix: center generation pills and remove decorative UI icons`
