# Figma — recovered feature inventory (static + docs)

## How this inventory was produced (and how strong each row is)

Two thirds of the rows below are backed by **static artifacts recovered from the user's
own Figma install**, not by reading documentation:

1. **Desktop shell (static, strongest).** `rea analyze-javascript-application` over the
   pre-extracted asar (`/tmp/apps/figma`, Figma Desktop 126.9.13) reconstructed the Electron
   boundary (4 browser windows, 75 exposed API members, 34 IPC channels/23 handlers) and we
   grepped the same files for menu accelerators, i18n keys (328 shell keys × 7 locales) and
   the ~60-entry desktop bridge capability list.
2. **Editor web app (static, recovered).** Figma's editor is a remote web app; it is not in
   the asar. We recovered it non-destructively from the **Chromium simple cache** of the
   user's Figma profile (read-only scan, bodies decompressed with brotli) — 1,182 decoded
   responses including the main `figma_app` JS (8.3 MB), the English editor i18n bundle
   (33,116 UI strings / 451 namespaces), the prototype viewer, the import worker and the
   canvas WASM. `rea analyze-javascript-application` was then run over the recovered
   `figma_app.js` as well. No Figma process was restarted, killed or reconfigured.
3. **Public docs (supplementary, `strength: "docs"`).** Used only for naming/launch context
   where the recovered strings are ambiguous (Figma Motion docs).

Each row in `features.jsonl` carries a concrete pointer: an i18n key, a namespace name with
its key count, a JS token with occurrence count, an IPC/bridge capability id, or a URL.
Rows flagged `user_visible: false` are debug/internal surfaces that exist in the build but
are not part of the normal product UX.


## Coverage summary

Total inventoried capabilities: **145** across **30 areas**.

| area | rows |
|---|---|
| `file` | 13 |
| `canvas` | 8 |
| `tools` | 8 |
| `selection` | 4 |
| `vector` | 5 |
| `text` | 6 |
| `layout` | 4 |
| `components` | 6 |
| `variables` | 4 |
| `styles` | 3 |
| `effects` | 3 |
| `masks` | 2 |
| `image` | 6 |
| `motion` | 3 |
| `prototyping` | 6 |
| `presentation` | 6 |
| `export` | 4 |
| `import` | 5 |
| `ai` | 10 |
| `agent` | 5 |
| `collaboration` | 8 |
| `comments` | 2 |
| `devmode` | 7 |
| `plugins` | 3 |
| `shortcuts` | 2 |
| `settings` | 5 |
| `onboarding` | 2 |
| `performance` | 1 |
| `accessibility` | 3 |
| `i18n` | 1 |


## file

Cloud files, the file browser, version history, branching, the desktop tab model and the desktop update/error shell around the web editor.

- **Cloud design files** (`file.cloud_documents`, P0, static): Designs live in Figma cloud files with the file browser, recents and drafts. Evidence: `namespace file_browser.* (789 keys)`. — file_browser namespace has 789 keys; desktop File > Open file… (⌘O).
- **Branches and merge** (`file.branching`, P1, static): Create file branches, review changes and merge back into the main file. Evidence: `namespace collaboration.branching.* (119 keys)`. — 119 collaboration.branching* keys plus 22 merge-modal keys in the editor.
- **Figma agent chat in file browser** (`file.figma_agent_chat`, P1, static): Agent chat history and starter prompts (Build/Ask) live in the home/file browser. Evidence: `i18n key: file_browser.ai_chats.input_placeholder = "Do anything"`. — Desktop shell tracks agent running/not-running and offers Restart agent.
- **Figma Buzz (brand/marketing assets)** (`file.figma_buzz`, P1, static): Produce on-brand marketing assets with approvals/review workflows and send-to-Buzz. Evidence: `namespace buzz.* (282 keys)`. — buzz + cooper namespaces ~600 keys.
- **Figma Sites (website builder)** (`file.figma_sites`, P1, static): Build responsive websites with breakpoints, CMS data, publish and preview. Evidence: `namespace sites.* (1286 keys)`. — sites namespace 1,285 keys incl. lint, code behaviors, CMS, breakpoint bar.
- **Save local copy (.fig)** (`file.local_copy`, P1, static): Write a local .fig copy of a cloud file from the desktop File menu. Evidence: `i18n key: desktop.menu.save_local_copy = "Lokale Kopie speichern…" (locale de; same key set in all locales)`.
- **Offline / connection error tabs** (`file.offline_recovery`, P1, static): Desktop renders specific error tabs (403/404/407/502/503, connection error, crash) with retry. Evidence: `i18n key: desktop.shell_app.error_tab.crash.title = "Etwas ist schiefgelaufen" (locale de; same key set in all locales)`.
- **Tab groups, pinned and split tabs** (`file.tab_groups_split`, P1, static): Group/pin tabs, split two files side by side, move tabs between windows. Evidence: `i18n key: desktop.shell_app.tab_bar.split_tab_label = "Tab aufteilen: {tabTitle}" (locale de; same key set in all locales)`. — Tab bar also supports colored groups and pinned split groups.
- **Desktop tabs for files** (`file.tabs`, P1, static): Open multiple files as tabs in a single desktop window. Evidence: `i18n key: desktop.menu.new_tab = "Neuer Tab" (locale de; same key set in all locales)`. — Desktop-only shell feature (not the web editor).
- **Version history** (`file.version_history`, P1, static): Save named versions and browse/restore the file version history. Evidence: `i18n key: desktop.menu.save_to_version_history = "In den Versionsverlauf speichern" (locale de; same key set in all locales)`. — Editor also has version-history UI (activity_log namespace).
- **Desktop auto-update** (`file.auto_update`, P2, static): Update-available / update-error dialogs, install on next launch, release notes link. Evidence: `i18n key: desktop.dialogs.update_available.install_now = "Jetzt installieren" (locale de; same key set in all locales)`. — Channel `stable` in build.json.
- **Figma Draw** (`file.figma_draw`, P2, static): Illustration-focused Draw mode/editor with brush and vector tools. Evidence: `i18n key: fullscreen_actions.enter-draw-mode = "Switch to Draw"`.
- **Multiple windows** (`file.multi_window`, P2, static): Open files in additional desktop windows and move tabs between windows. Evidence: `i18n key: desktop.menu.new_window = "Neues Fenster" (locale de; same key set in all locales)`.

## canvas

The infinite canvas itself plus panels that are canvas-adjacent (pages, guides, quick actions, FigJam whiteboard).

- **Groups, sections and pages** (`canvas.groups_sections`, P0, static): Group/ungroup layers, create sections and pages, reorder in the layers panel. Evidence: `namespace fullscreen.pages_panel.* (44 keys)`. — pages_panel 44 keys; node_type 62 keys.
- **Infinite canvas with zoom/pan** (`canvas.infinite_canvas`, P0, static): Infinite vector canvas with zoom-to-selection, fit and keyboard panning. Evidence: `namespace fullscreen.canvas.* (31 keys)`. — fullscreen.canvas.* (31 keys) + toolbar (153 keys).
- **Quick actions / command search** (`canvas.quick_actions`, P0, static): Command palette exposing quick actions (rename layers, check designs, interactions...). Evidence: `i18n key: fullscreen_actions.quick_actions.auto-rename-layers = "Rename layers"`.
- **Arrange / z-order** (`canvas.zorder`, P0, static): Bring forward/to front, send backward/to back and the Arrange menu. Evidence: `i18n key: fullscreen_actions.bring-to-front = "Bring to front"`.
- **Measurements and annotations** (`canvas.annotations_measure`, P1, static): Measurement annotations with edge-to-edge distances shown for handoff. Evidence: `i18n key: fullscreen.accessibility.annotation_measurement.selected.left_to_right = "Measurement selected: from left edge of {fromNodeName} to right edge of {toNodeName}, distance {distance}"`.
- **FigJam whiteboard** (`canvas.figjam_whiteboard`, P1, static): FigJam whiteboard with stickies, stamps, tables and whiteboard tools. Evidence: `namespace whiteboard.* (1081 keys)`. — whiteboard namespace 1,081 keys.
- **Rulers and guides** (`canvas.rulers_guides`, P1, static): Rulers, adjustable guides and guide management on the canvas. Evidence: `i18n key: fullscreen_actions.adjust-ruler-guides = "Adjust ruler guides..."`. — fullscreen.guidelines.* has 34 keys.
- **Find and replace text on canvas** (`canvas.find_replace`, P2, static): Canvas-wide find and replace across text layers. Evidence: `i18n key: fullscreen_actions.canvas-search-replace = "Find and replace…"`.

## tools

Toolbelt: move/scale, frame, shapes, pen/vector, brush, text, comment, and the Design/Draw/Dev Mode switch.

- **Comment tool** (`tools.comment`, P0, static): Place comments on the canvas and view comment threads. Evidence: `i18n key: fullscreen_actions.comment = "Comment"`.
- **Design / Draw / Dev Mode switch** (`tools.dev_mode`, P0, static): Switch a file between Design, Draw and Dev Mode inspect views. Evidence: `i18n key: fullscreen_actions.enter-inspect-mode = "Switch to Dev Mode"`.
- **Frame tool** (`tools.frame`, P0, static): Create frames (including frame presets) as layout containers. Evidence: `namespace proto.frame_preset_panel.* (17 keys)`. — Frame preset panel has 17 keys.
- **Move and scale tools** (`tools.move_scale`, P0, static): Select/move layers and scale layers non-destructively. Evidence: `namespace fullscreen.toolbar.* (153 keys)`.
- **Pen and vector tools** (`tools.pen_vector`, P0, static): Pen tool, bend tool, vector networks and node editing. Evidence: `i18n key: fullscreen_actions.bend_tool = "Bend tool"`.
- **Shape tools** (`tools.shapes`, P0, static): Rectangle, ellipse, polygon, star, line/arrow shape tools. Evidence: `namespace fullscreen.toolbar.* (153 keys)`.
- **Text tool** (`tools.text`, P0, static): Create and edit text layers on click or by dragging a text box. Evidence: `i18n key: fullscreen_actions.create-text-node = "Create new text"`.
- **Brush tool** (`tools.brush`, P2, static): Freehand brush for whiteboard/draw-style illustration. Evidence: `i18n key: fullscreen_actions.brush_tool = "Brush tool"`.

## selection

Selection-level operations: align/distribute, aspect-ratio lock, constraints, select-same.

- **Align and distribute** (`selection.align_distribute`, P0, static): Align/distribute a multi-selection, including align-to-frame variants and tidy up. Evidence: `i18n key: fullscreen_actions.align-horizontal-center = "Align horizontal centers"`.
- **Aspect ratio lock** (`selection.aspect_ratio`, P0, static): Lock/unlock aspect ratio while resizing. Evidence: `i18n key: fullscreen_actions.aspect-ratio-lock = "Lock aspect ratio"`.
- **Constraints** (`selection.constraints`, P1, static): Pin/stretch layers to the parent frame with automatic or manual constraints. Evidence: `i18n key: fullscreen_actions.set-constraints-automatically = "Set constraints automatically"`.
- **Select all with same property** (`selection.select_same`, P1, static): Multi-select by matching fill, stroke, effect, font or component. Evidence: `i18n key: fullscreen_actions.select-same-effect = "Select all with same effect"`.

## vector

Vector network editing, live booleans, flatten/outline, text on a path and transform modifiers.

- **Boolean operations** (`vector.boolean_ops`, P0, static): Union, subtract, intersect, exclude between vector shapes; non-destructive live booleans. Evidence: `i18n key: fullscreen_actions.live-boolean-union = "Union selection"`.
- **Vector edit / bend modes** (`vector.edit_modes`, P0, static): Node-level vector editing and the bend tool for curvature. Evidence: `i18n key: fullscreen_actions.bend_tool = "Bend tool"`.
- **Flatten and outline stroke** (`vector.flatten_outline`, P1, static): Flatten vectors and convert strokes to outlines. Evidence: `i18n key: fullscreen_actions.break-vector-network-into-paths = "Break branching vector network into paths"`.
- **Text on a path** (`vector.text_on_path`, P2, static): Convert text to follow a vector path and back. Evidence: `i18n key: fullscreen_actions.combine-text-path-layers = "Convert to text on path"`.
- **Transform modifiers (repeat, skew)** (`vector.transform_modifiers`, P2, static): Linear/radial repeat and skew transform modifiers applied to a selection. Evidence: `i18n key: fullscreen_actions.add_transform-modifier-linear = "Linear repeat"`.

## text

Type panel and typography features (OpenType, RTL, lists, fonts, text styles).

- **Font management and missing fonts** (`text.fonts_missing`, P0, static): Font picker, shared fonts and missing-font resolution dialogs. Evidence: `i18n key: fullscreen_actions.ai_content_fill.missing_font = "Missing fonts"`. — shared_fonts 61 keys; the shell exposes parsed_fonts for font install.
- **Typography settings** (`text.typography_settings`, P0, static): Type panel: font family/size/weight, line height, letter spacing, alignment, case, decoration. Evidence: `i18n key: fullscreen_actions.adjust_font_size = "Adjust font size"`. — type_panel 36 keys; type_settings 189 keys.
- **Text styles** (`text.styles`, P1, static): Reusable text styles shared/published from libraries. Evidence: `namespace design_systems.styles.* (54 keys)`. — design_systems.styles.* 54 keys; create_style 29 keys.
- **OpenType character variants** (`text.character_variants`, P2, static): Per-node OpenType features: character variants, ligatures and numeric styles. Evidence: `i18n key: type_settings.character_variants = "Character variants"`.
- **Lists and rich text** (`text.lists_rich`, P2, static): Bulleted/numbered lists, decoration and rich text formatting. Evidence: `i18n key: fullscreen_actions.bulleted_and_numbered_list = "Turn into a list"`.
- **RTL / bidirectional text** (`text.rtl_bidi`, P2, static): Native RTL and bidirectional text rendering with a migration update flow. Evidence: `i18n key: type_settings.bidi_update_tooltip = "To use Figma’s native RTL support, older text needs to be updated.

Any text you reversed using a plugin may appear backwards."`.

## layout

Auto layout/stacks, grids, wrap and sizing, plus the AI 'suggest auto layout' helpers.

- **Auto layout** (`layout.auto_layout`, P0, static): Stacks with padding, gap, alignment, resizing and nested frames. Evidence: `i18n key: fullscreen_actions.stack-selection = "Add auto layout"`.
- **Layout grids** (`layout.layout_grids`, P1, static): Column/row/grid layout guides applied to frames. Evidence: `namespace fullscreen.grids_panel.* (16 keys)`. — grids_panel 16 keys, grid_panel 13 keys.
- **Auto-layout wrap / min-max sizing** (`layout.min_max_wrap`, P1, static): Wrap children, min/max width-height and fill/hug/fixed sizing. Evidence: `namespace fullscreen.properties_panel.* (860 keys)`. — properties_panel has 860 keys covering layout/sizing.
- **Suggest auto layout / multi-stack** (`layout.suggest_auto_layout`, P2, static): AI-assisted auto-layout suggestion and applying layouts to many nested frames. Evidence: `i18n key: fullscreen_actions.run-multi-stack-auto-layout = "Suggest auto layout"`.

## components

Components, instances, variants/component properties, slots, libraries and overrides.

- **Components and instances** (`components.components_instances`, P0, static): Create components, insert instances, swap instances and detach. Evidence: `i18n key: fullscreen_actions.choose_instance = "Choose instance"`.
- **Team libraries and publishing** (`components.libraries`, P0, static): Publish/unpublish library assets and receive library updates. Evidence: `namespace design_systems.libraries_modal.* (353 keys)`. — libraries_modal 353 keys, publishing_modal 75, updates 39.
- **Variants and component properties** (`components.variants_properties`, P0, static): Component sets with variants plus boolean/text/instance-swap properties. Evidence: `i18n key: fullscreen_actions.add-variant = "Add variant"`. — component_properties 116 keys.
- **Instance swap picker** (`components.library_swap`, P1, static): Swap instances across libraries with search and variants. Evidence: `namespace design_systems.instance_swap_picker.* (23 keys)`. — 23 keys.
- **Instance overrides** (`components.overrides`, P1, static): Override nested content and review/revert overrides in inspect mode. Evidence: `namespace dev_handoff.overrides.* (14 keys)`.
- **Component slots** (`components.slots`, P2, static): Slots inside components that accept arbitrary child content. Evidence: `i18n key: fullscreen_actions.convert-to-slot = "Convert to slot"`.

## variables

Design variables: collections, modes, scopes/code syntax and variable binding UI.

- **Variable modes** (`variables.modes`, P0, static): Modes (light/dark/breakpoints) switch variable values per collection. Evidence: `namespace variables.modes.* (3 keys)`.
- **Variables and collections** (`variables.variables_collections`, P0, static): Author color/number/string/boolean variables in collections, groups and aliases. Evidence: `namespace variables.authoring_modal.* (99 keys)`. — authoring_modal 99 keys.
- **Variable binding UI** (`variables.binding_ui`, P1, static): Bind variables to fills, strokes, effects, layout values and text content. Evidence: `namespace variables.binding_ui.* (23 keys)`. — binding_ui 23 keys.
- **Variable scopes and code syntax** (`variables.scopes_code_syntax`, P1, static): Per-variable scopes plus code syntax used by Dev Mode implementation output. Evidence: `namespace variables.scopes.* (31 keys)`. — scopes 31 keys.

## styles

Paint/text/effect/grid styles, libraries, publishing and UI-kit presets.

- **Paint / text / effect / grid styles** (`styles.paint_text_effect_styles`, P0, static): Reusable publishable paint styles, text styles, effect styles and layout grids. Evidence: `namespace design_systems.styles.* (54 keys)`.
- **Library subscriptions** (`styles.library_subscriptions`, P1, static): Subscribe/unsubscribe files and teams to libraries in the assets panel. Evidence: `namespace design_systems.subscriptions.* (7 keys)`. — subscriptions 7 keys, assets_panel 73 keys.
- **UI kits / presets** (`styles.presets_ui_kits`, P2, static): Figma and partner UI kits (presets) browsable and insertable from libraries. Evidence: `i18n key: design_systems.libraries_modal.presets.explore_presets = "Explore UI kits created by Figma and close partners."`.

## effects

Shadows, blur and shader effects.

- **Layer and background blur** (`effects.blur`, P0, static): Layer blur, background blur and progressive blur in the effects panel. Evidence: `namespace inspect_panel.effects.* (5 keys)`.
- **Drop and inner shadows** (`effects.shadows`, P0, static): Stacked drop/inner shadows with spread and effect styles. Evidence: `i18n key: fullscreen_actions.select-same-effect = "Select all with same effect"`. — inspect_panel.shadows.* 13 keys.
- **Shader effects** (`effects.shader_effects`, P2, static): Shader-based effects with playback controls. Evidence: `namespace fullscreen.shader_playback.* (8 keys)`. — shader_playback 8 keys.

## masks

Mask layers and mask types (alpha, luminance, vector outlines).

- **Mask layers** (`masks.mask_layers`, P0, static): Use a layer (vector, alpha or luminance) as a mask for a group/frame. Evidence: `i18n key: fullscreen_actions.mask-selection = "Use as mask"`.
- **Mask types: alpha / luminance / vector outline** (`masks.mask_types`, P1, static): Choose the mask mode and how outlines are used. Evidence: `i18n key: fullscreen.mask_panel.alpha = "Alpha"`.

## image

Placing/cropping media plus the AI image tools (edit, expand, background removal, generate).

- **Image crop and media crop** (`image.crop`, P0, static): Crop raster images and video layers on canvas. Evidence: `i18n key: fullscreen_actions.crop-image = "Crop image"`.
- **Place images and videos** (`image.place_image_video`, P0, static): Place images/videos by file picker or drag, creating image/video layers. Evidence: `i18n key: fullscreen_actions.place_image = "Place image…"`.
- **Image fill and adjustments** (`image.adjustments`, P1, static): Image fill modes, adjustments and per-node image fills. Evidence: `namespace inspect_panel.images.* (12 keys)`.
- **AI image editing** (`image.ai_edit`, P1, static): Edit images with a prompt, expand images and compare models. Evidence: `i18n key: image_ai.done_pill.edit_image = "{count, plural, one {Image edited} other {Images edited}}"`. — image_ai namespace 97 keys.
- **AI image generation** (`image.ai_generate`, P1, static): Generate images from prompts inside the canvas. Evidence: `i18n key: image_ai.done_pill.generate_image = "{count, plural, one {Image generated} other {Images generated}}"`.
- **Background removal** (`image.background_removal`, P1, static): One-click AI background removal on a selected image. Evidence: `i18n key: image_ai.background_remove.instruction = "First, select one image"`.

## motion

Figma Motion: the keyframe timeline, presets, audio; smart animate is counted here as the animation bridge from prototypes.

- **Keyframes** (`motion.keyframes`, P0, static): Add/select/delete keyframes, easing and interpolation on the timeline. Evidence: `i18n key: motion.timeline.accessibility.keyframes = "{count, plural, one {1 keyframe} other {# keyframes}}"`. — Docs corroborate the recovered UI strings.
- **Smart animate** (`motion.smart_animate`, P0, static): Automatic tweening between matching layers across prototype frames. Evidence: `i18n key: proto.transition_behavior.smart_animate = "Smart animate"`. — 7 SMART_ANIMATE tokens in the recovered editor JS bundle.
- **Figma Motion timeline** (`motion.timeline`, P0, static): Keyframe timeline for animating layers with composite styles and presets. Evidence: `namespace motion.timeline.* (139 keys)`. — timeline 139 keys, preset_flyout 103, panel 50. Figma Motion is the animation surface.

## prototyping

Prototype interactions, transitions/easing, overlays/scroll, flows and presentation.

- **Prototype interactions** (`prototyping.interactions`, P0, static): Wire triggers (click/drag/keys) and actions between frames; manage the interaction list. Evidence: `namespace proto.interaction.* (33 keys)`.
- **Present prototypes** (`prototyping.present`, P0, static): Present as prototype (full screen) and copy a presentation link. Evidence: `i18n key: fullscreen_actions.present-as-prototype = "Present"`.
- **Transitions and easing** (`prototyping.transitions`, P0, static): Animate/dissolve/instant/move in-out/push/slide transitions with easing editor. Evidence: `i18n key: proto.transition_behavior.animate = "Animate"`.
- **Flows and starting points** (`prototyping.flows_starting_points`, P1, static): Multiple prototype flows, starting points and a flow panel preview. Evidence: `namespace proto.starting_points.* (15 keys)`.
- **Overlays and scroll behavior** (`prototyping.overlays`, P1, static): Overlay panels, scroll containers and positioning behaviour for prototypes. Evidence: `namespace proto.overlay_panel.* (4 keys)`.
- **Prototype variables and expressions** (`prototyping.variables_expressions`, P2, static): Set variable modes and expression builders inside prototype interactions. Evidence: `namespace proto.set_variable_mode.* (2 keys)`.

## presentation

Presenter spotlight/recordings (present mode detail lives under prototyping/slides).

- **Figma Slides editor** (`slides.editor`, P0, static): Slide deck editor with slide carousel, outline, properties and templates. Evidence: `namespace slides.carousel.* (13 keys)`. — Slides namespace 605 keys.
- **Export slides to PDF** (`slides.export_pdf`, P1, static): Export all/some or selected slides to PDF. Evidence: `i18n key: fullscreen_actions.export-all-slides-to-pdf = "Export all slides to PDF…"`.
- **Speaker notes** (`slides.speaker_notes`, P1, static): Per-slide speaker notes and presenter view. Evidence: `namespace slides.speaker_notes.* (24 keys)`.
- **Presenter spotlight and recordings** (`presentation.spotlight`, P2, static): Presenter spotlight, recordings and viewer presence in multiplayer presentations. Evidence: `namespace collaboration.spotlight.* (47 keys)`. — spotlight 47 keys.
- **Charts in slides** (`slides.charts`, P2, static): Insert charts and data-driven visuals into slides. Evidence: `namespace slides.charts.* (6 keys)`.
- **Slide object animation** (`slides.slide_animation`, P2, static): Animate slide objects and copy as animated SVG. Evidence: `i18n key: fullscreen_actions.add-slide-object-animation = "Animate…"`.

## export

Export panel, formats, copy-as, batch/all-frames PDF and the desktop PDF menu item.

- **Export panel** (`export.export_panel`, P0, static): Export frames/selection at multiple scales and formats from a dedicated panel. Evidence: `i18n key: fullscreen_actions.export = "Export"`. — export 21 keys, export_panel 8 keys.
- **PNG/SVG/PDF/JPG export and copy-as** (`export.formats`, P0, static): Export or copy-as PNG, SVG, animated SVG, PDF and platform code. Evidence: `i18n key: fullscreen_actions.copy-as-png = "Copy as PNG"`.
- **Batch export** (`export.batch`, P1, static): Export multiple frames/slides at once, including all frames to PDF. Evidence: `i18n key: fullscreen_actions.export-all-frames-to-pdf = "Export frames to PDF…"`.
- **Desktop Export frames to PDF** (`export.desktop_pdf`, P1, static): Native desktop File menu item to export frames or slides to PDF. Evidence: `i18n key: desktop.menu.export_frames_to_pdf = "Frames als PDF exportieren…" (locale de; same key set in all locales)`.

## import

Sketch import, CSV import, SVG/PDF imports and local .fig opening.

- **Place images/video** (`import.place_media`, P0, static): Place image/video files from disk onto the canvas. Evidence: `i18n key: fullscreen_actions.place = "Place image/video…"`.
- **Open local .fig files** (`import.figma_file_open`, P1, static): Desktop Open/drag .fig files directly into the app. Evidence: `i18n key: desktop.menu.open_file_browser = "Datei-Browser öffnen" (locale de; same key set in all locales)`.
- **Import Sketch files** (`import.sketch`, P1, static): Import .sketch documents as editable Figma files. Evidence: `i18n key: fullscreen_actions.new-from-sketch = "Import from Sketch"`. — Recovered import.worker.js (3.3 MB) supports bulk import.
- **Import SVG/PDF and design files** (`import.svg_pdf`, P1, static): Drop/import SVG, PDF and .fig files into a file. Evidence: `i18n key: fullscreen_actions.import = "Import…"`. — file_import 28 keys.
- **Import from CSV** (`import.csv`, P2, static): Import CSV data into the canvas/whiteboard. Evidence: `i18n key: fullscreen_actions.import-from-csv = "Import from CSV…"`.

## ai

Figma AI/Make surfaces: Make, Make Local, canvas assistant, content fill, text rewrite/translate, linter, FigSpec and MCP connectors.

- **Figma AI assistant on canvas** (`ai.assistant_generate_variations`, P0, static): Selection-aware canvas assistant: generate variations, rename layers, check designs. Evidence: `i18n key: ai_assistant.canvas_prompt_suggested_actions.create_variations_label = "Create variations"`.
- **Figma Make (prompt to working prototype/app)** (`ai.figma_make`, P0, static): Generate interactive prototypes/apps from prompts and edit them conversationally. Evidence: `namespace figmake.* (2460 keys)`. — figmake namespace 2,460 keys (largest product surface).
- **AI content fill** (`ai.content_fill`, P1, static): Replace duplicate text/images with realistic generated content. Evidence: `i18n key: fullscreen_actions.ai_content_fill.placeholder_fill_realistic_content = "Fill in realistic content"`.
- **Figma Make Local (run projects locally)** (`ai.make_local`, P1, static): Run Make projects against a local working directory with browser preview and code components. Evidence: `namespace make_local.* (577 keys)`. — make_local editor namespace 577 keys; desktop bridge exposes the browser-preview API.
- **MCP connectors for AI** (`ai.mcp_connectors`, P1, static): Custom/featured MCP connectors, per-org enablement and publish/unpublish. Evidence: `i18n key: activity_log.event.mcp_custom_connector_create = "Created custom connector {connectorName} with URL {connectorUrl}"`. — Editor i18n records connector CRUD; the desktop shell ships an MCP client manager.
- **AI text rewrite** (`ai.text_rewrite`, P1, static): Rewrite selected text with tone/instruction presets (shorter, casual, marketing...). Evidence: `i18n key: ai_text_tools.rewrite.casual.label = "More casual"`.
- **AI translate text** (`ai.translate`, P1, static): Translate text layers into a chosen language. Evidence: `i18n key: ai_text_tools.translate.language = "Language"`.
- **AI bulk-edit nudges** (`ai.bulk_edit_nudge`, P2, static): Prompt suggestions to apply bulk edits (auto layout everywhere, spacing changes...). Evidence: `i18n key: ai_assistant.bulk_edit_nudge.apply_auto_layout_placeholder = "ex. Apply auto layout to all nested frames in this selection (with 8px padding)"`.
- **AI design linter / check designs** (`ai.design_linter`, P2, static): Suggestions for detached components, contrast, alpha and library mismatches. Evidence: `i18n key: design_linter.contrast_setting.description = "Check color contrast"`. — design_linter namespace 125 keys.
- **FigSpec — AI technical specs** (`ai.figspec`, P2, static): Draft/review technical specs from Figma, GitHub, Jira and Slack via connectors. Evidence: `namespace figspec.assistant.* (16 keys)`. — figspec namespace 190 keys.

## agent

The agent layer: the Figma agent, the Dev Mode MCP server shipped inside the desktop app, MCP client management and proxy support.

- **Figma Dev Mode MCP Server** (`agent.devmode_mcp_server`, P0, static): Bundled MCP server that exposes design context/codegen to AI clients. Evidence: `string: Figma Dev Mode MCP Server`. — dev_handoff.mcp.* has 141 keys incl. install flows; docs URL is canonical.
- **Figma agent (file-level AI agent)** (`file.figma_agent`, P0, static): Agent chat that can build/edit files and answer questions from the file browser. Evidence: `i18n key: file_browser.ai_chats.empty_state_title = "You haven’t chatted with the Figma agent yet"`.
- **Desktop agent status and restart** (`agent.desktop_agent`, P1, static): Desktop shell reports agent running state/version and can restart the agent. Evidence: `i18n key: desktop.shell_app.agent_status = "Agentenstatus: " (locale de; same key set in all locales)`.
- **MCP client config manager** (`agent.mcp_client_manager`, P1, static): Installs/updates MCP client configs (Claude, Cursor, VS Code, Xcode...) for the dev-mode server. Evidence: `desktop bridge capability: mcp:installMissingMcpClientConfigs`.
- **Corporate proxy support** (`agent.proxy_agent`, P3, static): Proxy agent used for outbound requests in managed networks (with help-center guidance). Evidence: `i18n key: desktop.dialogs.blocked_by_proxy.title = "Blockierte Navigation zu „{hostname}“" (locale de; same key set in all locales)`.

## collaboration

Multiplayer editing, follow/observe, cursor chat, voice, notifications, branch reviews, sharing and the activity log.

- **Multiplayer editing and cursors** (`collaboration.multiplayer`, P0, static): Realtime multiplayer editing with remote cursors and presence. Evidence: `namespace collaboration.* (812 keys)`.
- **Sharing and permissions** (`collaboration.share_permissions`, P0, static): File/folder/team permissions, link access, guest roles and sharing modals. Evidence: `namespace file_permissions_modal.* (122 keys)`. — file_permissions_modal 122 keys, permissions 131 keys.
- **Branch reviews and merge conflicts** (`collaboration.branching_reviews`, P1, static): Request reviews on branches, resolve merge conflicts and compare changes. Evidence: `namespace collaboration.branching_reviews.* (12 keys)`.
- **Follow presenter / observe mode** (`collaboration.follow_presenter`, P1, static): Follow another user or the presenter's viewport. Evidence: `i18n key: fullscreen_actions.follow_presenter = "Follow presenter"`.
- **Activity log and admin events** (`collaboration.activity_log`, P2, static): Team/org activity log with filters for sharing, exports, AI and MCP events. Evidence: `namespace activity_log.filter.* (296 keys)`. — activity_log namespace 925 keys.
- **Cursor chat** (`collaboration.cursor_chat`, P2, static): Ephemeral cursor chat bubbles in multiplayer sessions (org-toggleable). Evidence: `i18n key: fullscreen_actions.start-chat = "Cursor chat"`.
- **Desktop notifications (FCM)** (`collaboration.notifications`, P2, static): Push notifications for mentions/comments via Firebase Cloud Messaging. Evidence: `string: notificationReceived`. — Shell ships lazy/external/fcm_manager.js.
- **Voice calls** (`collaboration.voice`, P2, static): In-file voice calls with microphone permission prompts. Evidence: `namespace collaboration.voice.* (60 keys)`. — collaboration.voice.* 60 keys.

## comments

Comment pins, threads, unread state and mute/notification behaviour.

- **Comment threads** (`comments.threads`, P0, static): Canvas comment pins, threaded replies, mentions and resolve. Evidence: `i18n key: fullscreen_actions.comment-unread = "Comment ({count} unread)"`. — comments namespace 180 keys.
- **Comment notifications and mute** (`comments.notifications`, P1, static): Unread badge, notification preferences, muted threads and mention alerts. Evidence: `i18n key: fullscreen_actions.comments-disabled = "Comments disabled"`.

## devmode

Dev Mode inspect panel, codegen, Code Connect, annotations, dev resources, platform units and MCP/VS Code setup.

- **Code snippets and AI codegen** (`devmode.codegen`, P0, static): Generate code from the selection with language-aware snippets and copy/download. Evidence: `i18n key: inspect_panel.code.code = "Code"`. — dev_handoff.code.* 48 keys.
- **Dev Mode inspect panel** (`devmode.inspect_panel`, P0, static): Inspect properties, box model, code snippets and assets for developers. Evidence: `namespace inspect_panel.properties.* (45 keys)`. — properties 45 keys, typography 60.
- **Dev Mode annotations** (`devmode.annotations`, P1, static): Add/remove annotations and measurements on layers for handoff. Evidence: `i18n key: fullscreen_actions.annotations-menu = "Annotations"`. — annotations 77 keys.
- **Code Connect** (`devmode.code_connect`, P1, static): Map components to code snippets via Code Connect, browsed in a component browser. Evidence: `i18n key: fullscreen_actions.mcp-enable-code-connect = "Enable Code Connect"`. — component_browser 325 keys; the make-local preview preload exposes __figmaCodeConnect.
- **Dev resources and links** (`devmode.dev_resources`, P1, static): Attach developer resources (Storybook, docs, tickets) to layers. Evidence: `i18n key: dev_handoff.add_dev_resource = "Add dev resources"`.
- **Platform units (dp/pt/rem)** (`devmode.units`, P1, static): Show dimensions in Android dp/sp, iOS pt, CSS rem and custom units. Evidence: `i18n key: dev_handoff.alternative_units.description_scale_factor_web = "Root font size for scaling pixels into CSS rems"`.
- **VS Code integration and MCP install** (`devmode.vscode`, P1, static): One-click MCP/VS Code installation modals and guided setup for developers. Evidence: `namespace dev_handoff.vscode.* (11 keys)`.

## plugins

Plugins, FigJam widgets and the Figma Community.

- **Plugin system** (`plugins.plugins`, P0, static): Run installed plugins from the Plugins menu; manage plugins and dev plugins. Evidence: `i18n key: fullscreen_actions.manage-plugins = "Manage plugins…"`.
- **Figma Community** (`plugins.community`, P1, static): Browse/install community files, plugins, widgets and templates. Evidence: `namespace community.* (2418 keys)`. — community namespace 2,418 keys.
- **Widgets (FigJam)** (`plugins.widgets`, P1, static): Insert/manage widgets in FigJam; widgets cannot be pasted into Buzz. Evidence: `i18n key: fullscreen_actions.manage-widgets = "Manage widgets…"`.

## shortcuts

Shortcut reference/customization and native desktop accelerators.

- **Keyboard shortcuts panel** (`shortcuts.panel`, P1, static): Searchable keyboard shortcuts reference and shortcut customization settings. Evidence: `i18n key: fullscreen_actions.open-shortcuts = "Keyboard shortcuts"`.
- **Desktop menu accelerators** (`shortcuts.desktop_accelerators`, P2, static): Native desktop shortcuts: New Window ⌘⇧N, New Tab ⌘T, Close Tab ⌘W, Open ⌘O, zoom shortcuts. Evidence: `string: CmdOrCtrl+Shift+N`.

## settings

Desktop preferences: interface scale, color management, haptics/tray and localization.

- **Color management (Display P3 vs sRGB)** (`settings.color_management`, P2, static): Assign/convert file color profiles and manage color-space handling in the desktop app. Evidence: `i18n key: desktop.menu.color_space_srgb = "sRGB" (locale de; same key set in all locales)`. — Editor has fullscreen.color_management.* (34 keys).
- **Desktop preferences** (`settings.desktop_preferences`, P2, static): Preferences dialog covering color management, interface scale, graphics backend, haptics, tray. Evidence: `i18n key: desktop.menu.preferences = "Einstellungen" (locale de; same key set in all locales)`.
- **Desktop interface scale** (`settings.interface_scale`, P2, static): Zoom the entire Figma UI (larger/smaller/reset, percent indicator). Evidence: `i18n key: desktop.menu.interface_scale_make_larger = "Vergrößern" (locale de; same key set in all locales)`. — Accelerators Shift+Cmd+Alt+0 / +/-.
- **Haptic feedback, menu-bar and tray integration** (`settings.haptics_tray`, P3, static): macOS haptic feedback toggle, show Figma in menu bar / system tray. Evidence: `i18n key: desktop.menu.enable_haptic_feedback = "Haptisches Trackpad-Feedback aktivieren" (locale de; same key set in all locales)`.
- **Desktop UI localization** (`settings.locales`, P3, static): Desktop shell UI localized via i18n bundles; 7 locales ship inside the asar. Evidence: `i18n key: desktop.menu.help_page = "Hilfeseite" (locale de; same key set in all locales)`. — i18n/: de, es-es, es-la, fr, ja, ko-kr, pt-br (7, not 15 as briefed).

## onboarding

New-user experience and the desktop Home tab.

- **Home tab** (`onboarding.home_tab`, P2, static): Desktop home tab with new-file menu (Design/FigJam), community tab and file browser. Evidence: `i18n key: desktop.shell_app.tab_bar.home_tab.label = "Startseite" (locale de; same key set in all locales)`.
- **New user experience** (`onboarding.new_user_experience`, P2, static): Choose product (Design/Draw/Sites/Slides/FigJam/Buzz...) and plan onboarding flow. Evidence: `i18n key: new_user_experience.choose_plan.title = "Which plan would you like?"`.

## performance

Performance HUD/memory instrumentation exposed by the editor.

- **Performance HUD and memory controls** (`performance.perf_hud`, P3, static): Show performance HUD, memory usage indicator, purge memory and download a memory profile. Evidence: `i18n key: fullscreen_actions.toggle-perf-hud = "Show performance HUD"`. — Internal/debug commands.

## accessibility

Screen-reader announcements, contrast checks and accessible Slides/Sites content.

- **Screen-reader announcements** (`accessibility.screen_reader`, P1, static): Canvas edits and selections are announced to screen readers (large a11y string surface). Evidence: `namespace fullscreen.accessibility.* (242 keys)`. — fullscreen.accessibility 242 + accessibility_dom 97 keys.
- **Contrast and design checks** (`accessibility.contrast`, P2, static): Contrast checking and design-quality suggestions in the linter. Evidence: `i18n key: design_linter.contrast_setting.description = "Check color contrast"`.
- **Accessible slides and sites** (`accessibility.slides_sites`, P2, static): A11y labels in Slides and semantic HTML tag mapping/checks in Sites. Evidence: `i18n key: slides.a11y.node_type.slide = "Slide {orderNum}"`.

## i18n

Editor localization surface.

- **Editor UI localization** (`i18n.editor_locales`, P2, static): Editor ships large translated string bundles; translation-issue reporting from the app. Evidence: `namespace fullscreen.* (2055 keys)`. — Recovered English bundle has 33,116 keys / 451 namespaces.

## Products found in the recovered editor (beyond "Figma Design")

The recovered i18n/JS surface shows Figma is now a suite. These product surfaces are
registered inside the same editor bundle and are represented in `features.jsonl`:

- **Figma Design** — the core editor (canvas, layout, components, variables, prototyping).
- **Figma Make** (`figmake`, 2,460 strings) — prompt-to-prototype/app, plus **Make Local**
  (`make_local`, 577 strings) for running Make projects in a local working directory with a
  browser preview + code components (desktop bridge `makeLocalBrowserPreview:*`).
- **Figma Sites** (`sites`, 1,285 strings) — responsive site building with breakpoints, CMS,
  code components, a lint pass and semantic-HTML accessibility tags.
- **Figma Slides** (`slides`, 605 strings) — slide editor, speaker notes, charts, PDF export.
- **Figma Buzz** (`buzz`/`cooper`, ~600 strings) — marketing/brand asset production with an
  approvals workflow; "Send to Figma Buzz" from Design.
- **Figma Draw** — illustration-oriented mode/editor (Design ↔ Draw switch).
- **FigJam** (`whiteboard`, 1,081 strings) — whiteboard, widgets, stamps/tables.
- **Figma Motion** (`motion`, 465 strings) — keyframe timeline, animation presets, audio clips.
- **Figma agent / FigSpec / Weave** — AI agent chat, technical-spec drafting from
  Figma/GitHub/Jira/Slack connectors, and org-managed AI models.
- **Dev Mode MCP server** — shipped inside the desktop app (`lazy/external/codegen_mcp_server.js`,
  canonical docs `https://developers.figma.com/docs/figma-mcp-server/`).

Caveat: the i18n bundle is present in the cache regardless of the user's plan/entitlements;
a product surface being listed means the code ships, not that this user has access to it.

