# Figma vs VOO Design — capability gaps (rough, evidence-backed)

Scope: compare the recovered Figma capability inventory (`analysis/figma/features.jsonl`,
145 rows) against the current VOO Design working tree.

Method (read-only, VOO tree untouched; it contains large uncommitted work, so treat all
verdicts as a point-in-time guess):

```bash
rg -il --glob '!node_modules' --glob '!analysis' --glob '!tests/**' \
      --glob '!package-lock.json' -e '<pattern>' src electron
```

Raw hit lists: `/tmp/voo_search.json`, `/tmp/voo_search2.json`, `/tmp/voo_impl.json`,
`/tmp/voo_search3.json` (all produced during this analysis; see `rea/COMMANDS.md` §7).
Verdicts: `present` (implementation files + tests/UI found), `partial` (some machinery or
import/schema support, no complete user flow confirmed), `absent` (searched, nothing
substantive), `unknown` (searched but results inconclusive without runtime/testing).

**Big caveat:** VOO's source tree is actively changing and the tests directory is large;
"absent" here means "no implementation found with the stated pattern", not "product
decision". Anything marked unknown should be re-checked by the VOO inventory owner.

## Top 10 gaps I would prioritize (from this comparison)

1. **Comments** — Figma has first-class comment pins/threads/mentions/notifications
   (`comments` namespace, 180 keys; comment tool). VOO: `rg comment` finds only i18n strings
   and a zip-directory helper — **absent**.
2. **Dev Mode inspect + codegen + Code Connect** — Figma: inspect panel (properties 45 +
   typography 60 keys), language-aware code blocks, Code Connect component browser (325 keys),
   MCP server. VOO: has its own agent MCP server (`electron/agent_mcp_server.js`) but **no
   design-inspect/codegen UI** → **partial/absent**. Biggest product-surface gap for the
   "design → code handoff" story.
3. **Figma Make (prompt → working app) + Make Local browser preview** — Figma ships a whole
   product (`figmake` 2,460 keys; `make_local` 577 keys; desktop browser-preview bridge with
   element picker, HMR, code components). VOO has AI generation/agents but no local
   browser-preview bridge for generated apps → **partial** at best.
4. **Variables modes/collections + binding** — VOO has color variables
   (`scene_color_variables.js`, `color_variables_section.jsx`) but no number/string/boolean
   variables, collections or modes found → **partial** (Figma rows `variables.*`).
5. **Auto layout depth** — VOO has `scene_auto_layout.js` + property sections, but no evidence
   of wrap, min/max sizing, absolute children, or multi-stack suggestions → **partial**.
6. **Components/variants authoring** — VOO has `src/canvas/figma/figma-instances.js` and
   `design_systems.js`; Figma-level component sets, variants and component properties
   (boolean/text/instance-swap, slots, library publish/updates) were not confirmed →
   **partial/unknown**.
7. **Smart Animate + Motion timeline** — Figma has Smart Animate (7 `SMART_ANIMATE` tokens in
   the JS bundle) and a full Figma Motion keyframe timeline/audio/presets. VOO: `rg
   'smart.?anim'` = **0 files**; animation machinery exists but not Figma-style smart animate
   → **absent** for smart animate, **unknown** for a motion timeline.
8. **Prototyping interactions/transitions** — VOO has presentation + PPTX/PDF export
   (`presentation-pptx*.js`, `presentation-pdf.js`) but interactions/flows/overlays were not
   confirmed → **partial**.
9. **Plugin + widget ecosystem / Community** — Figma: plugin runtime, dev plugins/hot reload,
   widgets, Community (2,418 strings). VOO: `computer_use_plugin.js` only, no plugin API →
   **absent**.
10. **Multiplayer branch reviews / version-control workflow** — Figma has branching (119 keys),
    branch reviews/merge modal, activity log (925 keys). VOO has local history/versions
    (`layout_versions.js`, `editor_history_panel.jsx`) and its own realtime collab session,
    but no branch/merge/review workflow → **partial**.

## Detailed comparison

### A. Core editor (table stakes)

| Figma capability | Figma evidence (features.jsonl id) | VOO verdict | search pattern → files found |
|---|---|---|---|
| Infinite canvas, zoom/pan | `canvas.infinite_canvas` | present | `canvas\|zoomTo\|viewport` → `src/canvas/editor/editor_viewport.js`, `use_skia_page.js` |
| Frames, groups, pages | `canvas.groups_sections` | present | `scene_model_groups\|tab_bar` → `src/canvas/editor/scene_model_groups.js`, `src/canvas/components/canvas_tab_bar.jsx` |
| Auto layout / stacks | `layout.auto_layout` | partial | `autoLayout\|auto_layout` → 12 impl files incl. `src/canvas/editor/scene_auto_layout.js`, `editor_properties/auto_layout_section.jsx`, `auto_layout_child_section.jsx`; no wrap/min-max evidence |
| Constraints | `selection.constraints` | present | `constraint` → `editor/content_constraints.js`, `editor/axis_constraint.js` |
| Align / distribute | `selection.align_distribute` | present | `align\|distribute` → `tests/unit/align_section.test.jsx`, `distribute_spacing.test.js`, editor props |
| Shapes / vector tools / pen | `tools.*`, `vector.edit_modes` | present | `vector\|pathData\|bezier\|pen` → `editor_pen.js`, `editor_pen_math.js`, `editor_pen_edit.js`, `figma-vector.js`, `path_offset.js` |
| Boolean operations | `vector.boolean_ops` | present | `booleanOperation\|union\|subtract\|intersect` → `editor/editor_engine_node_ops.js`, `path_boolean_topological_invariants.test.js`, `scene_model_groups.js` |
| Text engine + typography | `text.typography_settings` | present | `fontFamily\|fontSize\|textAlign\|lineHeight` → 54 files incl. `figma/figma-text.js`, `text_on_path.test.js`, `figma-glyph-outline.test.js` |
| Fonts / missing fonts | `text.fonts_missing` | present (likely) | `font` → 169 files incl. font loading & text tests |
| Effects (shadow/blur) | `effects.shadows`, `effects.blur` | present | `dropShadow\|innerShadow\|blur` → `selection_effects_modify.js`, `inner_shadow_spread.test.js`, `figma-effects.test.js`, 114 files |
| Shader effects | `effects.shader_effects` | unknown | `shader\|noise\|texture` → 73 files but mostly color picker/blend code; no editor shader-effects panel confirmed |
| Masks | `masks.mask_layers`, `masks.mask_types` | partial | `mask` → 150 files incl. `editor/editor_mask_brush.js`, `doc_ops_clipping.js`, `psd_import.js` (raster mask brush + clipping confirmed; alpha/luminance/vector mask modes not confirmed) |
| Image fill / crop / adjust | `image.place_image_video`, `image.crop`, `image.adjustments` | present | `imageFill\|imagePattern\|crop` → `editor/editor_crop.js`, `crop_geometry.js`, `components/image_editor.jsx`, `use_editor_raster.js` |
| Export PNG/SVG/PDF/PPTX | `export.*` | present | `export(Png|Svg|Pdf|Image)\|toBlob` → `canvas/download.js`, `shared/media-export.js`, `presentation/presentation-pptx*.js`, `presentation-pdf.js` |
| Import SVG / Figma files | `import.svg_pdf`, `import.figma_file_open` | partial (no Sketch) | `import(Svg|Image|File)\|figma-to-voo` → `canvas/figma/figma_import_client.js`, `figma_import_worker.js`, `editor/editor_svg_import.js`, `html_import_svg.js`; `sketch` = 44 loose hits, no Sketch importer module |
| Import CSV | `import.csv` | absent | `csv` → no importer found |
| Find/replace, rulers, quick actions | `canvas.find_replace`, `canvas.rulers_guides`, `canvas.quick_actions` | partial | `find.?replace\|ruler\|quick.?action` → no dedicated modules; shortcut modal + context menus exist |
| Layout grids | `layout.layout_grids` | unknown | `layoutGrid\|gridStyle` → only `icons.jsx`, `welcome_dashboard.jsx`; general `grid` hits are color-picker grids |
| Desktop tabs/multi-window | `file.tabs`, `file.multi_window` | partial | `tab.?bar\|BrowserWindow` → `canvas_tab_bar.jsx` is in-app canvas tabs; `electron/main.cjs` manages windows; no file-tab model found |
| Desktop version history/branch/merge | `file.version_history`, `file.branching` | partial → absent for branching | `version.?history\|snapshot` → 87 files incl. `layout_versions.js`, `editor_history_panel.jsx`; `branch\|merge` hits are file-write services, no branch/merge UI |

### B. Design systems

| Figma capability | Figma evidence id | VOO verdict | search pattern → files found |
|---|---|---|---|
| Components / instances | `components.components_instances` | partial/unknown | `componentInstance\|mainComponent\|instance` → 107 files, but Figma-adjacent logic is in `src/canvas/figma/figma-instances.js` (import mapping); no component authoring engine confirmed |
| Variants / component properties | `components.variants_properties` | unknown | `variant\|componentSet` → 30 files, mostly tests/i18n/badge components; no component-set authoring found |
| Component slots | `components.slots` | absent | `slot` → no design-component slot implementation found |
| Libraries / publishing / updates | `components.libraries`, `styles.library_subscriptions` | partial | `library\|publish.*style\|design_system` → `src/canvas/design_systems.js` (260 lines), `store/asset_library.js`; no publish/update flow confirmed |
| Variables (collections/modes/binding) | `variables.*` | partial | `variable` → 21 files; `scene_color_variables.js`, `color_variables_section.jsx` (color variables only); no modes/collections |
| Styles (paint/text/effect/grid) | `styles.paint_text_effect_styles` | partial | `paintStyle\|textStyle\|effectStyle\|styleId` → `figma-to-voo.js`, `figma-text.js`, `design_systems.js`; shared-style authoring not confirmed |
| UI kits / presets / design-system bundles | `styles.presets_ui_kits`, `styles.library_subscriptions` | absent/unknown | `preset\|ui.?kit\|bundle` → no design-system bundle support found |

### C. Prototyping / motion / presentations

| Figma capability | Figma evidence id | VOO verdict | search pattern → files found |
|---|---|---|---|
| Prototype interactions/flows/overlays | `prototyping.*` | partial/unknown | `prototype\|interaction\|flowStartingPoint` → 26 impl files but hits are broad (`bridge.js`, `tool_families.js`, `editor_transform_api.js`); no interaction/flow model found |
| Smart Animate | `motion.smart_animate` | absent | `smart.?anim` → **0 files** |
| Motion timeline / keyframes | `motion.timeline`, `motion.keyframes` | unknown/partial | `keyframe\|timeline\|easing` → 48 files; mostly animation helpers/format code (`electron/voo_format.js`, `editor_panel_layout.js`); no editor timeline UI module confirmed |
| Present mode | `prototyping.present`, `presentation.spotlight` | partial | `presentation\|present\b` → `src/canvas/presentation/*` (pptx, pdf, history, i18n) — presentation/export present, in-file prototype playback not confirmed |
| Slides editor (Figma Slides) | `slides.*` | partial (different product) | `\\bslides?\\b\|deck` → 46 files incl. `presentation/presentation-pptx.js`; VOO produces/export decks but no Figma-Slides-style editing surface confirmed |

### D. AI / agent surfaces

| Figma capability | Figma evidence id | VOO verdict | search pattern → files found |
|---|---|---|---|
| AI agent that edits the canvas | `ai.assistant_generate_variations`, `file.figma_agent` | **present (strong)** | `agent\|llm\|prompt` → 211 files; `electron/agent_mcp_server.js`, `agent_tool_turn.js`, `codex_agent_bridge.js`, `claude_agent_session.js`, `antigravity_agent_session.js`, `src/canvas/agent/*` |
| MCP server for external clients | `agent.devmode_mcp_server`, `agent.mcp_client_manager` | **present (own protocol)** | `mcp` → 18 files: `electron/agent_mcp_server.js`, `antigravity_mcp_config.js`, `src/shared/mcp_client.js`; not compatible with Figma Dev Mode MCP (different tool set) |
| AI image generation | `image.ai_generate`, `image.ai_edit` | **present** | `image.?gen\|inpaint\|outpaint` → `src/canvas/agent/image_generation.js`, `store/editor_generated_materializer.js`, `agent/canvas_tools.js` |
| Background removal | `image.background_removal` | partial/unknown | `backgroundRemoval\|removeBackground\|matte` → `editor/matte_refine.js`, `local_ai_repair.js`; no one-click UI confirmed |
| AI text rewrite / translate | `ai.text_rewrite`, `ai.translate` | unknown (agent can prompt it) | `translate\|rewrite` → no dedicated text-tool UI; agent tools could cover it |
| AI content fill / design linter | `ai.content_fill`, `ai.design_linter` | absent/unknown | `lint\|contrast\|suggestion` → 58 loose hits (`agent_persona.js`, icons); no linter surface |
| Figma Make / Sites / Buzz / FigSpec | `ai.figma_make`, `file.figma_sites`, `file.figma_buzz`, `ai.figspec` | absent as products (VOO has generation targets) | `publish\|deploy\|website\|domain` → 51 loose hits; `src/canvas/generation_target_defaults.js` exists but no site builder/publishing, no Buzz/FigSpec equivalents |

### E. Collaboration / comments / dev handoff / plugins

| Figma capability | Figma evidence id | VOO verdict | search pattern → files found |
|---|---|---|---|
| Multiplayer editing + presence | `collaboration.multiplayer`, `collaboration.follow_presenter` | **present** | `WebSocket\|ws_ipc\|yjs\|presence` → `src/canvas/collab/session.js` (551 lines), `webrtc_transport.js`, `protocol.js`, `electron/ws_ipc_adapter.js` |
| Follow/presenter mode, spotlight | `collaboration.follow_presenter`, `presentation.spotlight` | unknown | `presence\|cursor\|awareness` → collab session owns peers; spotlight/follow not confirmed |
| Cursor chat / voice calls | `collaboration.cursor_chat`, `collaboration.voice` | absent | `voice\|getUserMedia\|microphone` → 34 loose hits (workspace_manager, MCP configs), no voice/cursor-chat UI |
| Comments | `comments.threads`, `comments.notifications` | **absent** | `comment` → 7 files, all i18n or `fig-zip-directory.js`; no comment model/UI |
| Sharing / permissions | `collaboration.share_permissions` | partial | `share\|permission` → `src/canvas/store/share_actions.js`, `auth_client.js`, `design_store.js`; link/permission model unclear |
| Version history / branching / reviews | `file.version_history`, `collaboration.branching_reviews` | partial (history) / absent (branch/merge) | `version.?history\|snapshot` → 87 files incl. `layout_versions.js`; `branch\|merge` → file-write services only |
| Activity log | `collaboration.activity_log` | absent/unknown | `activity.?log\|audit` → no event-log store found |
| Dev Mode inspect panel | `devmode.inspect_panel` | **absent** | `inspect.?panel\|dev.?mode` → only `electron/codex_connection.js`, `codex_agent_bridge.js` (agent MCP, not inspect UI) |
| Codegen / Code Connect | `devmode.codegen`, `devmode.code_connect` | absent | `codegen\|code.?connect` → 0–2 loose hits; no Code Connect support |
| Annotations / measurements / dev resources | `devmode.annotations`, `devmode.units` | partial | `annotation` → `src/canvas/annotations/*` (canvas annotations exist, likely image/text annotations, not Dev Mode handoff) |
| Plugins / widgets / Community | `plugins.*` | **absent** | `figma\.plugin\|registerPlugin\|runPlugin` → 3 files, only `computer_use_plugin.js` + i18n; no plugin runtime |
| Desktop MCP/agent management | `agent.desktop_agent`, `agent.make_local`-adjacent | present (own impl) | `mcp\|agent` → `electron/agent_mcp_server.js`, `local_backend_bridge.js`; browser-preview bridge (Figma's `makeLocalBrowserPreview:*`) **absent** |

### F. Desktop shell / settings / misc

| Figma capability | Figma evidence id | VOO verdict | search pattern → files found |
|---|---|---|---|
| File browser / cloud file model | `file.cloud_documents` | partial (local-first) | `workspace_storage\|file browser\|fileBrowser` → `src/services/workspace_storage.js`, `drivers/{electron,web_idb,web_fsa}_driver.js`; local/workspace storage rather than cloud file browser |
| Desktop preferences (scale, color mgmt, tray, haptics) | `settings.*` | partial/unknown | `interfaceScale\|colorManagement\|tray\|haptic` → no matches in src/electron for these desktop settings |
| Auto-update + error tabs + logs | `file.auto_update`, `file.offline_recovery` | unknown/absent | `autoUpdater\|update.*available` → not found; `electron/main.cjs` window code inspected indirectly |
| Keyboard shortcuts reference/customization | `shortcuts.panel` | present | `shortcut` → `src/canvas/use_editor_shortcuts.js`, `editor/editor_shortcuts.js`, `shared/editor-shortcut-catalog.js`, `components/shortcut_reference_modal.jsx` |
| i18n (UI translation) | `i18n.editor_locales` | present | `i18n\|locale\|translation` → 149 files; `src/shared/i18n/*`, `use_i18n.js` |
| Accessibility (screen reader, contrast) | `accessibility.*` | partial | `aria-\|accessibility` → 140 files with aria roles/labels; screen-reader canvas announcements and contrast linter not confirmed |
| Onboarding / welcome | `onboarding.*` | present | `onboarding\|welcome` → `src/canvas/components/welcome_dashboard.jsx`, onboarding tests |
| Performance HUD / memory controls | `performance.perf_hud` | unknown/absent | `performance\|memory` → 28 loose hits (storage/perf tests); no HUD found |
| Multiplayer notifications (FCM) | `collaboration.notifications` | unknown | `notification` → settings/welcome i18n; no push notification service found |

## Reading the verdicts

- **VOO is agent-first, not document-cloud-first.** Its strongest areas vs Figma are AI
  agents/MCP and generation (many agent bridges + `agent_mcp_server.js`), and its collab
  session is real (WebRTC + protocol + 551-line state machine) — but Figma's *product*
  surfaces around files (comments, Dev Mode, plugin ecosystem) are largely missing.
- **Figma's biggest moat in this comparison is the handoff loop**: variables → Dev Mode
  inspect → codegen → Code Connect → MCP. VOO has the MCP/agent half but lacks the inspect
  half, so the loop isn't closed.
- **Do not over-read "absent"**: VOO's tree is mid-refactor (many agent-runtime files are
  currently deleted in `git status`). Re-run the patterns after the branch settles before
  prioritizing implementation.
