# VOO Design — canonical capability matrix vs Pen.app 1.2.15 and Figma desktop/editor

Curated by the Lead from the three evidence inventories ([`pen/`](pen/), [`figma/`](figma/), [`voo/`](voo/)).
The machine-generated fuzzy join is kept as [`FEATURE_MATRIX.raw.json`](FEATURE_MATRIX.raw.json) /
[`FEATURE_MATRIX.raw.md`](FEATURE_MATRIX.raw.md) — it over-reports gaps because Pen/Figma/VOO name
the same capability differently; this curated table is the authoritative view.

Legend — `Y` present · `P` partial · `–` absent · `?` unknown
Verdict — **parity** (all products comparable) · **gap** (reference apps have it, VOO does not) ·
**partial_gap** (VOO has a narrower version) · **ahead** (VOO's surface is stronger than the references)

## File, storage, collaboration

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| New / open / save document | Y | Y | Y | parity | — | `.voo`, recent files, workspace folders, trash |
| Autosave + crash recovery | Y | Y | P | partial_gap | P1 | saver exists but is disabled in standalone desktop (`use_editor_autosave.js`) |
| Version history | P | Y | P | partial_gap | P2 | local history panel only, no document version snapshots |
| Cloud document store / share links | P | Y | P | partial_gap | P1 | `share_actions.js` needs a `collabSession` nothing creates |
| Portable snapshot export/import (`.zip`) | Y | P | – | gap | P2 | Pen exports self-contained snapshots with assets |
| File tabs / multi-window workspace | P | Y | P | partial_gap | P2 | VOO has in-app canvas tabs, not document tabs |
| Branch / merge / review workflow | – | Y | – | gap | P3 | out of scope for a local-first editor this cycle |
| Live multiplayer + presence | P | Y | P | partial_gap | P1 | 12 collab modules written, none imported (dead stack) |
| Comments / comment threads | P | Y | Y | parity | — | implemented wave 2: doc.comments model + pins/thread popover/panel, ⌥⌘M/⌥⌘⇧M, undo, `.voo` persistence (notifications/realtime deferred) |
| i18n UI locales | – | Y | Y | partial_gap | P3 | VOO ships EN/ZH with 4,081-key parity; Figma ships ~15 locales |
| Local-first storage (IDB / FSA / Electron FS) | Y | P | Y | ahead | — | three workspace drivers |

## Canvas & navigation

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Infinite canvas, zoom/pan, fit | Y | Y | Y | parity | — | CanvasKit/Canvas2D dual renderer |
| Multi-page document / artboards | Y | Y | Y | parity | — | page tabs + free artboard placement |
| Rulers + draggable guides | Y | Y | – | gap | P1 | `doc.guides` exists and is snapped; no ruler UI (→ **in progress, task-7**) |
| Pixel grid + snap to grid | Y | Y | P | partial_gap | P1 | grid overlay draws; `snapNodeBounds` options never passed (→ **in progress, task-7**) |
| Smart object spacing / alignment guides | Y | Y | Y | parity | — | 118 snapping tests |
| Find & replace text on canvas | – | Y | Y | parity | — | wave 3: ⌘F bar, live count, case/whole-word, replace/replace-all with one undo entry |
| Command palette / quick actions | ? | Y | Y | parity | — | wave 3: ⌘K palette over command table + shortcut catalog + actions, fuzzy search, recents |
| Viewport culling / spatial index | P | Y | Y | ahead | — | R-tree + frustum culling |

## Tools & selection

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Move / scale / hand / frame / shapes | Y | Y | Y | parity | — | 34 tool ids, family cycling |
| Pen / vector path tools | Y | Y | Y | parity | — | pen, curvature pen, free pen, anchor edit |
| Text tool + on-canvas editing | Y | Y | Y | parity | — | IME + variable fonts |
| Crop / eyedropper / fill | P | Y | Y | parity | — | |
| Brush / eraser / healing / retouch | – | P | Y | ahead | — | 7 brush modes, 4 healing modes |
| Perspective / distort / puppet warp | – | – | Y | ahead | — | geometry exists, untested |
| Marquee / lasso / magnetic / wand | P | Y | Y | ahead | — | colour-range wand + refine |
| Align / distribute / equal spacing | Y | Y | Y | parity | — | 22-case distribution suite |
| Z-order / group / flip / rotate / nudge | Y | Y | Y | parity | — | |
| Select parent / children / select-same | P | Y | P | partial_gap | P2 | parent nav exists; no select-same |
| Copy / paste properties | P | Y | – | gap | P2 | |
| Resize constraints (pin/scale) | P | Y | – | gap | P1 | `content_constraints.js` is lock semantics, not resize constraints |
| Comment tool | P | Y | – | gap | P1 | see comments |

## Vector, text, layout

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Boolean ops (union/subtract/intersect/exclude) | Y | Y | Y | parity | — | 167 vector/boolean tests |
| Stroke model, expand stroke, offset path | Y | Y | Y | ahead | — | |
| Corner radius / per-corner radii | Y | Y | Y | parity | — | |
| Vector masks on paths | – | Y | – | gap | P1 | clipping via `clipTo` only |
| Mesh gradients | Y | – | – | gap | P2 | Pen-only fill type |
| User shader fills (WebGL .glsl) | Y | – | P | partial_gap | P2 | VOO uses GLSL internally only |
| Gradient fills (linear/radial/angular) | Y | Y | Y | parity | — | |
| Text basics / typography / alignment | Y | Y | Y | parity | — | 1,949 Google fonts |
| Text growth / auto sizing | Y | Y | P | partial_gap | P2 | grow modes exist; wrap/min-max incomplete |
| Text on path | – | Y | Y | ahead | — | |
| Named text / paint / effect styles | – | Y | Y | parity | — | wave 3: `doc.styles` paint/text/effect + `node.styleIds`, apply/save/update/detach, `.voo` persistence, 30 tests |
| Variable fonts, font fallback/missing fonts | Y | Y | P | partial_gap | P2 | |
| RTL / bidi / lists / rich text | P | Y | – | gap | P2 | |
| Auto layout (flex) | Y | Y | Y | parity | — | wave 2: wrap, alignContent, min/max, deterministic hug/fill + 34 tests |
| Hug / fill sizing | Y | Y | Y | parity | — | reflow rules + nested pinned-axis resolution implemented |
| Absolute child in auto layout | Y | Y | Y | parity | — | |
| Layout grids | – | Y | – | gap | P2 | |
| Constraints | P | Y | Y | parity | — | wave 3: left/right/leftRight/center/scale + top/bottom/topBottom/center/scale, page-resize reflow, 27 tests |

## Components, variables, styles

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Main components + instances | Y | Y | Y | parity | — | component extract/instance/detach exist, 0 tests |
| Instance overrides (nested) | P | Y | P | partial_gap | P1 | whitelist = text/fill/visible only |
| Component variants + properties | – | Y | – | gap | P1 | Figma-only authoring surface |
| Component slots | Y | Y | – | gap | P2 | Pen schema `slot` |
| Component / team libraries | – | Y | P | partial_gap | P2 | static design-system presets, no publish/update |
| Document variables (color) | Y | Y | Y | parity | — | wave 2: typed variables v2 (color/number/string/boolean), collections, modes, panel + `.voo` persistence |
| Variables: number/string/boolean + collections | Y | Y | P | partial_gap | P1 | model + panel implemented; aliases and auto-layout value binding deferred |
| Variable modes / themes (multi-axis) | Y | Y | P | partial_gap | P1 | modes + active-mode resolution implemented; multi-axis theming UI polish deferred |
| Variable binding UI on any property | Y | Y | P | partial_gap | P2 | |
| Design-system token presets | P | Y | Y | ahead | — | 6 built-in systems + layout skills |
| Figma `.fig` import | – | Y | Y | ahead | — | 19-module importer, 148 tests |
| Figma `.fig` export | – | Y | P | partial_gap | P2 | frames/rect/ellipse + solid fills only |
| Pen `.pen` import | Y | – | – | gap | P0 | **in progress (task-5)** — schema documented in Pen bundle |
| Sketch / PDF / CSV import | – | Y | – | gap | P3/P2 | |

## Effects, image, masks

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Drop/inner shadow, layer + background blur | Y | Y | Y | parity | — | 9 effect kinds |
| Blend modes | Y | Y | Y | ahead | — | 25 modes (16 native + 9 PSD) |
| Adjustment layers | – | P | Y | ahead | — | 21 adjustment kinds |
| Fill/stroke/effect stacks | Y | Y | P | partial_gap | P2 | single fill/stroke in the common model |
| Image import / replace / crop / adjust | Y | Y | Y | parity | — | |
| Background removal (local) | Y | Y | Y | parity | — | on-device matting |
| AI upscale / inpaint / outpaint | P | Y | Y | ahead | — | local ONNX models |
| AI image generation into a fill | Y | Y | P | partial_gap | P2 | provider path stubbed in standalone build |
| Raster mask painting / clipping | P | Y | Y | parity | — | |
| Quick mask / vector mask | – | Y | P/– | gap | P2 | quick-mask data primitives, no UI |
| Stock photo search | Y | P | – | gap | P3 | Pen/Unsplash |

## Motion, prototyping, presentation

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Video layers / media playback | – | P | Y | ahead | — | video layer runtime |
| Animation timeline / keyframes | – | Y | P | partial_gap | P1 | motion timeline targets exist, no editor timeline documented |
| Smart animate | – | Y | – | gap | P2 | |
| Prototype interactions / flows / overlays | – | Y | – | gap | P0 | zero hits for prototype/hotspot models |
| Presentation mode over frames | Y | Y | Y | parity | — | deck viewer + presenter runtime |
| PPTX / PDF deck export | – | P | Y | ahead | — | |

## Export / handoff

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| PNG / JPEG / WebP / SVG / PDF / PSD export | P | Y | Y | ahead | — | PSD + SVG are VOO extras vs Pen |
| Slice / selection / region export | P | Y | Y | ahead | — | |
| HTML / CSS handoff | Y | Y | P | partial_gap | P1 | `documentToHtml` + clipboard only |
| Export design to code (Tailwind / React / CSS) | Y | Y | – | gap | P0 | **in progress (task-6)** |
| Dev-mode inspect panel (measurements, values) | P | Y | P | partial_gap | P1 | context menu copy only |
| Code Connect / framework mappings | – | Y | – | gap | P3 | |
| VS Code / Cursor integration | Y | Y | – | gap | P3 | |

## AI, agent, plugins

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| On-canvas AI agent that edits the document | Y | Y | Y | parity | — | CLI agents + command table + island bar |
| Multi-provider model support | Y | P | Y | ahead | — | 25 provider modules, local models |
| MCP server for external tools | Y | Y | Y | parity | — | `electron/agent_mcp_server.js` |
| Bundled design skills / guides | Y | P | P | partial_gap | P2 | catalog exists; no bundled design skill pack |
| Agent cursor / screenshot verification loop / subagents | Y | Y | – | gap | P2 | |
| Prompt gallery / design guides | Y | P | – | gap | P2 | Pen ships 15 design guides + prompt gallery |
| AI design linter / contrast checks | P | Y | – | gap | P2 | |
| Plugin runtime / third-party API | – | Y | – | gap | P2 | |
| Direct cloud AI in standalone build | P | Y | P | partial_gap | P1 | `provider_client.js` throws in standalone (known) |
| Computer-use / browser automation | – | – | Y | ahead | — | VOO plugin for visible desktop apps |

## Settings, accessibility, performance

| Capability | Pen | Figma | VOO | Verdict | Pri | Note / VOO evidence |
|---|---|---|---|---|---|---|
| Settings dialog / drawer | Y | Y | Y | parity | — | provider, agent, workspace, shortcuts |
| Light / dark interface theme | Y | Y | – | gap | P1 | VOO ships dark chrome only |
| Keyboard-shortcut catalog + modal | Y | Y | Y | parity | — | 62 bindings, searchable modal |
| ARIA labels / focus rings | P | Y | P | partial_gap | P2 | 107 files aria-label; no focus traps |
| Screen-reader announcements | P | Y | – | gap | P3 | |
| Spatial index / render cache / mipmaps | P | Y | Y | ahead | — | 44 performance tests |
| WASM (CanvasKit) renderer | Y | Y | Y | parity | — | |
| Local on-device AI runtime | P | P | Y | ahead | — | ONNX Runtime Web |
