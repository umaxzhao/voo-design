# VOO Design Native

A **1:1 native macOS replication of [VOO Design](../README.md)** — a vector & raster design
editor — built without Electron, Chromium, WebAssembly or any third-party dependency:
**Swift 6 + AppKit + CoreGraphics + Metal**, packaged as a self-contained `.app` of ~5 MB.

```
native_studio/
├── Sources/
│   ├── Main.swift                     # NSApplication entry point, snapshot/maintenance hooks
│   ├── Models/                        # VOODocument, VOONode, LayerStyle, serialization (.voo JSON)
│   ├── Engine/                        # Geometry, Bezier fitter, boolean topology, Metal pipeline,
│   │                                  # raster brush, command/undo stack, clipboard, document IO,
│   │                                  # ExportEngine (PNG/JPG/PDF/SVG)
│   ├── Canvas/                        # Canvas stage viewport, rulers, snapping, transform handles,
│   │                                  # shape/artboard/pen creation, inline text editing overlay
│   └── UI/                            # TitleBar, ToolRail, Inspector/Properties, Layers, EditorChrome
│                                      # (page pill / zoom bar / island bar / AI FAB), WelcomeDashboard,
│                                      # OnboardingGuide, AgentPanel, SettingsDrawer, menus
├── Resources/                         # App icon + onboarding cover art
├── tests/                             # 336 opaque-box E2E tests (4 tiers + real-event canvas suite) + runner
├── build.sh                           # One-shot swiftc build → VOO Design Native.app
├── docs/screenshots/                  # Native app screenshots (parity evidence)
├── INTERACTION_PARITY.md              # Editor interaction parity audit (aligned / partial / missing)
├── UI_SPEC.md                         # Measured spacing / margin / icon spec (Web ⇄ native)
└── TEST_READY.md                      # Test-suite publication / acceptance gate
```

## Build & run

```bash
cd native_studio
./build.sh                 # compiles, signs ad-hoc, verifies size gates
open "build/VOO Design Native.app"
```

Packaging gates enforced by `build.sh`:

| Artifact | Limit | Actual |
| :--- | ---: | ---: |
| Executable binary | ≤ 5 MB | **~3.5 MB** |
| `.app` bundle | ≤ 35 MB | **~5.1 MB** |
| Cold launch (window ready) | < 0.1 s target | **~0.14 s** |

## What is replicated

| VOO Design (web/Electron) | Native studio |
| :--- | :--- |
| Mint-on-black gradient title bar, document tab + `+`, 保存/打开/bolt | `AppTitleBar` with tab pill, close/new tab, white save pill, settings bolt |
| Welcome dashboard (search, workspace bar, category pills, prompt composer, imports, recents, drafts/starred/trash, design systems, shortcuts) | `WelcomeDashboardView` — custom-drawn, fully interactive |
| Floating tool rail with active white circular tool | `ToolRailView` — 8 tools + hand/lasso/wand + VOO avatar (AI entry) |
| Floating left **LAYERS** card (checkboxes, kind glyphs, opacity/blend menus, footer add/mask/group/delete, drag reorder) | `LayersPanelView` |
| Right **PROPERTIES** card (252×368, color wheel + hex + radius, scrolls to transform/appearance) | `InspectorView` + `PropertiesPanelView` |
| Bottom-left page pill, silver zoom cluster, selection **island bar**, purple AI FAB | `EditorChrome.swift` views |
| 4-step first-launch onboarding (workspace / agent / probe / ready) | `OnboardingGuideView` with cover art and persisted completion |
| Settings & Preferences modal (General / AI Assistant / AI Providers / Shortcuts) | `SettingsDrawerView` |
| AI agent side panel (376 px, suggestions, composer) | `AgentPanelView` |
| Canvas tools: rectangle/ellipse drag, artboard drag, pen bezier paths, text tool + inline text editing, arrow nudge, delete | `CanvasStageView` + `TextEditingOverlay` |
| Freehand brush + eraser with persistent paint layer (undoable PNG layer) | `CanvasStageView` paint engine |
| Vector node editing (anchor/handle drag, corner types, delete anchor), rotated selection frame, multi-selection transform | `CanvasStageView` + `TransformHandlesView` |
| Lasso select, magic wand (same fill), hand/pan tool | `CanvasStageView` + `ToolRailView` |
| Image import (file menu / drag & drop / clipboard paste), in-canvas image rendering + export | `ImageImporter` + `CanvasStageView` + `ExportEngine` |
| Full text typography (family/size/weight/align/line-height/letter-spacing) | `PropertiesPanelView` + `TextStyleResolver` |
| Real local CLI agents (Claude Code / OpenAI Codex / Antigravity / OpenCode / DeepSeek Harness) with streamed replies | `LocalCLIBridge` + `AgentPanelView` |
| Workspace directory management (.voo/.fig/.psd/.svg scanner, subfolders, recoverable .trash with manifest, rename, duplicate, star, file watcher) | `WorkspaceManager` + `WelcomeDashboardView` + `SettingsDrawerView` |
| Multi-select move, undoable drag/resize/rotate, right-click menus (canvas + layers + project cards), align/distribute, grid & snapping toggles, 16 blend modes in-canvas | `CanvasStageView` + `WindowController` |
| Text layer typography (font family + size) in PROPERTIES | `PropertiesPanelView` |
| Export dialog (PNG / JPG / PDF / SVG, 1x–4x) | `ExportEngine` + native export sheet |
| `.voo` document format, undo/redo, boolean ops, bezier nodes, blend modes, brush, snapping, rulers, 8-point transform | native `Engine` + `Canvas` (pure CoreGraphics/Metal) |

Screenshots: [`dashboard.png`](docs/screenshots/dashboard.png) ·
[`editor-empty.png`](docs/screenshots/editor-empty.png) ·
[`editor-selected.png`](docs/screenshots/editor-selected.png) ·
[`editor-content.png`](docs/screenshots/editor-content.png) ·
[`text-editing.png`](docs/screenshots/text-editing.png) ·
[`text-properties.png`](docs/screenshots/text-properties.png) ·
[`text-typography.png`](docs/screenshots/text-typography.png) ·
[`node-editing.png`](docs/screenshots/node-editing.png) ·
[`settings.png`](docs/screenshots/settings.png) ·
[`agent-panel.png`](docs/screenshots/agent-panel.png) ·
[`onboarding-step1.png`](docs/screenshots/onboarding-step1.png).

Interaction parity audit (what matches the web editor and what is still missing):
[`INTERACTION_PARITY.md`](INTERACTION_PARITY.md).

Pixel spec for spacing, margins and icon sizes across every UI component:
[`UI_SPEC.md`](UI_SPEC.md) (measured from the live web build at 1440×900).

## Tests

```bash
cd native_studio
./tests/run_tests.sh            # 377 tests, 4 tiers + canvas interaction, workspace & quality suite, 100% pass
./tests/run_tests.sh --verbose
./tests/run_tests.sh --tier 2
./tests/run_tests.sh --filter UIParity
```

The runner compiles the test suite against the production `Sources/` when the full engine is
present (integrated mode) and falls back to the reference oracle in `tests/Support/`.

## Environment hooks (automation / snapshots)

| Variable | Effect |
| :--- | :--- |
| `VOO_SKIP_ONBOARDING=1` | Never show the first-launch guide |
| `VOO_SHOW_EDITOR=1` | Skip the dashboard and open the editor |
| `VOO_NEW_PROJECT=1` | Open a fresh `Design 1` document (web “New”) |
| `VOO_OPEN_AGENT=1` | Open the AI agent side panel |
| `VOO_OPEN_SETTINGS=1` + `VOO_SETTINGS_TAB=general\|aiAssistant\|aiProviders\|shortcuts` | Open Settings on a tab |
| `VOO_ONBOARDING_STEP=0…3` | Present the guide at a specific step |
| `VOO_SNAPSHOT_CONTENT=1` / `VOO_SNAPSHOT_TEXT_EDIT=1` | Add a demo shape + text / open inline text editing |
| `VOO_SNAPSHOT_TYPO=1` / `VOO_SNAPSHOT_PATH_EDIT=1` / `VOO_SNAPSHOT_IMAGE=…` | Style the demo text / show the path-editing overlay / import an image |
| `VOO_SNAPSHOT_PATH=…` + `VOO_AUTO_TERMINATE=1` | Render the window to a PNG and exit |
| `VOO_AUTO_TERMINATE_MS=…` | Quit after N ms (latency/memory benchmarks) |
| `VOO_HEADLESS=1` | Accessory activation policy for CI |

## Keyboard shortcuts

`V` move · `F` frame · `P` pen · `B` brush · `E` eraser · `T` text · `R` shapes · `A` artboard ·
hand / lasso / magic-wand buttons in the tool rail ·
`⇧` constrain while drawing · `⌥` ellipse while drawing · space+drag pan · ⌘+/⌘- zoom · ⌘0 fit ·
⌘1 100% · ⌘Z / ⇧⌘Z undo/redo · ⌘S save · ⌘⇧S save as · ⌘O open · ⌘N new · ⌘E export ·
⌘G/⇧⌘G group/ungroup · ⌘\ AI panel · ⌘, settings · arrows nudge (⇧ = 10pt) · Delete remove ·
`Esc` cancel creation / dismiss overlays.
