# Pen.app 1.2.15 capabilities vs. VOO Design — gap assessment

Method: Pen side from [`features.jsonl`](./features.jsonl) (static bundle evidence). VOO side is a
**read-only static grep** of `src/` + `electron/` in the working tree (which contains large
uncommitted work — presence of code proves intent/implementation exists, not that the feature is
finished or reachable). Every verdict carries the search pattern and the files found, so it can be
re-checked.

Machine log: [`voo-audit.sh`](./voo-audit.sh) → [`voo-audit-output.txt`](./voo-audit-output.txt)
(file counts per pattern; run from the repo root).

Verdicts:

| verdict | meaning |
|---|---|
| **present** | a concrete implementation module/handler for the capability was found |
| **partial** | something related exists but is narrower than Pen's (e.g. only color variables, only one direction) |
| **absent** | targeted search found no implementation; stated pattern included |
| **unknown** | cannot decide statically (generated/vendored/runtime-only) |

---

## A. Big-ticket surfaces (the ones that matter for parity)

| # | Pen capability | VOO verdict | Search pattern | Files found (evidence) |
|---|---|---|---|---|
| A1 | **Auto layout (flex)**: direction, gap, padding, justify, align, add/remove | **present** | `autoLayout` | `src/canvas/editor/scene_auto_layout.js`, `src/canvas/components/editor_properties/auto_layout_section.jsx`, `auto_layout_child_section.jsx`, `src/canvas/undo_contracts_workflow.js` |
| A2 | **Hug / fill sizing** (`fit_content`/`fill_container`) | **present** | `fit_content|fill_container|"hug"|layoutWidth` | i18n `editor.autoLayout.hug/fill`, `auto_layout_section.jsx` (width/height mode), `html_grid_layout.js` |
| A3 | **Absolute position inside layout** | **present** | `layoutPosition|"absolute"` inside auto-layout section | i18n `editor.autoLayout.absolute` / `flow`, `auto_layout_child_section.jsx` |
| A4 | **CSS grid layout** (Pen does *not* have this; VOO does) | **present in VOO only** | `grid.*layout`, `html_grid_layout` | `src/canvas/editor/html_grid_layout.js` → VOO advantage, not a gap |
| A5 | **Components + instances** (`reusable`/`ref`, overrides) | **present** | `createComponentPage|component_extract|instanceOfNode|detachInstance` | `src/canvas/editor/component_extract.js` (`detachInstance`), `src/canvas/components/editor-instance-layer-model.js`, `src/canvas/editor/editor_export_instances.js` |
| A6 | Nested descendant overrides / instance paths | **partial** | `descendants|instance.*override|component.*override` | instance layer model exists; no explicit `descendants`-style override map found → needs runtime check |
| A7 | Component slots (`slot: [recommendedIds]`) | **absent** | `componentSlot` | 0 hits; `slot` hits are DOM/React slots in unrelated files |
| A8 | Component variants / component properties | **absent** (both apps) | `variant` in `src/canvas/{editor,store}` | only unrelated "variant" prose in algorithm comments → neither app has Figma-style variants |
| A9 | **Variables**: color | **present (partial)** | `colorVariables` | `src/canvas/editor/scene_color_variables.js` (create/bind/update/delete, `fillVariableId`/`strokeVariableId`), `src/canvas/components/editor_properties/color_variables_section.jsx` |
| A10 | Variables: number / string / boolean | **absent** | `numberVariable|stringVariable|booleanVariable` | 0 hits; no generic variable collection model |
| A11 | **Multi-axis theming / light-dark modes on variables** | **absent** | `themeMode|themes\b` in `src/canvas` | only app-level theme (`settings.js`, `agent_persona.js` name themes); no per-variable `{value, theme}` model |
| A12 | **Named color/text/effect styles** | **absent** (both apps) | `styleLibrary|sharedStyles|textStyles|effectStyles` | 0 hits |
| A13 | **Vector editing**: paths, anchors, bezier | **present** | `anchor|bezier|penTool|path_edit` (97 files) | `src/canvas/editor/` path modules (`path_boolean_engine.js`, `path_expand_stroke.js`, `editor_path_menu_items.jsx`, `editor_pen_subbar.jsx`) |
| A14 | **Boolean ops** union/subtract/intersect/exclude | **present** | `destructiveBoolean|BOOLEAN_OPERATIONS` | `src/canvas/editor/editor_engine_node_ops.js`, `scene_model_node_builders.js`, `path_boolean_engine.js`, UI `combine_section.jsx` |
| A15 | Selection combine modes (replace/add/subtract/intersect) | **present** | `pixel_selection_wand|selection_api_modify` | `src/canvas/editor/selection_api_modify.js`, `selection_mode_buttons.jsx` |
| A16 | Stroke model (width, cap, join, alignment) | **present** | `strokeWidth|strokeLinecap|strokeLinejoin` | editor paint/stroke modules (`editor_paint_stroke.js`, `editor_properties/` stroke controls) |
| A17 | **SVG import as editable paths** | **present** | `svg` (88 files) | `src/canvas/editor/editor_svg.js`, SVG import/measure modules |
| A18 | Raster **vectorize** (image → paths) | **partial** | `vectorize` | 1 hit: `src/canvas/components/editor_contextual_taskbar.jsx` (intent only); no tracer implementation found → likely model-backed/none |
| A19 | **Export: PNG/JPEG/WebP/PDF** | **present** | `editor_export_dialog|exportPng|exportPdf` | `src/canvas/components/editor_export_dialog.jsx` formats `png, jpeg, webp, svg, pdf, psd` |
| A20 | **Export: SVG** (Pen lacks it) | **present in VOO only** | `exportSvg|editor_svg` | `editor_export_dialog.jsx` line 12 `["svg","editor.exportSvg"]`, `src/canvas/editor/editor_svg.js` |
| A21 | **Export: HTML / HTML+Tailwind** (design→code) | **partial** | `documentToHtml|html_export|tailwind` | `src/canvas/editor/editor_html_export.js` (`documentToHtml`), `editor_html_clipboard.js`; Tailwind-specific variant not found (only the bundled Pen tailwind guide references it) |
| A22 | **Snapshot export/import** (self-contained .zip + URL) | **absent/unknown** | `snapshot` (75 files) | hits are undo/state/render-cache snapshots, not document archives → no portable `.voo` bundle with assets found |
| A23 | **Figma import** | **present** | `figma` | `src/canvas/figma/` (19 files incl. `figma_import_worker.js`, `fig-schema-data.js`, glyph outline) |
| A24 | Web-page import (live page → nodes) | **partial** | `webview|browserNode|import.*web` | no browser-node/web-import module found; VOO has HTML import measure (`html_import_measure.js`, `html_import_style.js`) but no live-page capture |
| A25 | PSD import/export (Pen has neither) | **present in VOO only** | `psd` (21 files) | `src/canvas/store/psd_to_voo.js`, `src/canvas/editor/psd_export.js`, `ag-psd` dependency |
| A26 | **Agent: on-canvas chat that edits the doc** | **present** | `canvas_agent|agent_panel|chat_stream` | `src/canvas/agent/{canvas_agent,canvas_tools,chat_stream,cli_agent_step}.js`, `src/canvas/components/canvas_agent_panel.jsx` |
| A27 | Agent `execute`-style JS document API | **partial** | `canvas_tools|AGENT_TOOL|command_table` | `canvas_tools.js` exposes only a small tool set (`generate_image` + one more); VOO drives edits via a `command_table` (`src/canvas/editor/command_table/`) not a public JS sandbox |
| A28 | Agent screenshot verification loop | **unknown** | `screenshot|takeScreenshot` in agent | no agent tool found; likely host-bridge only |
| A29 | **Multi-provider model support** | **present (broader than Pen)** | `providers/` | `src/shared/providers/*` (302, dashscope, deepseek, openrouter, google, volcengine, zhipu, ark, CLI providers), `src/shared/model-routes.js` |
| A30 | **MCP server** (app exposes canvas to external agents) | **present** | `mcp` | `electron/agent_mcp_server.js` (MCP `list_tools`/`call_tool`), `src/shared/mcp_client.js`, `electron/antigravity_mcp_config.js` |
| A31 | One-click MCP install into Claude Code/Codex/Gemini/Cursor/… | **partial** | `mcp` + `cli-agents` | `src/shared/cli-agents.js`, `electron/claude_agent_session.js`, `codex_agent_session.js`; no bundle of installer targets like Pen's `getSupportedIntegrations()` |
| A32 | **Skills (SKILL.md packages)** | **partial** | `SKILL.md|skill_package|skills` | `src/shared/skill_package_limits.js`, `src/canvas/components/node_store_skill_catalog.js`; no bundled design skill with 15 guides like `pen-dev` |
| A33 | Agent **cursor** on canvas (label/size) | **absent** | `agentCursor|agent_cursor` | 0 hits |
| A34 | **Parallel agents / subagents** | **absent** | `parallel.*agent|subagent` | 0 hits |
| A35 | Agent sessions/history | **present** | `session_history|chat_sessions` | `src/canvas/agent/session_history.js`, `electron/main.cjs` chat session IPC |
| A36 | **Design→code export** (dialog + settings + workspace folder) | **partial** | `exportCode|codeExport|generateCode|designToCode` | no codegen dialog; `exportHtml`/`copy HTML` exist, otherwise codegen is delegated to CLI agents |
| A37 | VS Code / Cursor extension host + Design Mode | **absent** | `vscode|cursor:` | 0 hits in `src`/`electron` (VOO is Electron-only) |
| A38 | **Browser nodes** (live web page on canvas) | **absent** | `browserNode|webview|browser_node` | 0 hits |
| A39 | **Script nodes** (JS → generated children) | **absent** | `scriptNode|type: ?"script"` | only HTML import scripts; no procedural node type |
| A40 | **WebGL shader fills** (user .glsl fills + uniforms) | **partial/absent** | `glsl|shader` | GLSL only for internal image filters (`gl_spatial.js`, `gl_spatial_shaders.js`, `spatial_filter.js`); no user-authored shader fill, no `@time/@mouse/@sdf/@backdrop` uniform model |
| A41 | **Mesh gradient** fill | **absent** | `meshGradient|mesh_gradient` | 0 hits (VOO has `diamond_gradient.js` instead) |
| A42 | Gradient fills (linear/radial/angular) | **present** | `gradient_fill|GradientStopsBar` | `src/canvas/color_picker/gradient_fill.js`, `GradientStopsBar.jsx` |
| A43 | **Blend modes** | **present** | `blendMode|blend_math` | `src/canvas/editor/blend_math.js` (incl. subtract/divide/hard-mix variants) |
| A44 | Blur + background blur + inner/outer shadow | **present** | `backgroundBlur|layerBlur|dropShadow|innerShadow` | `src/canvas/components/editor_properties/effect_controls.jsx` |
| A45 | **Comments** (canvas threads, resolve) | **partial** | `comment` | `src/shared/i18n/core-en.js` `node.comment.*`, `canvas.addComment`; **no thread/resolve/marker model found** → comment *notes* exist, collaborative comment threads do not |
| A46 | **Share links** (snapshot publishing) | **partial** | `share` (222 files) | `src/shared/i18n/extended-en.js` `share.share`, `share.collabLink`, `share.copied`; also `community.publish*`; the sharing transport is a collab link, not Pen's snapshot-with-assets model |
| A47 | **Live multiplayer / presence** | **present** | `collab|presence` | `src/canvas/collab/` (12 files: `presence.js`, `room.js`, `webrtc_transport.js`, `stroke_bus.js`, `session-lifecycle.js`) |
| A48 | **Presentation/slides** | **present (stronger)** | `presentation` | `src/canvas/presentation/` incl. `presentation-pdf.js`, `presentation-pptx*.js` (PPTX export — Pen has none) |
| A49 | **Motion / animation timeline** (Pen has none) | **present in VOO only** | `keyframe|timeline` | `editor-motion-timeline` target in `use_editor_shortcuts.js`, `editor_panel_layout.js` (`motionTimelineHeight`), `icons_motion.jsx` → VOO advantage |
| A50 | **i18n / localization** (Pen has none) | **present in VOO only** | `i18n` (116 files) | `src/shared/i18n/*` en/zh + section files → VOO advantage |
| A51 | Keyboard-shortcut catalog + dialog | **present** | `shortcut` | `src/shared/editor-shortcut-catalog.js`, `src/canvas/use_editor_shortcuts.js`, `settings_shortcuts.jsx` |
| A52 | Pixel grid / snap-to-objects | **present** | `pixelGrid|snap` | editor config/panel modules (spot-check: `src/canvas/editor/` grid & snap state) |
| A53 | Align + distribute | **present** | `distribute` | i18n `editor.props.distribute.horizontal/vertical/requiresThree` + align commands |
| A54 | Performance: WASM/Skia rendering core | **present** | `canvaskit|wasm` | `canvaskit-wasm` + `onnxruntime-web` deps, `src/shared/editor-modules.js`, `src/canvas/module_loader.js` |
| A55 | Local-first document store + autosave | **present** | `autosave|voo_format` | `src/canvas/components/editor_hooks/use_editor_autosave.js`, `electron/voo_format.js` |
| A56 | Accessibility (ARIA) | **present** | `aria-` (140 files) | broad; no dedicated a11y audit panel in either app |
| A57 | Onboarding walkthrough | **present** | `onboarding|welcome` | `src/canvas/components/onboarding/`, `src/shared/i18n/welcome-*.js` |
| A58 | **Bundled template/design-system documents** | **partial/unknown** | `templates|starter` | `welcome_dashboard.jsx`, `node_store_skill_catalog.js`; no `out/data`-style bundled `.pen`/`.voo` libraries found |

---

## B. Where VOO is clearly ahead (not gaps — don't regress)

1. **SVG export** (Pen: absent) — `editor_export_dialog.jsx` `["svg", …]`.
2. **PSD import + export** (Pen: absent) — `psd_to_voo.js`, `psd_export.js`, `ag-psd`.
3. **PPTX + PDF presentation export** (Pen: presentation mode only) — `presentation-pptx*.js`, `presentation-pdf.js`.
4. **Motion timeline / keyframes** (Pen: none) — `editor-motion-timeline`.
5. **Grid layout** (Pen: flex only) — `html_grid_layout.js`.
6. **i18n EN/ZH** (Pen: English literals only) — `src/shared/i18n/`.
7. **Provider breadth** incl. Chinese clouds, 3D (Hunyuan3D), video/audio (Jimeng, Volcengine, DashScope), local models (`onnxruntime-web`) — `src/shared/providers/`.
8. **Local AI features** (matting/outpaint/upscale/retouch) — `matting_transform.js`, `outpaint_*`, `upscale_tiling.js`, `portrait_retouch.js`.

## C. Where Pen is structurally different (not a feature checklist item)

Pen is built around **one agent-facing document API with a rich, self-describing schema** shipped as
human-readable instructions (`.pen` schema + `execute` API + 15 design guides + `get_style`
archetypes). VOO's equivalent surface is split between a command table, an MCP bridge and a
free-form agent chat. The *capabilities* overlap a lot; the **contract for an external agent** is the
real gap (see D2, D3).

---

## D. Top gaps worth closing (ranked)

**D1. Document variables beyond color + theming modes.**
Pen: 4 variable types + multi-axis themes (`{value, theme}`), `$name` binding on every property.
VOO: `colorVariables` only, no number/string/boolean variables, no theme axes.
Why it matters: this is the token layer that makes dark mode, spacing scales and multi-brand docs
possible; it also blocks a lot of agent workflow (Pen's `SetVariables`).
Files to extend: `src/canvas/editor/scene_color_variables.js`,
`src/canvas/editor/scene_model_serialization.js`, `editor_properties/color_variables_section.jsx`.

**D2. A single, documented document-mutation API for agents (Pen's `execute`).**
Pen: one tool, ~12 functions, transactional rollback, `Get` visitors with `ctx.bounds/problems`,
`TakeScreenshot`, `Export`, `FindEmptySpace` — plus a 227-line schema doc and 15 guides that the
agent is told to read first.
VOO: `src/canvas/agent/canvas_tools.js` exposes ~2 tools; richer edits go through the internal
`command_table` and MCP `list_tools`/`call_tool` host bridge.
Gap: a stable, documented tool contract + schema doc + screenshots, not raw capability.

**D3. Skills / design guides shipped with the app.**
Pen ships `pen-dev` SKILL.md with 15 topic guides (components, design-system, table, slides, web-app,
mobile-app, landing-page, tailwind, code) and a `get_style` archetype library with 20+ art directions.
VOO has a skill catalog + package limits but no bundled design skill. High leverage, low risk.

**D4. Snapshot export/import (portable document bundle).**
Pen: `.zip` of the document + referenced assets, importable from a URL, plus a `share` upload variant.
VOO: save/autosave only; sharing is a live collab link. Needed for reliable handoff/bug reports.

**D5. Component slots** (`slot: [recommendedComponentIds]`) — makes component libraries composable
inside agent-generated screens; VOO has instances but no slot concept.

**D6. HTML+Tailwind export and a design-to-code dialog.**
Pen: `html-tailwind` export, "Export Design to Code" dialog with code-export settings and a workspace
folder, and a full `guide/code.md` codegen playbook.
VOO: `documentToHtml` (plain HTML/CSS) + copy-HTML; no Tailwind target, no codegen dialog.

**D7. Browser nodes (live web page on canvas).**
Pen: `browser` node type + CDP driving + browser sidebar + whiteboard guide; enables research and
"copy this site" workflows. VOO: no browser node; only HTML import.

**D8. User-authored shader fills.**
Pen: `.glsl` fill type with annotated uniforms (`@time/@mouse/@sdf/@backdrop`) + ~40 bundled shaders +
preview gallery. VOO: GLSL only as internal image filters. Big visual differentiator, moderate effort
(VOO already has WebGL infrastructure).

**D9. Script nodes (procedural generation).**
Pen: `script` node = JS file + typed `@input` params → children, deterministic RNG, ~10 bundled
examples. VOO: none. Cheap to add on top of VOO's command/serialization model.

**D10. Comments as threads + agent-visible review loop.**
Pen: canvas comment tool, threads, resolve, markers, owner-only status changes.
VOO: comment *notes* (`node.comment.*` i18n, `canvas.addComment`) but no thread/resolve/marker model.

**Honorable mentions (smaller but cheap):** agent cursor on canvas (D-side visible automation),
parallel/subagents, mesh-gradient fill, live-page import, `find_empty_space` equivalent for agent
placement, keyboard-shortcut dialog parity (VOO already has a catalog), and an "All Google fonts"
font picker guarantee.
