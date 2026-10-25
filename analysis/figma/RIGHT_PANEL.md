# Figma Desktop 126.9.13 — Right-Hand Properties Panel: Functional Layout Spec

**Subject:** right-hand properties/design panel of the Figma editor web app shipped inside Figma Desktop 126.9.13.
**Evidence base:** `/private/tmp/figma_editor/figma_app.js` (8,287,210 B, minified), `figma_app.en.json` (33,116 keys), `/tmp/rea_evidence/figma/analyze-editor.json` (evidence_id `ev_52416c8b87f09f73abae5e8ee7b30dba1af07276064756392e8778f584a6a561`), and the prior REA projection `analysis/figma/rea/editor-commands.txt`.
**Legend:** **FACT** = string/key/symbol observed in the artifacts (citation given). **INFERENCE** = conclusion drawn from FACTs, not directly observed. **UNKNOWN** = not recoverable from available artifacts.

---

## 0. Recovery limitation (read this first)

The panel's *vocabulary* is fully recoverable; its *ordered composition* is only partly recoverable.

- **FACT:** the panel owns a dedicated i18n namespace `fullscreen.properties_panel.*` with **860 keys**, plus satellites `fullscreen.type_panel.*` (36), `fullscreen.grid_panel.*` (13), `fullscreen.grids_panel.*` (16), `design_systems.instance_panel.*` (38), `design_systems.component_panel.*` (19), `fullscreen.appearance_panel.*` (2), `properties.*` (22).
- **FACT:** only **285 of the 860** `fullscreen.properties_panel.*` keys are referenced as literals inside `figma_app.js` (366 total references). The unreferenced 575 include **every section-title and tab-title key**: `properties_panel.fill.fill` ("Fill"), `properties_panel.fill.stroke` ("Stroke"), `properties_panel.effects.effects` ("Effects"), `properties_panel.export` ("Export"), `properties_panel.page` ("Page"), `properties_panel.design` ("Design"), `properties_panel.prototype` ("Prototype"), `properties_panel.properties` ("Properties"), `type_panel.typography` ("Typography"), `appearance_panel.appearance` ("Appearance").
- **FACT:** there is no template-literal or concatenated key construction either — searching `fullscreen\.properties_panel` followed by `${` yields only three unrelated backtick uses (`transform_panel.w`, `.h`, `stack_panel.remove_max`).
- **Conclusion (INFERENCE, high confidence):** the module that renders the *section container list and the tab strip* lives in a lazily-loaded chunk that was **not present in the Chromium cache** (only the main `figma_app` bundle and `prototype_app.js` were recovered). Control-level strings (tooltips, dropdown options, effect names, sizing modes) are in the main bundle; the chrome that consumes the title keys is not.
- **Therefore:** §1–§2 (tab identity) are FACT-backed; **the section ORDER in §2 is INFERENCE** except where §3 proves intra-section row order from JSX. Ambiguities are flagged inline rather than smoothed over.

---

## 1. Panel identity, tabs, and entry points

**FACT — panel commands exist as first-class actions** (`analysis/figma/rea/editor-commands.txt`, extracted from the `fullscreen_actions` namespace):

| command id | label | line |
|---|---|---|
| `show-design-panel` | Open design panel | 807 |
| `show-prototype-panel` | Open prototype panel | 811 |
| `show-inspect-panel` | Open inspect panel | 808 |
| `show-properties-panel` | Open properties panel | 810 |
| `single-properties-panel` | Single properties panel | 840 |
| `panels-menu` | Panels | 476 |
| `toggle-prototyping-info` | Toggle prototype panel | 1007 |
| `enter-inspect-mode` | Switch to Dev Mode | 289 |
| `toggle-variables` | Toggle variables | 1058 |
| `toggle-layers` | Open layers panel | 993 |
| `toggle-show-comments` | (comments panel) | — |

**FACT:** a generic tab primitive exists in the bundle with `role:"tab"`, `aria-selected`, and `data-testid` = `` `tab-${e}` `` (byte offset ≈ 4,328,406). Tabs are ARIA tabs with a `tablist` container (≈ 5,923,027), and each tab's `id` is its own value (`(0,r.jsx)(a.c,{id:e,value:e})`).

**FACT:** four distinct tab/section titles are defined but not referenced in the main bundle: `properties_panel.design` = "Design", `properties_panel.prototype` = "Prototype", `properties_panel.properties` = "Properties"; Dev Mode's surface is titled from `dev_handoff.tab.inspect` = "Inspect" and `enter-inspect-mode` = "Switch to Dev Mode".

**INFERENCE (high confidence):** the design-file right rail is a **two-tab strip — `Design` | `Prototype`** — with Dev Mode swapping the whole rail to a single **`Inspect`** surface (not a third tab) because `enter-inspect-mode` is a *mode switch* ("Switch to Dev Mode"), not a tab selection, and because Dev Mode's body uses a **separate, largely disjoint namespace** (`inspect_panel.*` 284 keys, `dev_handoff.inspect_panel.*` 32, `dev_handoff.*` 1,260). A `Properties` panel exists for surfaces where the rail shows component/slot properties rather than design attributes (`fullscreen.properties_panel.properties`), gated by the toolbar props `shouldShowComponentPropertiesPanel` / `shouldShowInstancePanel` / `shouldShowSlotPanel` / `shouldShowCodeInstancePanel` (observed in `tP()` at byte ≈ 4,252,000).

---

## 2. Top-level structure per context

Order below = **INFERENCE** for the outer sequence (documented limitation, §0); *presence* = FACT where the section's keys exist. Section identifiers come from the actual `section_*` key groups: `section_position`, `section_autoLayout`, `section_fill`, `section_stroke`, `section_effects`, `section_appearance`, `section_exports`, `section_layout_grid`, `section_vector`, `section_transform_modifiers`, `section_slot`.

| # | Section | none/page | frame | shape (rect/ellipse) | image | text | component/instance | multi-select |
|---|---|---|---|---|---|---|---|---|
| 0 | Layer header (name + type + actions) | page name | ✔ | ✔ | ✔ | ✔ | ✔ | "{count} selected" |
| 1 | Alignment (align/distribute/tidy) | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 2 | Position / size / rotation (+ constraints in-frame) | — | ✔ | ✔ | ✔ | ✔ | ✔ | mixed |
| 3 | Layout (auto layout) | — | ✔ (frame) | — | — | — | ✔ | mixed |
| 4 | Grid (grid layout) | — | ✔ | — | — | — | ✔ | mixed |
| 5 | Constraints | — | — | ✔ | ✔ | ✔ | ✔ | mixed |
| 6 | Fill | — (page bg) | ✔ | ✔ | ✔ (image fill) | ✔ | ✔ | ✔ |
| 7 | Stroke | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 8 | Effects | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 9 | Typography | — | — | — | — | ✔ | ✔ (text inside) | mixed |
| 10 | Text styles / variables | — | — | — | — | ✔ | ✔ | mixed |
| 11 | Component / Variants / Instance | — | — | — | — | — | ✔ | mixed |
| 12 | Export | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 13 | Page (background, canvas color) | ✔ | — | — | — | — | — | — |

Evidence per row: (0) `layer_header.node_type_*` 34 keys incl. `node_type_frame`, `node_type_rectangle`, `node_type_ellipse`, `node_type_image`, `node_type_text`, `node_type_component`-equivalents, `node_type_multiple_selected` = "{count} selected"; (1) `section_position.label_alignment` = "Alignment"; (2) `transform_panel.*` 78 keys, `properties.label.position` / `properties.label.rotation`; (3) `stack_panel.*` 120 keys, `stack_panel.layout` = "Layout", `stack_panel.auto_layout` = "Auto layout"; (4) `grid.*` 27 keys, `stack_panel.grid` = "Grid"; (5) `constraints_panel.constraints` = "Constraints"; (6) `section_fill.tooltip_addFill`, `fill.fill`; (7) `section_stroke.tooltip_addStroke`, `fill.stroke`; (8) `section_effects.tooltip_addEffect`, `effects.effects`; (9) `type_panel.typography`; (11) `design_systems.component_panel.*`, `design_systems.instance_panel.*`; (12) `section_exports`, `properties_panel.export`; (13) `properties_panel.page` = "Page", `properties_panel.background` = "Background", `properties_panel.current_page_colors` = "On this page".

**Notable ordering inferences:** Appearance (`section_appearance`: opacity + blend mode) is placed **after Effects and before Export** in the canonical Figma rail — supported only indirectly (`appearance_panel.blend_mode` / `show_content` are isolated 2-key group plus `section_appearance.label_opacity`, and opacity is described as "Appearance" by `fullscreen.appearance_panel.appearance`). Treat exact slot of Appearance, Grid, and Constraints as **INFERENCE/low confidence**.

---

## 3. Section anatomy (control order)

### 3.1 Layer header (FACT)
`data-testid="property-panel-toolbar"` (byte ≈ 4,252,437), wrapper `layer_header_bar`. Contents left→right: node-type glyph + name/type label (`layer_header.node_type_*`), then a hoisted action-toolbar that overflows into `layer_overflow_menu_button`, then conditional rows appended after the header: `appliedModifiers` (`layer_header.reset_specific_changes` = "Reset specific changes"), video-mute, `tg.T`, then instance/component-property row (rendered when `"INSTANCE"|"SLOT"|"SYMBOL"`). Header buttons are `FLYOUT | ACTION | ACTION_SUBMENU | CUSTOM_ACTION`.

### 3.2 Alignment (FACT keys, INFERENCE order)
Six align + six distribute + tidy. Label = `section_position.label_alignment` = "Alignment". Object-position/resizing controls live here for auto-layout children (`stack_panel.align_top_left` … `align_bottom_right`, `align_*_baseline`, `stack_panel.remove_baseline_align`).

### 3.3 Position / size / rotation (FACT)
`data-testid="stack-positioning-toggle"` (≈ 4,140,822). Keys: `transform_panel.x`, `.y`, `.w`, `.h`, `.rotation`, `.corner_radius`, `.independent_corners`, `.top_left_corner_radius` … `.bottom_right_corner_radius`, `.corner_smoothing`, `.aspect_ratio_lock` / `aspect_ratio_unlock`, `.radius`, `.start`/`.sweep`/`.ratio` (arc), `x2`/`y2` (line), `.count`/`.list_spacing_x`/`.list_spacing_y` (repeat/grid children), `3D transform` group (`rotate_3d_x/y/z`, `perspective`, `transform_origin`, `preserve_3d`).
Row layout observed: X|Y paired row → W|H paired row (with sizing dropdown `H`/`W` + min/max badge) → rotation + corner radius → optional arc/line/3D subsections. Width/height cells are **combo inputs**: a numeric field *plus* a sizing dropdown (`HUG_CONTENT`, `FILL_CONTAINER`, `FIXED`, plus min/max variants) — directly evidenced by `stack_sizing_select_v5` class names and `constraints_resizing_panel.{fixed_width,hug_contents,fill_container}` at byte ≈ 4,130,000.

### 3.4 Layout — auto layout (FACT, ordered from key groups)
`stack_panel.layout` = "Layout", `stack_panel.auto_layout` = "Auto layout", `stack_panel.use_auto_layout` = "Use auto layout", `stack_panel.remove_auto_layout`, `stack_panel.advanced_layout`, `stack_panel.settings`-equivalent `section_autoLayout.settings` = "Auto layout settings".

Control order (INFERENCE from key families, high confidence):
1. **Direction** — `stack_panel.horizontal` / `.vertical` (+ `stack_panel.wrap` = "Wrap" toggle for horizontal).
2. **Sizing** — W/H sizing dropdowns (`al.hug`, `al.fill`, `al.fixed.*`, `al.hug_with_value`, `al.fill_with_value`).
3. **Gap** — `section_autoLayout.label_gap` = "Gap"; `space_between` / `space_around` / `space_evenly` / `stack_panel.auto` (Auto spacing); `gap_columns_horizontal`, `gap_rows_vertical` for grid; `tooltip_horizontalGap` / `tooltip_verticalGap`, `tooltip_mixedGap`.
4. **Padding** — `section_autoLayout.label_padding` = "Padding"; `all_paddings` / `independent_paddings`, `top_padding`, `right_padding`, `bottom_padding`, `left_padding`, `horizontal_padding`, `vertical_padding`; `all_margins` / `independent_margins`, `margin_top/right/bottom/left`, `margin`, `horizontal_margin`, `vertical_margin`.
5. **Alignment** — 9-cell + baseline (`align_*`, `align_text_baseline`).
6. **Min/max** — `minmax.min_width_add` = "Add min width…", `max_width_add`, `min_height_add`, `max_height_add`, `remove_min_width`, `apply_current_width` = "Set to current width", short labels `Min W` / `Max H` for the collapsed chips.
7. **Canvas stacking** — `first_on_top` / `last_on_top`, `canvas_stacking_order`.
8. **Clip content** — `transform_panel.clip_content` = "Clip content" (`clip_content_preserve_3d_disabled_tooltip` = "Ignored by Preserve 3D").
9. **Borders in layout** — `borders_take_space` = "Strokes", `borders_take_space.apr26` = "Inside stroke".
10. Per-child: `included_in_layout` / `excluded_from_layout`, `stack_panel.excluded`.

Also present: legacy/updated auto-layout migration (`new_stack_layout` = "Layout" with `.legacy` / `.new` / `.upgrade`, `legacy_stack_layout_in_selection.warning`), and `stack_panel.sizing_disabled.no_fill_component` = "Fill can only be applied to instances, not components", `sizing_disabled.select_all_fill` = "Select all children to set to fill" — **these are disabled-reason tooltips**, proving the panel surfaces why a control is disabled.

### 3.5 Constraints (FACT)
Section title `constraints_panel.constraints` = "Constraints". Two dropdowns: `constraints_panel.constraints.horizontal.tooltip` / `.vertical.tooltip`, values `left|right|left_and_right|center|scale|top|bottom|top_and_bottom` with truncated forms `L + R`, `T + B`. Paired with a **resizing** panel: `constraints_resizing_panel.horizontal_resizing` / `vertical_resizing` with `fill|fixed|hug`/`fill_container|fixed_width|hug_contents`.

### 3.6 Fill (FACT)
Title `fill.fill` = "Fill"; add affordance `section_fill.tooltip_addFill` = "Add fill". Paint-type order is directly recoverable from the formatter switch at byte ≈ 1,736,600 (`class u{...format}`), which maps paint enums to labels in this order:

`SOLID` → "Solid" · `VIDEO` → "Video" · `IMAGE` → "Image" (or "GIF" if `animatedImage`) · `GRADIENT_LINEAR` → "Linear" · `GRADIENT_RADIAL` → "Radial" · `GRADIENT_ANGULAR` → "Angular" · `GRADIENT_DIAMOND` → "Diamond" · `PATTERN` → "Pattern" · `NOISE` → "Noise" · `CUSTOM` → shader fill.

Row anatomy (FACT): a paint row is `stylePaintRow` (≈ 3,664,549) — color swatch + hex/value + opacity, with a separate `styleNameRow` when a **style** is bound (`styleType:"FILL"`, style chip + name, copy-on-click "Copy {value}"), plus per-style `stylePaintRow` per constituent paint (`color.paints.map(...)`, so a style with N paints renders N paint rows). List is capped: `limit:5` with `fill.see_all_x_colors` = "See all {number} colors" / `fill.see_all_x_library_colors` = "See all {number} library colors". Style/variable plumbing: `fill.detach_style` = "Detach style", `fill.detach_variable` = "Detach variable", `apply_variable` = "Apply variable", `apply_variable_ellipses` = "Apply variable…", `apply_variable_hotkey` = "Press = to apply a variable". Gradient sub-rows: `gradient` + `start_point` / `end_point` / `swap_start_and_end_points` / `flip_gradient`, interpolation (`interpolation_color_space.{default,oklab,oklch,hsl,srgb_linear}`, `interpolation_hue_method`). Extras: `selection_colors` = "Selection colors" with `current_page_colors` = "On this page", `select_item_using_this_color`, `show_selection_colors` / `show_in_exports` / `include_the_canvas_or_group_background_in_exports`. Image-specific: `image_scale_mode`, `image_scale.crop`, `alt_text.*` (Alt text, Decorative, "Media settings").

### 3.7 Stroke (FACT — row order proven from JSX at byte ≈ 5,133,000–5,140,000)
Title `fill.stroke` = "Stroke"; add = `section_stroke.tooltip_addStroke` = "Add stroke". Observed composition inside the stroke section component:

1. **Weight row** — `section_stroke.label_weight` = "Weight"; numeric input with `ariaLabel` = `fill.stroke_width` ("Stroke weight"), `sliderMax:200`, `inputMax:1e3`, plus a **per-side border selector** (`borders.all` = "All", `borders.border_per_side` = "Individual strokes", `top/right/bottom/left`, `custom`, `mixed`) rendered inside the row's icon slot when `K` (multi-side supported).
2. **`data-testid="stroke-cap-align-join-row"`** — left: `stroke.position` = "Position" with values `position_outside` ("Outside") / `position_center` ("Center") / `position_inside` ("Inside"); right: `stroke_settings.join` = "Join" (`miter`/`round`/`bevel`). The row's **icon is the advanced-settings toggle**: `data-testid` name `toggle_advanced_settings_button`, aria-label `fill.advanced_stroke_settings` = "Advanced stroke settings", with `aria-expanded`.
3. **`data-testid="stroke-cap-profile-row"`** — left: `section_stroke.label_end_cap` = "End points" (`line_cap.butt` "Butt" / `round` / `square`); right: `width_profile.label`; icon: `width_profile` flip.
4. **Path trim** — gated on the `metronome` feature flag; `stroke.path_trim`.
5. **Advanced** flyout (`advanced_stroke_settings`): `stroke.style` = "Style" → `solid` / `dashed`; `stroke.dash` + `stroke.gap` (+ `stroke_settings.dash_gap` = "Dash, gap…", `dash_cap_*`); `stroke.miter_angle`; `stroke_settings.stroke_type` = "Stroke Type"; decorative endpoints `stroke_settings.{line_arrow,triangle_arrow,circle_arrow,diamond_arrow,reversed_triangle}`; `simplify_stroke` = "Simplify Stroke"; `borders.stroke_width`.

### 3.8 Effects (FACT)
Title `effects.effects` = "Effects"; add = `section_effects.tooltip_addEffect` = "Add effect". Effect kinds (`fullscreen.properties_panel.effects.*`): `drop_shadow`, `inner_shadow`, `layer_blur`, `background_blur`, `glass`, `noise`, `texture`, `custom_effect` = "Shader", plus `transform_effects`, `perspective`, `scene_3d_container`.
Per-row fields: Drop shadow → `effects.position` (X/Y), `effects.blur` (Blur radius), `effects.spread`, `effects.color`; blur → `properties_panel.effects.blur.type` = `Uniform` / `Progressive` with `blur.start_blur` / `blur.end_blur`; glass → `intensity_i` ("I"), `refraction`, `depth`, `dispersion`, `frost`, `splay`, `specular_angle` ("Angle"), `specular_intensity` ("Intensity"), `light`; noise → `noise.type.{mono,duo,multi}`, `noise.density`, `noise.opacity`, `noise_size`. Disabled reasons are surfaced as tooltips: `effects.glass.non_frame_warning` = "Glass works on frames only", `spread_clip_warning` = "Spread is only supported for frames or components when \"Clip content\" is enabled", `spread_rect_ellipse_warning`.

### 3.9 Typography (FACT — `fullscreen.type_panel.*`)
Title `type_panel.typography` = "Typography"; section header `type_panel.type_settings` = "Type settings", `type_panel.properties` = "Properties". Order (INFERENCE from key set, medium confidence): `font_family` ("Font family") → `font_style` ("Font style") → `font_size` ("Font size", mixed form "Font size: mixed") → `line_height` ("Line height") → `letter_spacing` ("Letter spacing") → `paragraph_spacing` → `underline_offset`; then alignment `align_left|align_center|align_right|justify` (+`align_top|align_middle|align_bottom` for vertical) and paragraph/auto-size `auto_width` = "Auto width", `auto_height` = "Auto height", `fixed_size` = "Fixed size"; `bulleted_list` / `numbered_list` / `no_list`; `variable_font_axes` = "Variable font axes…"; `switch_text_direction`; text-on-path `text_on_a_path_align_{above,on,below}`, `text_on_a_path_flip`. Text styles live here as the style chip row (`style` = "Style", `styles` = "Styles", `styles_description`).

### 3.10 Component / Instance (FACT)
Component surface: `design_systems.component_panel.*` — `component_controls` = "Component configuration", `create_component_property` = "Create property", `component_set` = "Component set", `current_variant` = "Current variant", `selected_variant` = "Selected variant", `description` (+`description_placeholder` = "How to use this component"), `link_to_documentation`, `publish_new_changes` = "Publish changes…".
Instance surface: `design_systems.instance_panel.*` — `swap_instance` = "Swap instance", `go_to_main_component`, `go_to_main_component_nin_library`, `select_instance`, `update_available` / `review_update` / `update_selected`, `component_missing` / `variant_missing` / `missing_variant_title`, `show_more`, and a full **override-reset matrix**: `reset_fill`, `reset_stroke`, `reset_effects`, `reset_text`, `reset_text_style`, `reset_size`, `reset_name`, `reset_visibility`, `reset_exports`, `reset_overlay`, `reset_interactions`, `reset_others`, `reset_to_default`, `reset_property_assignment_v2` = `Reset "{assignmentName}"`. Detach history: `inspect_panel.detached_component.remove_attachment` = "Clear detachment history". Variant axes are enumerated in `fullscreen.accessibility_dom.variants_count_label` = "Variants".

### 3.11 Export (FACT)
Section title `properties_panel.export` = "Export"; `export_title` = "Export {title}"; mixed-state hint `click_plus_to_replace_mixed_export_settings` = "Click + to replace mixed export settings"; batch `export_this_props_num_selected_layers` = "Export {numSelected} layers".
Row = **preset/format** (`export_section.format_label` = "Format", `export_settings_image_file_type`, `format_lottie`) + **scale** (`image_scale`) + **suffix** (`export_suffix_label` = "Suffix", `export_suffix_placeholder` = "Add Suffix") + remove. Advanced: `export_settings_quality.{low,medium,high}`, `export_settings_color_profile.{srgb,p3,display_p3,cmyk,document}`, `export_settings_image_sampling.{standard,bicubic}`, `export_settings_raster_resolution`, `export_settings_frame_rate`, `export_settings_loop_forever`, `export_settings_pdf_print`, `include_id_attribute`, `outline_text`, `export_text_as_outlined_path_element`, `export_stroke_as_inlined_path_element`, `export_layer_names_using_id_attributes`. Animated tab: `export_section.tab_static` / `tab_animated` = "Static"/"Animated" with `duration_label`, `loop_label`, `size_label`, `dimensions_label`, `file_size_label`, preview controls. Lint: `export_lint.issues_title` = "Issues", `num_issues_to_review`.

### 3.12 Page (FACT)
`properties_panel.page` = "Page"; `background` = "Background"; `current_page_colors` = "On this page"; `fill.include_the_canvas_or_group_background_in_exports`; `presets` = "Presets" + `presets.device_panel.{background_color,rotation,prototype_settings}`.

### 3.13 Prototype (FACT — `proto.*` 406 keys, `proto.prototype_panel.*` 69)
Surface titled `properties_panel.prototype` = "Prototype". Anatomy: **Flow starting point** (`proto.flows_panel.*`), **Interactions list** (`click_plus_to_add_new_action` = "Add action", `click_to_replace_mixed_content`, `proto.action` = "Action" with `navigate_to|back|open_overlay|close_overlay|swap_overlay|scroll_to|open_link|change_to|set_variable|set_variable_mode|conditional|none`), **Transition** (`inspect_panel.interactions.{duration,curve,delay,animate}`, `transition_overrides.easing_bar.spring`, damping/mass for springs), **Overlay** (`proto.overlay_panel.*`, `reset_overlay`), **Scroll** (`proto.scroll_panel.*`, `inspect_panel.interactions.scroll_behaviour{,_fixed,_sticky,_with_parent}`, `scroll_direction*`), **Device/presentation** (`presets.device_panel.*`).

---

## 4. Interaction patterns worth mirroring

| Pattern | Evidence |
|---|---|
| Rows are collapsible; section can be collapsed to a title + chevron | `properties.tooltip.ignore_auto_layout`, generic section component (title keys exist but comp. in missing chunk — INFERENCE) |
| Fill/Stroke/Effects are **lists** with a trailing **+** affordance | `section_fill.tooltip_addFill`, `section_stroke.tooltip_addStroke`, `section_effects.tooltip_addEffect`, `stroke.add` = "Add stroke" |
| Hover a row → reveal remove / visibility | `fill.remove` = "Remove", `tooltip_remove` = "Remove", `tooltip_hide` / `tooltip_show`, `toggle_visibility` |
| Color row = swatch + value + opacity + style/variable binding | `stylePaintRow`, `styleNameRow`, `inspect_panel.colors.copy_aria_label`, `apply_variable` |
| Mixed values are explicit, not blank | `click_plus_to_replace_mixed_content` = "Click + to replace mixed content", `color_contrast.mixed`, `export_section.mixed_value` = "Mixed", `instance_panel.mixed` = "Mixed" |
| Disabled ≠ hidden: disabled controls explain themselves via tooltip | `stack_panel.sizing_disabled.*`, `effects.glass.non_frame_warning`, `grid.disabled_for_slots`, `color_contrast.unavailable.*` |
| Split input: press modifier to pick from a dropdown | `split_input_description` = "Press {cmd} to select an option.", `split_input_with_variable_description` = "Press {cmd} to select an option. Press = to apply a variable." |
| Overflow "see all" limits long color lists to 5 | `limit:5` + `fill.see_all_x_colors` |
| Everything records a `recordingKey` for analytics | `recordingKey: c.Pt(e,"weight")`, `"more"`, `"borderSide"`, `"select"` throughout |

## 5. Keyboard / accelerator effects (FACT where stated)

- **Arrow increments with 10× big step:** numeric inputs are constructed with `{smallNudgeAmount, bigNudgeAmount}`; defaults are **1** and **10** (`smallNudgeAmount(){return this.options.smallNudgeAmount??1}`, `bigNudgeAmount(){return ...??10}`) and the input chooses via `getNudgeAmount(e){return e ? this.bigNudgeAmount() : this.smallNudgeAmount()}` (byte ≈ 5,13x,xxx and the nudge class). The boolean is passed by the input on shift-arrow — **INFERENCE (high)** that shift = ×10.
- **`=` applies a variable** to a focused property: `apply_variable_hotkey` = "Press = to apply a variable"; reinforced by `split_input_with_variable_description`.
- **Modifier+Down opens the dropdown** of a split input: `split_input_windows_shortcut` = "Control plus Down Arrow" (Windows); the mac equivalent is `{cmd}`-parameterised in `split_input_description`.
- **Tab / section cycling, alt-duplicate, enter-to-commit:** **UNKNOWN** — no panel-scoped accelerator keys recoverable; the only Tab references are canvas focus-order commands (`toggle-include-everything-in-tab-order`).

## 6. Layout blueprint (hand-off spec)

```
Right rail
└─ Tab strip: [Design] [Prototype]        ← Dev Mode replaces rail with [Inspect]
   └─ Design
      1  Layer header      : type glyph · name · [hoisted actions ▾]
      2  Alignment         : 6 align | 6 distribute | tidy
      3  Position & size   : X|Y → W|H(+sizing ▾+min/max chip) → rotation|radius → (arc|3D)
      4  Layout (auto)     : direction|wrap → W/H sizing → gap(+auto spacing) → padding(all|per-side)
                             → alignment 3×3(+baseline) → min/max rows → canvas stacking
                             → clip content → strokes-in-layout → per-child include/exclude
      5  Grid              : dimensions (cols×rows) → columns/rows track sizing → gap col/row → flow
      6  Constraints       : horizontal ▾ | vertical ▾   (+ resizing: fill|fixed|hug)
      7  Fill   [list][+]  : per row: swatch · value/hex · opacity · style|variable chip · remove
                             add-menu: Solid·Linear·Radial·Angular·Diamond·Image·Video·Pattern·Noise·Shader
                             footer: Selection colors / On this page / Show in exports
      8  Stroke [list][+]  : Weight(+per-side ▾) → Position|Join(+advanced ⚙) → End points|Width profile
                             → Path trim → advanced(style solid|dashed, dash/gap, miter, caps, arrows)
      9  Effects[list][+]  : per row: kind ▾ · X/Y · blur · spread · color · remove
                             add-menu: Drop shadow·Inner shadow·Layer blur·Background blur·Glass·Noise·Texture·Shader
     10  Typography        : family → style → size → line-height → letter-spacing → paragraph
                             → h-align|v-align → auto-size(width|height|fixed) → list → variable axes
     11  Text style/vars   : style chip | variable chip (detach/style-definition link)
     12  Component/Instance: (component) config · property list · description · publish
                             (instance) swap · main component · override reset matrix
     13  Export [list][+]  : preset/format ▾ · scale · suffix · remove → advanced(quality, color
                             profile, sampling, DPI, fps, PDF, outline text, id attribute)
     14  Appearance        : opacity · blend mode ▾ · show content
   └─ Page (nothing selected): Page name · Background · On this page colors · Presets
   └─ Prototype: Flow starting point → Interactions list [+] → Transition(duration/easing/delay)
                 → Overlay(settings/reset) → Scroll(behaviour/direction) → Device
   └─ Inspect (Dev Mode): Code · Colors(inspect_panel.colors.title) · Typography · Effects
                 · Images(alt/download) · Component information/properties · Export
```

## 7. Ambiguities to resolve with a runtime pass

1. **True section order** — blocked by the missing lazy chunk (§0). Resolve by capturing the additional JS chunk from the cache, or by a single runtime DOM dump of the rail.
2. Whether **Design/Prototype** is a tab strip or a segmented control (both exist as primitives in the bundle).
3. Whether **Inspect** is a third tab or a mode (evidence favours mode).
4. Exact placement of **Appearance / Grid / Constraints / Variables & styles entry points** relative to Fill/Stroke.

---

## Reproduction

```bash
# artifacts
ls -la /private/tmp/figma_editor/            # figma_app.js 8,287,210 B; .en.json 3,217,467 B
rea --version                                 # rea 6.5.0

# 1. namespace census of the i18n bundle
python3 - <<'EOF'
import json,collections
d=json.load(open('/private/tmp/figma_editor/figma_app.en.json'))
c=collections.Counter(k.split('.')[0] for k in d); print(len(d)); print(c.most_common(60))
EOF

# 2. isolate the panel namespace
python3 - <<'EOF'
import json
d=json.load(open('/private/tmp/figma_editor/figma_app.en.json'))
ks=sorted(k for k in d if k.startswith('fullscreen.properties_panel'))
print(len(ks))
open('/tmp/pp_keys.txt','w').write(''.join(f"{k}\t{d[k]['string']}\n" for k in ks))
EOF
grep -E 'section_|stack_panel|transform_panel|\.fill\.|\.stroke\.|effects' /tmp/pp_keys.txt

# 3. which panel keys the main bundle actually references
grep -o -E 'fullscreen\.properties_panel\.[a-zA-Z_0-9.]+' figma_app.js | sort -u > /tmp/pp_refs.txt
wc -l /tmp/pp_refs.txt                        # 285 of 860

# 4. prove the section-title keys are unreferenced (the recovery gap)
grep -c 'properties_panel\.fill\.fill' figma_app.js          # 0
grep -c 'properties_panel\.design'     figma_app.js          # 0
grep -o -E '`[^`]{0,40}properties_panel[^`]{0,60}`' figma_app.js   # no template-literal keys

# 5. tab primitive + panel toolbar
grep -o -b 'role:"tab"' figma_app.js                          # 4328406
grep -o -E '"data-testid":"[^"]+"' figma_app.js | sort -u | grep -Ei 'row|panel|paint|stroke'
#   -> stylePaintRow, stroke-cap-align-join-row, stroke-cap-profile-row,
#      stack-positioning-toggle, property-panel-toolbar, inspectColorRow

# 6. read the stroke-section JSX (row order) and the paint-type formatter (fill order)
dd if=figma_app.js bs=1 skip=5133000 count=7000 2>/dev/null | fold -w 240   # stroke rows
dd if=figma_app.js bs=1 skip=1735700 count=2000 2>/dev/null | fold -w 200   # SOLID..CUSTOM order

# 7. panel/tab command table (prior REA projection)
grep -nE 'show-(design|prototype|inspect|properties)-panel|panels-menu|enter-inspect-mode|toggle-variables' \
  /Volumes/TD/Projects/voo_design/analysis/figma/rea/editor-commands.txt

# 8. nudge/shift evidence
grep -o -E '.{80}(small|big)NudgeAmount.{80}' figma_app.js
```
