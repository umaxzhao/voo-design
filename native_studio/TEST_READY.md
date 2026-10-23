# TEST_READY: VOO Design Native Studio E2E Test Suite

**Owner**: Native Studio engineering team (Lead + teammates)
**Target Repository**: `/Users/tt/teamwork_projects/voo_design/native_studio`
**Test Suite Path**: `/Users/tt/teamwork_projects/voo_design/native_studio/tests`
**Execution Script**: `/Users/tt/teamwork_projects/voo_design/native_studio/tests/run_tests.sh`
**Status**: APPROVED & READY FOR M6 ACCEPTANCE GATE
**Last updated**: 2026-10-21 (UI parity + interactions + spacing/icon alignment + real-event canvas recovery pass)

---

## 1. Executive Declaration

The opaque-box E2E test suite for **VOO Design Native Studio** is fully engineered, compiled and
verified. It establishes the acceptance criteria for the original 18 engine/UI features (F1–F18)
**plus the 1:1 VOO Design UI parity surfaces** (title-bar tab bar, editor chrome, PROPERTIES card,
onboarding guide, agent panel, dashboard) **and the functional round-3 tools** (shape/artboard/pen
creation hooks, inline text editing, layers interactions, export formats, transform-handle
coordinate alignment, undoable canvas drags/resize/rotate, context menus, align/distribute,
grid/snapping toggles, text typography, vector node editing, rotated/multi-selection transform,
image import, a real local-CLI bridge, pixel-level spacing/margin/icon alignment, and a real-event
canvas interaction regression suite (tool wiring, drawing, selection, resize, text, pen, brush/eraser,
layers, undo).

All **336 test cases pass** with a **100.0% pass rate**, returning **Exit Code 0**, above the
mandatory project threshold (≥ 207 test cases).

```
================================================================================
                             TEST RESULTS SUMMARY
================================================================================
Tier & Feature Category                   Total     Passed    Failed    Pass Rate
--------------------------------------------------------------------------------
Tier 1: Feature Coverage (F1-F18 + UI)    211       211       0          100.0%
Tier 2: Boundary & Corner Cases           92        92        0          100.0%
Tier 3: Cross-Feature Combinations        23        23        0          100.0%
Tier 4: Real-World Scenarios              10        10        0          100.0%
--------------------------------------------------------------------------------
TOTAL                                     336       336       0          100.0%
================================================================================
Execution Time: ~0.5 seconds
✓ ALL 336 TESTS PASSED CLEANLY (>= 207 THRESHOLD MET, Exit Code 0)
```

---

## 2. Test Suite Architecture & File Catalog

```
native_studio/
├── tests/
│   ├── run_tests.sh                      # Shell runner (auto / integrated / standalone)
│   ├── TestHarness.swift                 # Assertion helpers, registry, runner
│   ├── main.swift                        # Entry point, CLI args, summary table
│   ├── Support/
│   │   ├── ReferenceModels.swift         # Canonical VOODocument, NodeKind, LayerStyle
│   │   ├── ReferenceCommandEngine.swift  # CommandManager, 1000-level stack
│   │   ├── ReferenceGeometryEngine.swift # Cubic Bezier, 5 Booleans, Curve Fitter
│   │   ├── ReferenceRasterPipeline.swift # 16 Blend modes, Nozzle dab buffer
│   │   └── ReferenceUIStudio.swift       # VOO Dark theme, Rulers, Handles, Snap, A11y
│   ├── Tier1_FeatureCoverageTests.swift  # 92 feature coverage tests (F1-F18)
│   ├── Tier2_BoundaryCornerTests.swift   # 92 boundary & corner tests (F1-F18)
│   ├── Tier3_CrossFeatureTests.swift     # 20 pairwise cross-feature tests
│   ├── Tier4_RealWorldScenarioTests.swift# 10 real-world end-to-end scenarios
│   ├── UIParityTests.swift               # 109 VOO 1:1 parity + spacing regression tests
│   ├── CanvasInteractionTests.swift      # 13 real-document canvas interaction tests (WindowController + events)
│   └── TEST_READY.md                     # This publication document
└── README.md                             # Build / run / feature map
```

---

## 3. Feature Coverage Matrix

### 3.1 Engine & core studio (F1–F18, unchanged)

| # | Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Total |
|---|---|:---:|:---:|:---:|:---:|:---:|
| F1 | VOO Document Model & SerDe | 5 | 5 | 2 | 2 | 14 |
| F2 | Atomic Command Transaction Engine | 5 | 5 | 3 | 2 | 15 |
| F3 | Pure Native Build & Packaging System | 5 | 5 | 1 | 0 | 11 |
| F4 | Cubic Bezier & Node Handle Dynamics | 5 | 5 | 2 | 2 | 14 |
| F5 | 5-Operation Boolean Topology Engine | 5 | 5 | 3 | 2 | 15 |
| F6 | Schneider Curve Fitting Engine | 5 | 5 | 2 | 1 | 13 |
| F7 | Metal Runtime JIT Render Pipeline | 5 | 5 | 1 | 1 | 12 |
| F8 | 16 Core Blend Modes | 5 | 5 | 2 | 1 | 13 |
| F9 | Dynamic Nozzle Raster Brush Pipeline | 5 | 5 | 2 | 1 | 13 |
| F10 | VOO Dark Theme & Custom Controls | 5 | 5 | 1 | 1 | 12 |
| F11 | AppTitleBar & Window Chrome | 5 | 5 | 2 | 1 | 13 |
| F12 | ToolRail & Tool Key Switching | 5 | 5 | 1 | 1 | 12 |
| F13 | Inspector Studio Panels | 5 | 5 | 3 | 1 | 14 |
| F14 | Dual Adaptive Pixel Rulers | 5 | 5 | 2 | 1 | 13 |
| F15 | Magnetic Snapping Guidelines | 5 | 5 | 2 | 1 | 13 |
| F16 | 8-Point Transform Handles & Stalk | 5 | 5 | 2 | 1 | 13 |
| F17 | Native Viewport Gestures & Shortcuts | 5 | 5 | 2 | 1 | 13 |
| F18 | Automated Accessibility Identifiers | 5 | 5 | 1 | 0 | 11 |
| Bonus | Cross-subsystem & multi-feature coverage | 2 | 2 | 0 | 0 | 4 |
| **Subtotal** | | **92** | **92** | **20** | **10** | **214** |

### 3.2 VOO 1:1 UI parity (F19–F23, `UIParityTests.swift`)

| # | Feature | Tier | Tests |
|---|---|---:|:---:|
| F19 | Title-bar document tab bar (Untitled.voo default, dashboard/editor modes, 保存/打开/bolt, delegate actions) | 1 | 7 |
| F20 | Tool rail VOO avatar entry + tool switching/accessibility | 1 | 4 |
| F21 | Editor chrome: page pill, silver zoom cluster, AI FAB, selection island bar (18 glyphs, callbacks, disabled states) | 1 | 11 |
| F22 | PROPERTIES card wiring + inspector visibility contract (legacy panels preserved) | 1 | 3 |
| F23 | AI agent panel (composer round-trip, message count, header callbacks, a11y) | 1 | 5 |
| F24 | 4-step onboarding guide (step clamping, launch policy, persistence, navigation) | 1 | 6 |
| F25 | Welcome dashboard 1:1 (construction at two sizes, all callback hooks, real hit targets) | 1 | 2 |
| — | Composite chrome render + dashboard-mode composition | 3 | 2 |
| **Subtotal** | | | **40** |

### 3.3 Functional tools, output & interaction fixes (F26–F31, `UIParityTests.swift` round 3)

| # | Feature | Tier | Tests |
|---|---|---:|:---:|
| F26 | Multi-format export engine (PNG/JPG/PDF/SVG; 1x–4x scale, transparency, magic-byte validation) | 1 | 6 |
| F27 | Canvas creation hooks (shape/artboard/pen/text; creation state, preview overlay, cancel semantics) | 1 | 4 |
| F28 | Transform-handle coordinate alignment (`viewRect` pan/zoom/ruler regression, 9-point hit testing) | 1 + 3 | 4 |
| F29 | Layers panel interactions (new callbacks, footer/header actions, identifiers, selected node) | 1 | 4 |
| F30 | Inline text editing overlay (`defaultTextNode`, `editorFrame` math, commit/cancel-once lifecycle) | 1 | 4 |
| **Subtotal** | | | **22** |

### 3.4 Interaction upgrades (F31–F34, round 4)

| # | Feature | Tier | Tests |
|---|---|---:|:---:|
| F31 | Undoable canvas gestures — move/handle commit hooks, multi-select drag, context-menu provider, grid/snapping state, 16-mode canvas blend mapping | 1 | 5 |
| F32 | Layers row context menu + duplicate callback + selection helper | 1 | 4 |
| F33 | Text typography — font family/size callbacks, a11y ids, Inspector mirroring, default delegate method | 1 | 4 |
| F34 | Menu surface for grid/snapping/align/distribute | 1 | 1 |
| **Subtotal** | | | **14** |

### 3.5 Advanced editing & local AI (F35–F41, round 5)

| # | Feature | Tier | Tests |
|---|---|---:|:---:|
| F35 | Text formatting model + PROPERTIES controls (weight/align/line-height/letter-spacing, legacy JSON decode) | 1 | 6 |
| F36 | Shared TextStyleResolver (weights/alignment/line-height/kern/font resolution) | 1 | 2 |
| F37 | Image import pipeline (data-URL embedding, fitted rect, validation, decode) | 1 | 3 |
| F38 | Vector path-editing overlay + rotated/multi-selection handle API | 1 | 2 |
| F39 | LocalCLIBridge (agents, detection, missing-binary event contract) | 1 | 2 |
| F40 | Agent panel streaming lifecycle + error bubble | 1 | 2 |
| F41 | Import-image menu surface | 1 | 1 |
| **Subtotal** | | | **18** |

### 3.6 Spacing / margin / icon alignment (F42, round 6)

| # | Feature | Tier | Tests |
|---|---|---:|:---:|
| F42 | Pixel spec regression for title bar, tool rail, editor chrome, inspector/layers/properties, agent panel, modals and canvas chrome (frames ±1.5pt) | 1 | 15 |
| **Subtotal** | | | **15** |

### 3.7 Real-event canvas interaction (F43, round 7)

| # | Feature | Tier | Tests |
|---|---|---:|:---:|
| F43 | Tool buttons/keys drive canvas.activeTool; shape/artboard/pen/text creation via synthesized mouse events; click-select & drag-move with undo; handle resize; brush/eraser persistent paint layer; accessory tools; space-pan/zoom bar; layer add/delete; context menu | 1 | 13 |
| **Subtotal** | | | **13** |

---

## 4. How to Execute the Test Suite

```bash
cd /Users/tt/teamwork_projects/voo_design/native_studio
./tests/run_tests.sh                # Full suite: 336 tests
./tests/run_tests.sh --verbose      # Every test name + duration
./tests/run_tests.sh --tier 1       # Tier 1 only
./tests/run_tests.sh --filter UIParity
./tests/run_tests.sh --filter Boolean
./tests/run_tests.sh --standalone   # Reference oracle only
./tests/run_tests.sh --integrated   # Force compile against Sources/
```

### Environment isolation notes

* Onboarding tests set `VOO_SKIP_ONBOARDING` and `UserDefaults["voo.onboarding.completedVersion"]`
  inside `defer` blocks; no `voo.*` keys leak out of the run.
* The suite runs headless via `NSApplication.shared` accessory activation policy — no window server
  focus is required.
* `run_tests.sh` compiles against the live `Sources/` tree, so it doubles as the integration gate
  for engine + UI changes.

---

## 5. Milestone M6 Acceptance Gate

Running `./tests/run_tests.sh` against the current `Sources/` must yield:

1. Compilation: 0 errors, 0 warnings.
2. Total Tests: ≥ 207 (336 registered).
3. Pass Rate: **100.0%** (0 failures).
4. Exit Code: `0`.

Packaging gates (`./build.sh`):

1. `swiftc` build succeeds (0 errors) with AppKit/CoreGraphics/Metal frameworks.
2. Executable ≤ 5 MB (currently ~2.5 MB).
3. `.app` bundle ≤ 35 MB (currently ~4.0 MB).
4. Ad-hoc code signature verifies (`codesign --verify --deep --strict`).
