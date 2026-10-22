# Pen.app 1.2.15 — Feature Surface (static reverse-engineering)

Source of truth: `/tmp/apps/pen` (extracted `Pen.app/Contents/Resources/app.asar`, 774 MB, `pen@1.2.15`).
Machine-readable inventory: [`features.jsonl`](./features.jsonl) — **144 rows**, 27 areas.
Commands and evidence sizes: [`rea/COMMANDS.md`](./rea/COMMANDS.md).

Evidence strengths used below: **static** = string/schema/menu/IPC evidence in the bundle;
**inferred** = conclusion drawn from absence, always marked. Nothing here is runtime-observed: the
app was left untouched, so no behaviour claim goes beyond what the shipped code/instructions say.

Two unusually strong sources deserve emphasis, because they are the product's *own* machine-readable
description of itself, shipped inside the asar:

- `out/skills/pen-dev/pen-schema.md` — the complete `.pen` document schema (`version: "2.20"`).
- `out/skills/pen-dev/execute.md` — the complete agent-facing document-mutation API.

---

## 1. document / file

- Documents are `.pen` JSON (schema `2.20`) with `document` as the root; there is **no Page level** —
  screens are top-level frames under `document` (`out/skills/pen-dev/pen-schema.md`, `interface Document { children: Child[] }`).
- Native menu covers New File (⌘⇧N), Open… (⌘O), Open Recent (max 14 + clear), Dashboard (⌘N),
  Save (⌘S), Save As… (⌘⇧S) — all routed through the focused device's `saveResource()`
  (`out/menu.js`, `MAX_RECENT_MENU_FILES = 14`).
- Documents are local-first: `~/.pencil/documents`; config/skills/browser-previews are siblings
  (`out/constants.js`, `CONFIG_FOLDER`). Autosave failures are reported to the shell
  (`out/app.js`, IPC `auto-save-failed`).
- Portability is via **snapshots**: "Export Snapshot…" writes a self-contained archive of the
  document + referenced assets; snapshots can also be imported from a URL
  (`out/menu.js`, strings `Snapshot archive is invalid`, `Could not import this snapshot.`,
  `Snapshot import from URL is not available in this environment.`).
- 12 bundled starter files ship in `out/data/` (shadcn / halo / lunaris / nitro design-system
  libraries, heroui, welcome, demo), exposed through `BUNDLED_DOCUMENTS_FOLDER` and the dashboard.

## 2. canvas

- Infinite canvas with the usual zoom set: Zoom in/out, 100%, fit, selection, region, zoom-at-pointer,
  plus pan modes (`shortcuts-catalog-chunk.js.txt`, categories *Zoom* (9) and *Move* (4)).
- Canvas aids: "Show pixel grid", "Snap to pixel grid", "Snap to objects", comment-marker toggle —
  config keys `showPixelGrid`, `roundToPixels`, `snapToObjects` (compiled config-toggle table in
  `out/editor/assets/index.js`).
- Window management is a first-class feature: "Organize Windows into Grid" and "Toggle Light/Dark Mode"
  live in the Window menu (`out/menu.js`, `organizeWindowsIntoGrid()`).
- "Show/Hide UI" (⌘\) hides all chrome for a clean canvas (`out/menu.js`).
- The agent API includes `FindEmptySpace({width,height,direction,padding,nodeId})` — the product
  expects automated placement on an unbounded canvas (`out/skills/pen-dev/execute.md`).

## 3. tools

The editor's tool state machine activates exactly these tools
(`grep -oE 'setActiveTool\("[a-z_]+"\)' out/editor/assets/index.js`):
`move, scale, hand, frame, rectangle, ellipse, text, pen, pen_move, pen_cut, comment, sticky_note`
plus toolbar-only `icon`, `script`, `browser` (`activeTool==="…"`).

- Pen tool is a real path editor, not just a bezier drawer: add point, insert point on segment, cut,
  connect selected points, toggle smooth/corner, pull symmetric handles, break symmetry, bend into a
  curve, straighten segment, select all points/connected points (`shortcuts-catalog-chunk.js.txt`,
  categories *Pen tool*, *Points & handles*, *Segments*).
- Text, shapes and frames are separate tools; "Sticky note" is an annotation object separate from
  design content (`type: "note"` in the schema).
- `script` and `browser` tools place their own node types: JS-generated children and a live web page
  (see §19 and §23).
- Node types a user can create: frame, group, rectangle, ellipse, polygon, path, text, note, prompt,
  context, icon, script, browser, ref (`pen-schema.md`, `type Child = …`). Notably there is **no
  image node**: images are fills (see §8).

## 4. selection & transform

- Marquee selection with three combine modes driven by modifiers: Shift = union/add, Alt = subtract,
  Shift+Alt = intersect (`out/editor/assets/index.js`,
  `if(event.shiftKey&&event.altKey)return"intersect"`), plus "Box select"/"Add to box selection"/
  "Deep box select" and "Deep select" into nested containers.
- Align: 6 commands (top/middle/bottom, left/center/right); ordering: 4 (bring forward, send backward,
  bring to front, send to back); nudge with arrows, ⇧ for big nudge; duplicate-by-dragging
  (`shortcuts-catalog-chunk.js.txt`, categories *Align* (6), *Ordering* (4)).
- Select parent / select children / select all / deselect are bound, i.e. hierarchy traversal is
  keyboard-first.
- Rotation and flips are document properties (`rotation`, `flipX`, `flipY` in `pen-schema.md`) and have
  UI commands ("Rotate 90° right", "Flip horizontal/vertical").
- Group/ungroup exists as a real node type (`interface Group extends Entity, CanHaveChildren, CanHaveEffects`).

## 5. vector

- Path nodes store raw SVG geometry plus `viewBox` and `fillRule` (`nonzero`/`evenodd`)
  (`pen-schema.md`, `interface Path`).
- Four destructive boolean ops — union, subtract, intersect, exclude — with a `BOOLEAN_OPERATION`
  node kind (`string:BOOLEAN_OPERATION`, `destructiveBoolean`).
- Stroke model is richer than a single width: fill-like stroke paint, per-side widths, linecap,
  linejoin, inner/center/outer alignment (`interface CanHaveStroke`).
- Per-corner corner radius on rectangles/polygons ("Edit corners individually"), and ellipses support
  `innerRadius` (donut) plus `startAngle`/`sweepAngle` arcs.
- Vector assets: SVG import becomes editable paths, and raster can be **vectorized**:
  `Generate("vectorize-image", frameId, imageUrl)` traces an image into paths inside a placeholder
  frame (`generate.md`).
- Icons are their own node type across six libraries (lucide, feather, Material Symbols
  Outlined/Rounded/Sharp, phosphor) with variable `weight` — the product explicitly prefers icons
  over hand-drawn paths (`SKILL.md`: "Never draw logos, illustrations, or mascots yourself out of paths").

## 6. text & typography

- Full text style model: family, size, weight, style, letterSpacing, lineHeight (multiplier),
  underline, strikethrough, href, textAlign + textAlignVertical (`pen-schema.md`, `interface TextStyle`).
- Three growth modes: `auto` (grow, no wrap), `fixed-width` (wrap, grow height),
  `fixed-width-height` (may overflow) — i.e. Figma-like text sizing semantics without the labels.
- "All Google fonts are available" is stated as a product guarantee to the agent (`SKILL.md`).
- Text is edited in-place on the canvas (floating overlay/formatting controls; strings `Edit text`,
  `Line height`, `Font weight`, plus `format_underlined` / `format_strikethrough` controls).
- Text-like objects are first-class document nodes (`text`, `note`, `prompt`, `context`) — prompt and
  context nodes exist so agents can leave prompts/context on the canvas, not only chat.

## 7. layout

- Flex-only auto layout: `layout: none | vertical | horizontal` with `gap`, `padding` (1/2/4-value),
  `justifyContent` (start/center/end/space_between/space_around), `alignItems` (start/center/end)
  and `layoutIncludeStroke`. Add/Remove layout are explicit commands ("Add flex layout",
  "Remove flex layout"). **There is no CSS grid layout** in the 2.20 schema.
- Sizing uses `fit_content` / `fill_container` behaviors with numeric fallbacks
  (`fit_content(100)`), applied to width/height (`type SizingBehavior`).
- Children can opt out of flow: `layoutPosition: auto | absolute` (UI strings "In flow" / "Absolute").
- Frames clip via `clip: true`; the skill instructs agents to always clip screen frames.
- Layout slots: `slot: string[]` marks a frame as a slot for component instances with recommended
  child components (`pen-schema.md`; `guide/design-system.md` §2 "Understanding Slots").
- Agent-facing layout QA is built in: `Get(..., visit)` exposes `ctx.bounds` and
  `ctx.problems` = `"partially clipped" | "fully clipped"` so an agent can verify its own layout
  (`execute.md`).

## 8. fills, effects & shaders

- Fill stack supports color (with blend mode + alpha-only opacity), gradients (linear / radial /
  angular, normalized center/size/rotation, multi-stop), **image fills** (cover/contain/stretch +
  affine crop transform), **shader fills**, and **mesh gradients** (row-major bezier color grid)
  (`pen-schema.md`, `type Fill = …`).
- Effects: layer blur, backdrop/background blur, and inner/outer drop shadows with offset, blur,
  color and blend mode (`type Effect`; UI strings `Layer Blur`, `Background Blur`, `Inner Shadow`,
  `Drop Shadow`).
- 18 blend modes including hue/saturation/color/luminosity (`type BlendMode`), surfaced as a
  "Blend mode" control.
- Shader fills are WebGL 1.0 fragment shaders stored as `.glsl` files next to the document, with
  uniforms declared by block-comment annotations: `@resolution`, `@time`, `@mouse`, `@sdf`,
  `@backdrop`, `@color`, `@default`, `@min`/`@max`/`@range`, `@label`
  (`scripts-and-shaders.md`, `@time` enables animation, `@backdrop` enables refraction/glass).
- A bundled shader gallery ships in `out/editor/goodies/shaders/` (~40 `.glsl` files with `.webp`
  previews: ember, ink-on-paper, jade-tile, dot-grid, riso, CRT, stone, gradient families).

## 9. image & generation

- There is no image node: imagery is a fill on some node (`generate.md`, "IMPORTANT: There is NO
  `image` node type").
- Six generation modes behind one `Generate()` call: `ai` (prompt → image), `stock` (Unsplash query →
  image), `svg` (prompt → vector artwork into a placeholder frame), `vectorize-image`,
  `remove-background`, `replace-background` (the only transform that takes a prompt).
- Generation is asynchronous by design: fills are written immediately and resolve later from
  `pencil:pending-image-…` placeholders; frames use `placeholder: true` and the generator clears it.
  Agents are told to poll with a cheap `Get` read, never with screenshots (`generate.md`).
- Image transforms are constrained (JPEG/PNG/WebP, ≤16 MB, 256–4096 px) and the returned URL is a
  pending placeholder that must be applied in the same `execute` call.
- Imported/edited rasters: crop tool with reset ("Reset crop"), plus `Copy as PNG` for clipboard handoff.

## 10. components

- Any node marked `reusable: true` is a component ("symbol"); instances are `ref` nodes pointing at
  it, and an instance has **no children of its own** (`guide/components.md`,
  `interface Ref { type: "ref"; ref: string; descendants?: … }`).
- Overrides are property-level and keyed by descendant id, path or unique name; nested instances use
  `instanceId/childId` paths of arbitrary depth; an override that carries `type` **replaces** the
  whole subtree (`guide/components.md`).
- Slots (`slot: [componentId,…]`) declare where instances of recommended components should go —
  the design-system guide walks through identifying and filling them.
- Detach instance exists as a UI action ("Detach instance").
- Deliberate limits: components cannot be referenced across files (copy them instead), and an
  instance's descendant cannot be deleted — only overridden with `enabled: false`.
- **No variants / component properties** in 1.2.15: the `Child` union has no variant type, and
  "variant" hits in the bundle are font-variant CSS keywords and shader preset names.
  Recorded as inferred negative evidence in `features.jsonl#components.variants`.

## 11. variables & theming

- Document-level variables of four types — `color`, `number`, `string`, `boolean` — with a `$name`
  reference syntax usable on almost every property (`NumberOrVariable` / `ColorOrVariable` /
  `StringOrVariable` / `BooleanOrVariable`).
- Variables support **multi-axis theming**: `document.themes` maps axes (e.g. `mode`) to values, and a
  variable's value can be an array of `{value, theme}` entries; new axes/values auto-register
  (`execute.md#SetVariables`, `pen-schema.md`).
- There is a dedicated Variables panel ("Variables Panel", "Add variable") with agent parity via
  `SetVariables` / `GetVariables` (`Print(GetVariables())` returns variables + themes).
- Variables are the token layer; combined with components and slots they stand in for a named-styles
  system. No evidence of Figma-style named color/text/effect styles (negative, inferred).

## 12. agent & AI

This is the product's centre of gravity — 13 rows in `features.jsonl`.

- On-canvas agent chat that edits real nodes: the `execute` tool runs a JS snippet against the
  document with `Insert/Copy/Update/Replace/Move/Delete`, rollback on error, and warning lists
  returned to the model (`execute.md`).
- Verification loop: `TakeScreenshot([nodeIds])` returns rendered images in the same tool response;
  the skill repeatedly instructs "screenshot after finishing a section, not in every call".
- Multi-provider model picker: Anthropic Claude / Claude Code, OpenAI Codex / GPT, Google Gemini,
  Cursor, Grok, DeepSeek, Kimi, GLM, plus any OpenAI- or Anthropic-compatible endpoint
  (`Select Model`, `Connect any OpenAI or Anthropic compatible API`, provider model strings in the
  bundle; `out/config.js` stores claude/codex/gemini/cursor keys + login types).
- Parallel agents and subagents ("Set parallel agents", "Subagent Task"), agent sessions/history,
  agent cursor with label and size (`Agent cursor label`, `Agent cursor size`) so automated editing
  is visible on canvas.
- Skills: a `pen-dev` SKILL.md package with 15 guides ships in `out/skills/`, plus user-added skills
  (`Add SKILL.md file…`, `SkillsManager`, `~/.pencil/skills`, manifest zip + semver from blob storage).
- Style archetypes: `get_style({name})` returns ready-made art directions (e.g. *Aerial Gravitas*,
  *Artisan Editorial*, *Cinematic Device Column*, *Blueprint Technical*) — the tool result is grouped
  under "Styles".
- Usage gating is model-visible: at the plan limit the tools return "STOP. Do not continue…"
- Feedback loop: "Apply feedback to the targeted nodes", "Apply with AI on copies",
  "Duplicate target nodes first, then apply feedback so you can compare".

## 13. MCP, extensions & dev mode

- Pen is itself an MCP server: "Connect via MCP", "MCP configuration", "Copy MCP config",
  "Paste this into your tool's MCP server settings to connect it to pen.dev."
- One-click MCP install target list (`out/desktop-mcp-adapter.js#getSupportedIntegrations`):
  `claudeCodeCLI, codexCLI, geminiCLI, antigravity, openCodeCLI, kiroCLI, claudeDesktop`.
- Custom MCP servers can be added ("Custom MCP Server Configuration", "MCP connections",
  "Registered Tools", "WebMCP tools").
- IDE integrations: VS Code extension `highagency.pencildev` with an embedded "Design Mode"
  (`Toggle Design Mode`, `Hide IDE sidebar when Layers are open`, `wt.isVSCode` branch) and a Cursor
  extension that the app installs/opens (`out/ide.js`). Help menu also links the `pen` CLI docs.
- Design-to-code: "Export Design to Code" dialog + "Code export settings" + "Connect your local
  project, or export your design as ready-to-use HTML", with HTML and HTML+Tailwind copy actions and
  `Export(nodes, "html-tailwind"|"html-css")` in the agent API. The bundled `guide/code.md` is a
  full React/Tailwind codegen playbook (component extraction, props inference, nested instance
  mapping).
- Workspace folder for generated code is configurable ("Set Workspace Folder", IPC
  `change-workspace-folder`).

## 14. export

- Images: `Export Selection to…` → PDF / PNG / JPEG / WebP (`out/menu.js`), plus
  `Export(nodes, format, outputPath)` for the agent (PDF = one multi-page file; 2× default scale,
  quality option for JPEG/WebP).
- Code: HTML (`html-css`) and HTML + Tailwind (`html-tailwind`), one file, relative asset paths,
  optional scaffold and `data-` layer name/id attributes (`execute.md#Export`, `ExportOptions`).
- Clipboard: Copy as PNG (⌘⇧C), Copy as HTML, Copy as HTML + Tailwind, Copy as JSON, Copy as Fill,
  Copy Code.
- Snapshot archive export/import for full-document portability (see §1).
- Export settings persist scale/quality (`exportScale`, `exportQuality` config keys).
- **Not found:** SVG document export, PDF export of the whole document from the File menu
  (only selection/frames), video/GIF export.

## 15. import

- Figma: "Import from Figma" / "Import Figma" / "Select Figma page to import", and the documented
  copy-paste path ("Copy any layer or frame in Figma and paste it onto the canvas. Images are not
  included."). A Help-menu guide "How to Import from Figma…" opens an import guide dialog.
- Web: "Import Web via Browser" / "Import from Browser" turns a live page (or a drag-clipped region)
  into nodes — `Drag to clip import height, double-click to import the full page`.
- SVG and raster images: "Import Image or SVG…" (the same menu entry covers Figma).
- Snapshots from URL (see §1).
- `.pen` libraries: `document.imports` maps short aliases to relative `.pen` URIs; UI warns on
  "Remove imported library?".
- No PSD/AI/Sketch importer in the renderer vocabulary (only Figma/SVG/image/web/snapshot found).

## 16. collaboration, comments & sharing

- Multiplayer is assumed: the skill tells the agent "pen.dev is a collaborative multiplayer
  environment: the document can change while you work"; bundle strings `LiveShareSync`, `Presence`.
- Share links publish a snapshot with assets: Create share link / Delete share link, "Anyone with it
  will no longer be able to open the file", progress/error states for share uploads, IPC
  `share-upload-changed`, and a "Share a snapshot" flow.
- Comments: canvas comment tool, threads ("Post comment", "Open thread", "Comment resolved",
  "Resolved comments are kept here", "No open comments"), markers toggle, and account-bound
  identity ("Comments are tied to your account", "Enter your name before commenting").
- Ownership rules exist ("Only the share owner can change a thread's status").
- Not found: branching/version history beyond snapshots and undo.

## 17. shortcuts & settings

- A structured shortcut registry in the bundle: 17 categories / 77 entries — Align, Ordering, File,
  View, AI Chat, General, Shapes, Tools, Selection, Pen tool, Points & handles, Segments, Layers,
  Mouse, Zoom, Move — rendered as a "Keyboard Shortcuts" dialog
  (`rea/shortcuts-catalog-chunk.js.txt`).
- AI-chat has its own shortcuts: toggle chat, new chat tab, next/previous chat tab, prompt history.
- Settings (⌘,) with sections; Window menu toggles light/dark and "Agent Chat Text Size"
  (Small/Medium/Large radio).
- Settings include agent/integration management: provider API keys or OAuth, executable paths,
  MCP integration toggles, custom providers, workspace folder.

## 18. onboarding

- First-run onboarding flow: "Set up pen.dev", agent harness setup ("Set up your on-canvas agent
  harness"), MCP configuration steps, "Close setup and resume next time", onboarding analytics IPC
  (`onboarding-mcp-configuration-started/finished`), `isFirstLaunch` config flag, plus dev-only
  "[DEV] Start Onboarding" / "[DEV] Reset to First Run".
- Discovery surfaces: Help → Documentation, **Prompt Gallery & Tips** (pen.dev/prompts), website,
  Discord, and 12 bundled starter documents.

## 19. scripting (procedural nodes)

- `script` nodes execute a `.js` file (relative `scriptUri`) and return an array of schema nodes that
  become children (`scripts-and-shaders.md`). Every script needs `/** @schema 2.11 */`.
- Scripts receive `pencil.width`, `pencil.height`, `pencil.input.<name>`; inputs are declared with
  `@input name: type [= default]` over `number|string|boolean|color|ref|enum`.
- `Math.random()` is deterministic in scripts, enabling repeatable procedural generation.
- A gallery of bundled generative scripts with previews ships in `out/editor/goodies/scripts/`
  (clock, chart, gauge, radar, flow-field, candlestick, circular visualizer, digital time, …).

## 20. browser nodes & whiteboarding

- `browser` nodes embed a live web page on the canvas: `url`, `deviceId` (device emulation preset),
  `zoom`, `scrollX/Y`, corner radius (`pen-schema.md`, `interface Browser`).
- The agent can drive browser nodes (the MCP/browser tool surface, `browser` results group,
  `WebMCP tools`), and the bundled `whiteboard.md` guide defines a research/compare/plan workflow on
  live browser nodes rather than producing designs.
- A browser sidebar and browser previews exist in the main process
  (`BROWSER_PREVIEWS_FOLDER`, `browser-cdp.js`, `browser-node-*.js`, `persist:pencil-browser-view`
  partition) — Chrome DevTools Protocol is used for capture/driving.

## 21. presentation

- Presentation mode over frames: "Create a frame to start a presentation"; the slide controller has
  `getStartSlide()`, `isEnabledSlideFrame()`, `stepSlides(e)` and transitions into a dedicated
  slide state (`out/editor/assets/index.js`, compiled class).
- The slide controller walks enabled slide frames in document order — slides are ordinary frames,
  there is no separate deck document or speaker-notes model (inferred from the controller surface).
- `guide/slides.md` is a slide-design quality guide for the agent (sizes, contrast, one idea per
  slide), not a feature of the presentation engine itself.

## 22. performance

- Rendering/layout core is WASM: `pencil-DYQf2TFZ.wasm` (9.5 MB) plus two emscripten modules
  (1.0 MB / 0.5 MB), `webworkerAll.js` and asyncify glue — i.e. a native-grade layout/render engine
  on a worker (`out/editor/assets/`).
- Shaders run on WebGL with capability probing (`EXT_float_blend`, `KHR_parallel_shader_compile`,
  `EXT_disjoint_timer_query_webgl2`, texture compression formats) before taking a fast path.

## 23. accessibility & i18n

- Editor chrome uses `aria-label` + tooltips on icon buttons (spot-checked compiled snippets such as
  `tooltip:"Code export settings","aria-label":"Code export settings"`), and the shortcut dialog is
  keyboard-reachable. No dedicated accessibility panel, contrast checker or screen-reader mode was
  found (inferred).
- **No i18n layer found**: all UI strings are English literals in the bundle; no locale files, no
  translation keys (only web-standard locale lists such as font-variant-east-asian appear).

---

## What is notably *absent* (honest negative evidence)

| Capability | Verdict | Basis |
|---|---|---|
| Component variants / component properties | absent (inferred) | no variant type in `Child` union; no variant UI strings |
| Named color/text/effect styles | absent (inferred) | no style node/collection in schema; "Styles" only labels the `get_style` tool group |
| CSS grid layout | absent | `Layout.layout` is `none|vertical|horizontal` only |
| Prototyping (interactions, overlays, transitions, smart animate) | absent (inferred) | zero product-level prototype strings; all `prototype` hits are JS built-ins |
| Keyframe/timeline motion | absent (inferred) | only `@time` shader animation; no keyframe model in schema |
| Multi-page documents | absent | root `Document.children` has no page level |
| PSD / Sketch / Adobe import | absent | only Figma/SVG/image/web/snapshot import vocabulary |
| Video / GIF / SVG document export | absent | export menu/API covers PNG/JPEG/WebP/PDF/HTML only |
| Comments on Figma-style layers vs canvas pins | canvas pins | comment tool + markers model, not per-layer comment threads |
| i18n / localization | absent | no locale resources |

These are the areas where Pen is *thinner than a classic design tool* by design: it is an agent-native
canvas (layout + components + variables + shaders + browser/script nodes + MCP/code handoff) rather
than a Figma clone.
