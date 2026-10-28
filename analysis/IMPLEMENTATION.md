# VOO Design — implementation record for this cycle (2026-10-22)

Three gap-closing features were implemented in parallel by disjoint workers, integrated and verified
by the Lead. Everything below is in the current working tree (uncommitted, like the rest of the
in-flight work); no git operations were performed, no dependencies added.

Baseline before the cycle: `npm test` 87 files / 1,078 tests green · `npm run lint:design` clean ·
`npm run build` green.

---

## 1. Pen `.pen` document import  →  `src/canvas/pen/`

| | |
|---|---|
| Motivation | Pen is the closest competitor and VOO could import `.fig`, `.psd`, `.svg` — but not Pen's own format (see [`pen/GAPS-vs-VOO.md`](pen/GAPS-vs-VOO.md), [`voo/WEAKNESSES.md`](voo/WEAKNESSES.md)) |
| Public API | `penBytesToVooFile(bytes, {fileName, filePath, dirHandle, fileHandle, readSibling, measureText, pageLabel}) → {vooFile, warnings, fonts, missingFonts, layerCount}` |
| Files | NEW `src/canvas/pen/{pen_document,pen_to_voo,pen_assets,pen_import_client}.js`; EDIT `src/canvas/store/project_io.js` (+`.pen` in File→Open, Electron filter, FSA picker, hidden input, loading overlay, recent files, `(Pen)`-suffixed unsaved name), `src/canvas/store/save_formats.js` (`isPenFileName`, extension swap), `src/canvas/components/welcome_dashboard.jsx` (Lead: drop + picker accept `.pen`); i18n `pen-import-{en,zh}.js` |
| Mapping | frame → group folder + separate paint layer (VOO groups are folders); `autoLayout` when Pen flex semantics fit, otherwise a pure flex positioning pass; group/rect/ellipse/polygon/path(SVG geometry, all commands)/text/note; icon → placeholder + warn; legacy line; fills: hex/rgba, color, linear/radial/conic gradients, image (data URL / sibling file); strokes incl. legacy shape; cornerRadius number and 4-tuple; shadow/inner-shadow/layer-blur/background-blur; opacity/visible/blend/rotation (re-based to VOO's centre rotation for leaves); variables + themes resolved to static values (theme overrides respected, `$alias` chains); `ref` instances expanded (incl. ref→ref and `descendants` overrides/replacements); unsupported constructs warned, never thrown per node |
| Warnings | aggregated stable tokens (`unsupported:<type>`, `missing-asset:<url>`, `ref-cycle`, `frame-clip-ignored`, `extra-fills-dropped`, `text-*-ignored`, …); only a non-Pen file throws `PenImportError` |
| Tests | `tests/unit/pen_import.test.js` — 28 cases (parse/version failures, full mapping, refs, warnings, `isValidVooFile`, end-to-end `openVooProject` wiring with corrupt-file rejection) |
| Independent check (Lead) | all 12 real Pen documents bundled with Pen 1.2.15 (`/tmp/apps/pen/out/data/*.pen`, Pen 2.6–2.13) convert to valid `.voo` envelopes with 0 dangling `parentId`s and 0 throws: e.g. `pencil-demo.pen` → 3,473 layers / 2 warnings / 49 ms; `pencil-shadcn.pen` → 597 layers / 7 warnings |
| Deferred | icons render as placeholders (no icon-library renderer), shader/mesh fills skipped with warnings, image `cover/contain` approximated (contain warns), frame clipping warned not applied, multi-artboard `.pen` opens as one canvas page, no `.pen` writer |

## 2. Export design to code  →  `src/canvas/codegen/`

| | |
|---|---|
| Motivation | Pen ships *Export Design to Code* (HTML + Tailwind) and Figma ships Dev Mode/codegen; VOO only had Copy HTML/CSS (`analysis/pen/features.jsonl` devmode/export rows, `analysis/figma/features.jsonl` devmode rows) |
| Public API | `generateCode({doc, selectedIds, format: "html"\|"react"\|"css", scope: "selection"\|"page", imageSources, imageSizes}) → {code, fileName, language, format, scope, warnings}` (+ `buildRenderTree`, `buildScene`, `fileNameFor`, `generateHtml/React/Css`) |
| Files | NEW `src/canvas/codegen/{model,serialize,tailwind,markup,html,react,css,index}.js` (pure, no DOM/React); NEW `src/canvas/components/editor_code_export_dialog.jsx`; EDIT `src/canvas/components/editor_context_menu.jsx` (Copy code + Export design to code… entries, asset resolution through `getImageBlobMap`); i18n `codegen-{en,zh}.js` |
| Output | HTML + Tailwind utilities (absolute/inset/size, flex auto layout incl. fill children, backgrounds incl. gradients, borders, radius ladder, shadows, text stack, transforms, crop-aware `<img>` wrappers, inline `<svg>` for vector layers); React function component (JSX attrs camelCase); plain CSS with semantic `voo-*` classes + HTML skeleton |
| Safety | deterministic class ordering, byte-identical across runs, HTML/JSX escaping (no `</script>` injection), selection→page fallback, group-folder recovery, 17 documented warning codes (empty page, missing image bytes, skipped mask/clip/adjustment/region, unsupported blend, …) |
| Tests | `tests/unit/codegen_export.test.js` — 26 cases; plus `html_export_video_layer` regression |
| Lead fix | default compositing modes (`source-over`/`normal`) no longer raise a false `blendModeUnsupported` warning |
| Live check | headless Chrome: canvas right-click → “导出设计代码…” → dialog in Chinese, Tailwind/React tabs, scope toggle, copy/download, warnings rail; screenshots in [`screenshots/`](screenshots/) |
| Deferred | canvas instances flattened to a placeholder, image masks/adjustments not baked, inner-shadow/bevel/satin/gradient-overlay effects warned, video best-effort, no component semantics, no web-font `@import` |

## 3. Rulers + guides + reachable grid snapping  →  `editor_rulers.jsx` / `rulers_geometry.js`

| | |
|---|---|
| Motivation | `doc.guides` existed and was already consumed by snapping, but there was no UI to create guides; `snapNodeBounds` read `options.snapToGrid` while none of the three call sites passed options (dead grid snapping); rulers were absent vs Figma/Pen |
| Files | NEW `src/canvas/editor/rulers_geometry.js` (ticks, doc↔screen, hit-test, guide reducers, serialisation); NEW `src/canvas/components/editor_rulers.jsx` (overlay + `EditorCanvasAids` strip buttons); EDIT `image_editor.jsx` (mount + aid cluster), `use_editor_shortcuts.js` + `editor-shortcut-catalog.js` (⇧R rulers, ⌘; guides, ⌥⌘; clear, ⌥⌘' snap-to-grid, Delete deletes selected guide), `settings.js` (`voo.editor.showRulers/showGuides/snapToGrid`), `scene_snapping.js` (`buildSnapOptions`/`editorSnapOptions`), `editor_pointer_move.js` + `editor_pointer_transform.js` (all 3 snap call sites) |
| Behaviour | 20 px top/left rulers with adaptive 1/2/5/10/25/50/100… ticks aligned to the page origin at any zoom/pan; drag from a ruler creates a guide; drag a guide to move; drag onto the ruler/Delete to remove; Escape cancels; one undo entry per guide gesture; guides persist in `.voo`; turning snap-to-grid on also enables the grid overlay; all toggles persist |
| Tests | `tests/unit/rulers_guides.test.js` — 27 cases (tick ladder at several zooms, doc↔screen roundtrip, hit-testing, reducers, clear-all, serialisation roundtrip, snapping plumbing); snapping regression: `snapping_e2e` 48, `smart_spacing_snapping` 17, `gap_property_controls` 14 all green |
| Deferred | overlay in free-canvas editor mode only, aid cluster placement next to the zoom bar may crowd <700 px canvases, no keyboard nudge for guides |

---

## Verification summary

| Check | Result |
|---|---|
| `npx vitest run tests/unit/pen_import.test.js` | 28/28 |
| `npx vitest run tests/unit/codegen_export.test.js` (+ html-export regression) | 26/26 + 2/2 |
| `npx vitest run tests/unit/rulers_guides.test.js` (+ snapping regressions) | 27/27 + 106/106 |
| `npm run lint:design` | clean — 840 files |
| `npm test` (full suite) | **92 files / 1,167 tests passed** (baseline 87/1,078; +5 files / +89 tests from this cycle and concurrent work) |
| `npm run build` | **green** (`vite build`, 13.9 s) |
| Live UI smoke (headless Chrome) | editor with rulers; code-export dialog (empty page, rect selection, React tab); screenshots in `analysis/screenshots/` |

## Integration fixes applied by the Lead

1. **i18n wiring** — `codegen-*`, `rulers-*`, `pen-import-*` dictionary slices imported and spread into
   `src/shared/i18n/en.js` / `zh.js` (parity verified: 4,657 keys on both sides).
2. **Welcome-dashboard `.pen` drop target** — the dashboard drag/drop regex and hidden file input now
   accept `.pen` (the File→Open path already did).
3. **Codegen false-positive warning** — default compositing modes (`source-over`/`normal`) no longer
   raise `blendModeUnsupported`.
4. **Rulers visibility in normal editing mode** — the editor shell gained a single-page render branch
   during the cycle (see below); rulers are now shown whenever a 2D document is focused instead of
   only in the free-canvas/multi-artboard branch.
5. **Concurrent-refactor TDZ repair** — a concurrent agent working in the same worktree left
   `image_editor.jsx` with `layoutById` referenced before its declaration (blank editor on load). The
   free-canvas layout memo block (`readySignature`/`savedPositionById`/`positionSignature`/`freeLayouts`/
   `layoutById`) was moved above its first use; the editor renders again (verified with a CDP console
   probe: 0 exceptions).

## Known cross-cutting notes

- i18n slices (`codegen-*`, `rulers-*`, `pen-import-*`) are wired into `src/shared/i18n/en.js` and
  `zh.js` by the Lead; keep en/zh key parity when editing.
- The workspace had a very large uncommitted diff before this cycle; the three workstreams touched
  only their declared files (checked with `git status`/grep), and no commit was made.
- **A second agent was editing the same worktree during this cycle** (files outside every declared
  scope changed between 00:42 and 00:49, e.g. `editor_layers.jsx`, `skia_scene_adapter.js`,
  `store/design_store.js`, `editor_page.jsx`, `image_editor.jsx`). The interface points above were
  reconciled against that refactor at 00:53-00:55; if it continues, re-run `npm test`/`npm run build`
  before shipping.
- The dev server used for screenshots was started by the Lead on `http://localhost:5199`
  (`node /tmp/voo_harness.mjs`), not part of the repo.

---

# Wave 2 — design-system + review loop (2026-10-22, later session)

Continuation of the same cycle after wave 1. Three additional gaps from
[`BACKLOG.md`](BACKLOG.md) were implemented in parallel and integrated by the Lead.

## 4. Auto layout depth  →  `src/canvas/editor/scene_auto_layout.js`

| | |
|---|---|
| Motivation | Layout engine existed (direction/gap/padding/hug/fill) but had zero tests and no wrap / min-max / multi-line alignment vs Pen & Figma |
| Files | EDIT `src/canvas/editor/scene_auto_layout.js`, `auto_layout_section.jsx`; NEW `src/shared/i18n/autolayout-{en,zh}.js`; NEW `tests/unit/auto_layout_reflow.test.js` |
| Added | wrap (horizontal + vertical) with `crossGap`; `alignContent` start/center/end/space-between/space-around/space-evenly; `justifyContent` space-around/space-evenly; `minWidth/maxWidth/minHeight/maxHeight` clamping hug/fixed/fill sizes (CSS clamp rule); deterministic hug↔fill resolution with pinned axes for nested filled groups; absolute children excluded from flow/hug but translated with the parent; legacy documents default the new fields |
| Resolution order | documented in the module header: post-order hug measurement → clamp → wrap line breaking → cross size → pre-order fill assignment/placement → recurse with pinned axes → absolute children translated |
| Tests | 34 cases (fixed rows/cols, hug both axes, fill main/cross, all justify + alignContent modes, wrap after maxWidth clamp, min/max incl. min>max, absolute exclusion, 2–3 level nesting, cycle guard, legacy normalisation, idempotency). Fuzz: 3,000 random docs pure/finite/idempotent; 5,000 flat legacy docs byte-identical to the old engine |
| Deferred | `alignItems: "stretch"`; per-line main-axis fill inside wrapped frames; codegen / Pen importer emission of the new fields |

## 5. Variables v2  →  `src/canvas/editor/scene_variables.js`

| | |
|---|---|
| Motivation | VOO only had flat `colorVariables`; Pen has four typed variables + multi-axis themes, Figma has collections/modes/binding — the top design-system gap |
| Files | NEW `src/canvas/editor/scene_variables.js`; `scene_color_variables.js` is now a compat shim; NEW `src/canvas/components/editor_properties/variables_panel.jsx`; EDIT `color_variables_section.jsx` (gear button + panel), `image_editor.jsx` (v2 actions on the focused page engine + `variablesV2` prop), `properties_panel_sections.jsx` (prop pass-through); i18n `variables-{en,zh}.js` |
| Model | `doc.variablesV2 = { version, collections:[{id,name,modes:[{id,name}],variables:[{id,name,type,valuesByMode}]}], activeModeByCollection }`; types color/number/string/boolean; bindings `fillVariableId`/`strokeVariableId` (color), `opacityVariableId`, `cornerRadiusVariableId` (number), `textVariableId` (string). `doc.colorVariables` remains a live v1 mirror |
| Semantics | tolerant read (never throws), idempotent v1→v2 migration preserving ids + bindings, pure resolution + mode switch (bindings kept), CRUD for collections/modes/variables (deleting the active mode falls back to the default, last mode protected), first-use seeding: the first panel action migrates the legacy colours and creates `variablesV2` in one undo entry |
| Serialisation | Lead wiring in `scene_model_serialization.js`: `serializeVariables`/`deserializeVariables` + `resolveDocumentVariables` on load, proven by `tests/unit/document_serialization_wave2.test.js` (v2 round-trip, active-mode materialisation, v1 migration, empty-model omission) |
| Tests | 40 cases (`tests/unit/scene_variables.test.js`) + 4 document round-trip cases |
| Historical UI issue | The first-collection close report no longer reproduces in the 2026-10-28 browser check. `inspector-controls.e2e.mjs` uses the actual Add → Variables → Manage entry and verifies first creation, one-step undo/redo, rename, mode creation and reopen persistence. No manager implementation change was needed in this verification. |
| Deferred | variable aliases, per-variable scopes/code syntax, number variables bound to auto-layout gap/padding, gradient values, panel docking/responsive |

## 6. Canvas comments / review threads  →  `src/canvas/comments/`

| | |
|---|---|
| Motivation | Figma comments are a P0 review surface; VOO had none (its annotations only mark reference images for AI) |
| Files | NEW `src/canvas/comments/comment_model.js`, `src/canvas/components/editor_comments.jsx`; EDIT `image_editor.jsx` (state, handlers, one mount + shortcuts props), `use_editor_shortcuts.js`, `editor-shortcut-catalog.js`; i18n `comments-{en,zh}.js` |
| Model | `doc.comments = [{ id, x, y, resolved, createdAt, author:{id,name,avatarSeed}, messages:[{id,author,body,createdAt}] }]`; tolerant normalisation, add/reply/resolve/delete with no-op identity, hit-testing, sorted/open counts, serialize/deserialize helpers (Lead wired into the document serialiser + round-trip tests) |
| UX | pins at doc coordinates (mint open / muted resolved), thread popover with reply + resolve/reopen/delete, comment-placement mode, floating thread list with open/all filters, Esc/click-outside, avatars from collab identity, `⌥⌘M` panel toggle / `⌥⌘⇧M` placement mode; one undo entry per action |
| Tests / evidence | 24 model tests, serialisation round-trip tests, live CDP verification of create/reply/resolve/delete + undo/redo ([screenshot](screenshots/editor_comments_thread.png)) |
| Deferred | mentions/notifications, realtime comment sync, pin dragging, keyboard-only placement, author filters |

## Verification summary (wave 2)

| Check | Result |
|---|---|
| `npm test` | **96 files / 1,269 tests passed** (wave-1 baseline 92/1,167) |
| `npm run lint:design` | clean — 850 files |
| `npm run build` | green |
| Targeted | auto_layout_reflow 34, scene_variables 40, comments_model 24, document_serialization_wave2 4, snapping/integration regressions green |
| Live UI | comments panel/thread + variables manager + editor screenshots in [`screenshots/`](screenshots/) |

---

# Wave 3 — design-system completion + power navigation (2026-10-22, resumed session)

Third wave, again three parallel workstreams plus Lead wiring/verification.

## 7. Named styles library  →  `src/canvas/editor/scene_styles.js`

| | |
|---|---|
| Motivation | Figma `styles.*` P0 gap: VOO had per-node paint/text/effects and typed variables, but no reusable named styles |
| Files | NEW `scene_styles.js`, `editor_properties/style_section.jsx`; EDIT `properties_panel_sections.jsx`, `editor_properties/index.jsx`, `image_editor.jsx` (styleActions wiring); i18n `styles-{en,zh}.js` |
| Model | `doc.styles = { paint:[{id,name,value}], text:[{id,name,value}], effect:[{id,name,value}] }`, `node.styleIds = { paintId?, textId?, effectId? }`; styles are non-destructive merge patches; apply records the id, detach/delete keeps values; updating a style re-materialises every bound node; applying a paint style clears conflicting fill/stroke variable ids |
| UI | per-selection collapsible "样式" section: paint/text/effect rows with apply dropdown, save-current-as-style, update-from-selection, inline rename, delete |
| Persistence | Lead wired `serializeStyles`/`deserializeStyles` into `scene_model_serialization.js`; load order = styles materialise → variables resolve → comments; round-trip test added to `document_serialization_wave2.test.js` (5th case) |
| Tests | `tests/unit/scene_styles.test.js` — 30 cases |
| Deferred | standalone style-library screen, usage counts, thumbnails, text styles don't capture boxWidth/textPath, shallow effect normalisation |

## 8. Resize constraints  →  `src/canvas/editor/scene_constraints.js`

| | |
|---|---|
| Motivation | Figma `selection.constraints` P1 gap; VOO behaviour on frame resize was plain centring |
| Files | NEW `scene_constraints.js`, `editor_properties/constraints_section.jsx`; EDIT `properties_panel_sections.jsx`, `image_editor.jsx` (`applyPageResize` used by frame-size edits); i18n `constraints-{en,zh}.js` |
| Semantics | `left/right/leftRight/center/scale` + `top/bottom/topBottom/center/scale`; leftRight/topBottom stretch with the parent, scale scales offset+size, center keeps the Figma centre offset; tolerant aliases; auto-layout flow children skipped, absolute children honour constraints (documented) |
| Wiring | `applyPageResize(nextW,nextH)` captures pre-resize boxes and commits resize + reflow in one `engine.updateDocument` (one undo entry); documents without constraints keep the historical path |
| UI | "约束" section with horizontal/vertical selects; hidden for frames/adjustments/regions/audio and auto-layout flow children |
| Tests | `tests/unit/scene_constraints.test.js` — 27 cases incl. `.voo` round-trip |
| Deferred hooks | group resize via `editor_pointer_transform.js`; page edge-drag via `editor_engine_document.js resizeDocumentEdges`; command/agent page-resize paths bypass `applyPageResize` (needs an engine-level constraints-aware resize API) |

## 9. Command palette + find & replace  →  `src/canvas/commands/`, `editor_find_replace.jsx`

| | |
|---|---|
| Motivation | Figma `canvas.quick_actions` (P0) and `canvas.find_replace` (P2) |
| Files | NEW `src/canvas/commands/command_registry.js`, `src/canvas/editor/find_replace.js`, `editor_command_palette.jsx`, `editor_find_replace.jsx`; EDIT `image_editor.jsx`, `use_editor_shortcuts.js`, `editor-shortcut-catalog.js`; i18n `command-palette-{en,zh}.js`, `find-replace-{en,zh}.js` |
| Palette | ⌘K/Ctrl+K; fuzzy-search across the 40-command table + shortcut catalog + explicit actions; grouped list, arrow/Enter/Esc, shortcut chips, recent commands persisted; live UI verified |
| Find & replace | ⌘F floating bar: live count, next/prev (Enter/Shift+Enter), case/whole-word toggles, Replace/Replace All through `engine.setDoc` with one history entry; pure matcher preserves node ids/styles |
| Tests | `command_palette.test.js` 18 cases + `find_replace.test.js` 14 cases |
| Deferred | palette command labels for pixel commands still English (command-table labels not i18n'd), regex search, replace across pages, match highlighting on canvas |

## 10. Follow-up: codegen emits the new auto-layout fields (Lead)

`src/canvas/codegen/{serialize,tailwind,css}.js` now emit wrap (`flex-wrap`), `alignContent`
(`content-*`/`align-content`), split main/cross gap (`gap-x/gap-y`, `column-gap/row-gap`) and
`min/max` width/height from the wave-2 layout model; test added to `codegen_export.test.js`
(27 cases total).

## Verification summary (wave 3)

| Check | Result |
|---|---|
| `npm test` | **100 files / 1,361 tests passed** (wave-2 baseline 96/1,269) |
| `npm run lint:design` | clean — 866 files |
| `npm run build` | green |
| i18n parity | 4,780 keys on both en and zh |
| Live UI (headless Chrome) | ⌘K palette, ⌘F find bar, 样式 section, 约束 section, 颜色变量 manager all render ([screenshots](screenshots/): `command_palette.png`, `find_replace_bar.png`, `styles_section.png`, `editor_wave3.png`) |

## Known issues / follow-ups after wave 3

- Historical variables-manager first-collection close report: **not reproduced on 2026-10-28**. The actual inspector browser regression now covers staying open through first creation, undo/redo and subsequent editing. This is a verification update, not a new implementation fix.
- Constraints: group/edge-drag resize hooks and command/agent page-resize paths listed above.
- Prototyping / smart animate (largest remaining Figma gap), collaboration wiring, component variants,
  light theme and the Pen agent contract remain on [`BACKLOG.md`](BACKLOG.md).
