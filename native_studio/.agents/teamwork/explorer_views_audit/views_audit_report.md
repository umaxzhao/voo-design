# Comprehensive Views Icon Usage Audit Report
**native_studio Icon Canonicalization & Vector Alignment**
**Date**: 2026-10-21
**Auditor**: Teamwork Explorer (Views Icon Usage Auditor)
**Integrity Mode**: Development / Read-Only Investigation

---

## 1. Executive Summary

This audit conducted an exhaustive scan across all 41 Swift source files in `native_studio/Sources/`, examining every vector icon, secondary glyph factory, ad-hoc `CGPath`/`NSBezierPath` routine, and `NSImage` usage against VOO Design's web reference icon suite (`../src/canvas/icons.jsx`, Lucide-based 24×24, stroke 1.5 default, round linecap and round linejoin) and `UI_SPEC.md`.

### Key Metrics
- **Total Swift Files Audited**: 41 files in `Sources/` (`UI/`, `Canvas/`, `Engine/`, `Models/`, `Main.swift`).
- **Existing `VooIconFactory` Methods**: 50 drawing methods in `Sources/UI/Icons.swift`.
- **Secondary / Inline Glyph Enums Audited**: 4 major factories (`PropertiesGlyphFactory`, `LayersGlyphDrawing`, `SettingsGlyph`, `AgentGlyphDrawing`).
- **Ad-Hoc / Custom Vector Drawings Found**: 24 distinct non-standard drawing routines across 7 files.
- **`NSImage(systemSymbolName:)` Call Sites**: 1 instance (`WindowController.swift:2216`, `"rectangle.on.rectangle"` in `showPageSwitcherMenu()`).
- **`NSImage(named:)` Call Sites**: 0 (Clean).
- **Consolidation Potential**: Complete elimination of `PropertiesGlyphFactory`, `LayersGlyphDrawing`, and private `draw*Icon` methods by expanding `VooIconFactory` with missing canonical Lucide glyphs and delegating all call sites directly to `VooIconFactory`.

---

## 2. Deep-Dive Audit of Secondary Factories & Drawing Utilities

### 2.1 `Sources/UI/PropertiesPanelView.swift` (`PropertiesGlyphFactory`)
`PropertiesGlyphFactory` is a private/internal enum (lines 124–224) authored with a hardcoded 16×16 coordinate space and custom vector paths that diverge from Lucide:
- **`.settings`** (Lines 148–155): Renders an ad-hoc rounded rectangle (`3×3` to `13×13`) with a filled center dot (`6.3×6.3`, r=1.7). Used by `settingsButton` (line 1261) for the properties preset/settings affordance.
  - *Canonical Lucide*: `Settings` (`IconSettings` in `icons.jsx`, line 69) or `SlidersHorizontal` (`IconSliders`, line 45).
  - *VooIconFactory Status*: **Missing** (Needs `drawSettings(in:color:strokeWidth:)`).
- **`.transfer`** (Lines 156–173): Renders two opposing horizontal arrows with ad-hoc arrowheads. Used by `transferButton` (line 1262) and `swapButton` (line 1268, "Swap fill and stroke").
  - *Canonical Lucide*: `IconSwap` in `icons.jsx` (lines 166–196).
  - *VooIconFactory Status*: **Missing** (Needs `drawSwap(in:color:strokeWidth:)`).
- **`.eyedropper`** (Lines 174–202): Renders an ad-hoc diagonal pipette with a stroked stem, filled triangular tip, rectangular body, and bulb. Used by `eyedropperButton` (line 1270).
  - *Canonical Lucide*: `Pipette` (`IconPipette` in `icons.jsx`, line 402).
  - *VooIconFactory Status*: **Missing** (Needs `drawPipette(in:color:strokeWidth:)`).
- **`.cornerRadius`** (Lines 203–212): Renders a solid quarter-disc wedge using `addArc` (startAngle $\pi/2$, endAngle 0, radius 7.6, filled). Used by `radiusPill` (line 1406).
  - *Canonical Lucide*: `IconCornerRadius` in `icons.jsx` (lines 249–272, stroked rounded corner curve).
  - *VooIconFactory Status*: **Missing** (Needs `drawCornerRadius(in:color:strokeWidth:)`).
- **`.chevronDown`** (Lines 213–220): Ad-hoc chevron pointing down. Used by `PropertiesDropdownButton` (line 1030).
  - *Canonical Lucide*: `ChevronDown` (`IconChevronDown` in `icons.jsx`, line 38).
  - *VooIconFactory Status*: **Exists** (`drawChevronDown` in `Icons.swift:802`). `PropertiesGlyphFactory` currently duplicates this code.

### 2.2 `Sources/UI/LayersPanel.swift` (`LayersGlyphDrawing`)
`LayersGlyphDrawing` (lines 135–286) contains a mix of delegations and ad-hoc vector drawing routines:
- **Delegated to `VooIconFactory`**: `.search` (`drawSearch`), `.sliders` (`drawSliders`), `.plus` (`drawPlus`), `.contrast` (`drawContrast`), `.trash` (`drawTrash`), `.frame` (`drawFrame`), `.text` (`drawText` with manual coordinate unflip).
- **`.sortArrows`** (Lines 149–174): Ad-hoc opposing horizontal arrows with stroke line segments. Used by `sortButton` (line 1025). Matches web `IconSwap` (`editor_layers.jsx:910`).
  - *Canonical Lucide*: `IconSwap` in `icons.jsx`.
  - *VooIconFactory Status*: **Missing** (Needs `drawSwap`).
- **`.mask`** (Lines 215–227): Ad-hoc rounded frame (`3, 4, 18, 16`) with a filled half-disc arc (radius 5.5). Diverges from web `IconMask` which renders a full filled circle (radius 4) inside a rounded rectangle.
  - *Canonical Lucide*: `IconMask` in `icons.jsx` (lines 198–220).
  - *VooIconFactory Status*: **Missing** (Needs `drawMask`).
- **`.folder`** (Lines 228–240): Ad-hoc polygon outline (`(3,8)-(3,6)-(9,6)-(11,8)-(21,8)-(21,19)-(3,19)`). Used for `.group` layer rows.
  - *Canonical Lucide*: `Folder` (`IconFolder` in `icons.jsx`, line 91).
  - *VooIconFactory Status*: **Missing** (Needs `drawFolder`).
- **`.chevronDown`** (Lines 241–248): Ad-hoc duplicate of `drawChevronDown`.
  - *VooIconFactory Status*: **Exists** (Should delegate to `VooIconFactory.drawChevronDown`).
- **`.diamond`** (Lines 249–258): Ad-hoc 4-point diamond polygon (`(12,3)-(21,12)-(12,21)-(3,12)`). Used for `.boolean` and fallback layer rows.
  - *Canonical Lucide*: `Diamond` (`IconDiamond` in `icons.jsx`, line 21, which has rounded corners).
  - *VooIconFactory Status*: **Missing** (Needs `drawDiamond`).
- **`.penCurve`** (Lines 259–269): Ad-hoc cubic curve with two filled circle endpoints (`(2,17,4,4)` and `(18,3,4,4)`). Used for `.path` layer rows.
  - *Canonical Lucide*: `Spline` (`IconBend` in `icons.jsx`, line 15: `<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>`).
  - *VooIconFactory Status*: **Missing** (Needs `drawSpline`).
- **`.square`** (Lines 270–276): Ad-hoc rounded rect `(4, 4, 16, 16)`, corner 3.
  - *Canonical Lucide*: `Square` (`IconSquare` in `icons.jsx`, line 389: `x=3 y=3 width=18 height=18 rx=2`).
  - *VooIconFactory Status*: **Needs Update** (`drawRect` exists at line 1260 with `3.5, 3.5, 17, 17`; should align to Lucide 24x24).
- **`.circle`** (Lines 277–279): Ad-hoc ellipse in `(3.5, 3.5, 17, 17)`.
  - *Canonical Lucide*: `Circle` (`IconCircle` in `icons.jsx`, line 390: `cx=12 cy=12 r=10`).
  - *VooIconFactory Status*: **Needs Update** (`drawEllipse` exists at line 1278; should align to center 12,12 radius 10).

### 2.3 `Sources/UI/WelcomeDashboardView.swift` (Private `draw*Icon` Methods)
`WelcomeDashboardView.swift` maintains 5 private ad-hoc icon drawing methods:
- **`drawFolderIcon`** (Lines 1801–1827): Custom folder with quad curves and lines. Used at lines 947 (workspace row), 1072 (toolbar pill), 1109 (open button).
  - *Canonical Lucide*: `Folder` (`IconFolder` in `icons.jsx`, line 91).
  - *VooIconFactory Status*: **Missing** (Needs `drawFolder`).
- **`drawStarIcon`** (Lines 1829–1854): Custom 5-pointed star path with manual vertex offsets. Used at lines 988 (starred tab), 1554 (empty state starred).
  - *Canonical Lucide*: `Star` (`IconStar` in `icons.jsx`, line 395).
  - *VooIconFactory Status*: **Needs Update** (`VooIconFactory.drawStar` exists at line 1336 but uses a trigonometric loop instead of the canonical Lucide polygon vertices; WelcomeDashboardView should delegate).
- **`drawRefreshIcon`** (Lines 1856–1885): Custom 285° circular arc with arrowhead. Used at line 1091 (toolbar rescan button).
  - *Canonical Lucide*: `RefreshCw` (`IconRefresh` in `icons.jsx`, line 64) or `RotateCcw` (`IconRestart`, line 63).
  - *VooIconFactory Status*: **Missing** (Needs `drawRefresh`).
- **`drawFigmaIcon`** (Lines 1887–1929): Ad-hoc drawing of Figma's 5-shape logo mark. Used at line 1306 (import card).
  - *Canonical Lucide*: Figma Brand Logo.
  - *VooIconFactory Status*: **Missing** (Needs `drawFigma`).
- **`drawImageIcon`** (Lines 1931–1956): Custom landscape mountain and sun drawing in rounded rect `(3, 3.5, 18, 17)`. Used at line 1310 (import card).
  - *Canonical Lucide*: `Image` (`IconImage` in `icons.jsx`, line 73).
  - *VooIconFactory Status*: **Missing** (Needs `drawImage`).

### 2.4 `Sources/UI/WindowController.swift`
- **Line 2216**: `item.image = NSImage(systemSymbolName: "rectangle.on.rectangle", accessibilityDescription: nil)` inside `showPageSwitcherMenu()`.
  - *Defect*: Violates Requirement R3 ("eliminate any usage of `NSImage(systemSymbolName:)`") and Acceptance Criteria ("No `NSImage(systemSymbolName:)` calls remain in application UI components").
  - *Canonical Lucide*: `Copy` (`IconCopy`, line 88) or `Layers` (`IconLayers`, line 698) or `Frame` (`IconFrame`, line 60).
  - *Solution*: Add a standard `VooIconFactory.image(...) -> NSImage` helper that draws canonical vector icons directly into `NSImage(size:flipped:drawingHandler:)`, replacing the system symbol call.

---

## 3. Audit of Other Views in `Sources/`

### 3.1 `Sources/UI/ToolRail.swift`
- **`ToolButton.draw`** (Lines 210–227):
  - `.move` -> `VooIconFactory.drawCursor` (**Exists**, Lucide `MousePointer2`)
  - `.node` -> `VooIconFactory.drawFrame` (**Exists**, Lucide `Frame`)
  - `.pen` -> `VooIconFactory.drawPen` (**Exists**, Lucide `PenTool`)
  - `.shapes` -> `VooIconFactory.drawShapes` (**Exists**, Rectangle + Circle)
  - `.brush` -> Calls `VooIconFactory.drawMarquee` (**Anomaly!** Draws dashed marquee box instead of paintbrush; should use Lucide `Brush` / `Paintbrush` `IconBrush` / `IconPaint`)
  - `.eraser` -> `VooIconFactory.drawEraser` (**Exists**, Lucide `Eraser`)
  - `.text` -> `VooIconFactory.drawText` (**Exists**, Lucide `Type`)
  - `.artboard` -> `VooIconFactory.drawCube` (**Exists**, Lucide `Box`)
- **`ToolRailAccessoryButton.draw`** (Lines 318–347):
  - `.hand`: Lines 320–328, ad-hoc rounded palm + 3 finger tick lines. (Lucide: `Hand` / `Grab`. Status: **Missing**).
  - `.lasso`: Lines 329–333, ad-hoc stroke ellipse + line. (`VooIconFactory.drawLasso` exists at line 1448; should delegate!).
  - `.wand`: Lines 334–346, ad-hoc diagonal line + 2 cross ticks. (Lucide: `Wand2` `IconWand`. Status: **Missing**).
- **`ToolRailBrandAvatarButton.draw`** (Line 397):
  - Calls `VooIconFactory.drawBrandLogo(in: logoRect, color: .white)` (**Exists**, Canonical Brand Logo).

### 3.2 `Sources/UI/EditorChrome.swift`
- **`EditorChromeGlyph.draw`** (Lines 95–134):
  - `.page` (Lines 158–181): Ad-hoc folded page document. (Lucide `FileText`. `VooIconFactory.drawFileText` **exists** at line 395; should delegate).
  - `.chevronDown`: Delegates to `VooIconFactory.drawChevronDown` (**Exists**).
  - `.undo`: Delegates to `VooIconFactory.drawUndo` (**Exists**).
  - `.redo`: Delegates to `VooIconFactory.drawRedo` (**Exists**).
  - `.grid`: Delegates to `VooIconFactory.drawGrid` (**Exists**).
  - `.magnet` (Lines 183–229): Ad-hoc rotated U-magnet. (Lucide `Magnet` `IconMagnet`. Status: **Missing**).
  - `.plus`: Delegates to `VooIconFactory.drawPlus` (**Exists**).
  - `.minus`: Delegates to `VooIconFactory.drawMinus` (**Exists**).
  - `.marquee` (Lines 231–241): Ad-hoc dashed box. (`VooIconFactory.drawMarquee` **exists**; should delegate).
  - `.rotate` (Lines 243–296): Ad-hoc 295° circular arc + arrowhead. (Lucide `RotateCcw` / `IconRestart`. Status: **Missing**).
  - `.flipVertical` (Lines 298–330): Ad-hoc dashed line + triangles. (`VooIconFactory.drawFlipV` **exists** at line 1511; should delegate).
  - `.flipHorizontal` (Lines 332–364): Ad-hoc dashed line + triangles. (`VooIconFactory.drawFlipH` **exists** at line 1473; should delegate).
  - `.copy`: Delegates to `VooIconFactory.drawCopy` (**Exists**).
  - `.lock`: Delegates to `VooIconFactory.drawLock` (**Exists**).
  - `.trash`: Delegates to `VooIconFactory.drawTrash` (**Exists**).
  - `.diamond` (Lines 366–378): Ad-hoc 4-point diamond. (Lucide `Diamond`. Status: **Missing**).
  - `.sparkle` (Lines 380–406): Ad-hoc 4-point sparkle + corner crosses. (Lucide `Sparkles` `IconSparkles`. Status: **Missing**).
  - `.arrowUp`: Delegates to `VooIconFactory.drawArrowUp` (**Exists**).
- **Line 1803**: `VooIconFactory.drawBrandLogo(in: logoRect, color: .black)` (**Exists**).

### 3.3 `Sources/UI/TitleBar.swift`
- **`DarkTabButton.draw`** (Lines 314–371):
  - `.close` (Lines 319–334): Ad-hoc X line segments. (Lucide `X` `IconClose`. Status: **Missing**).
  - `.plus` (Lines 335–349): Ad-hoc plus line segments. (`VooIconFactory.drawPlus` **exists**; should delegate).
  - `.settings` (Lines 350–370): Ad-hoc 6-point lightning bolt polygon. (Lucide `Bolt` `IconBolt` or `Zap` `IconZap`. `VooIconFactory.drawZap` **exists**; if Bolt is preferred, `drawBolt` is missing).
- **Line 715**: `VooIconFactory.drawBrandLogo(in: logoRect, color: .black)` (**Exists**).

### 3.4 `Sources/UI/SettingsDrawerView.swift`
- **`SettingsGlyph.draw`** (Lines 360–401):
  - `.sliders`: Delegates to `VooIconFactory.drawSliders` (**Exists**).
  - `.sparkle` (Lines 420–445): Ad-hoc sparkle with quad curves. (Lucide `Sparkles`. Status: **Missing**).
  - `.keyboard` (Lines 447–474): Ad-hoc keyboard frame + 2 rows of key ticks. (Lucide `Keyboard`. Status: **Missing**).
  - `.close` (Lines 476–486): Ad-hoc X lines. (Lucide `X` `IconClose`. Status: **Missing**).
  - `.folder` (Lines 489–516, `open: false`): Ad-hoc folder. (Lucide `Folder`. Status: **Missing**).
  - `.folderOpen` (Lines 489–516, `open: true`): Ad-hoc folder open. (Lucide `FolderOpen`. Status: **Missing**).
  - `.refresh` (Lines 518–559): Ad-hoc circular arc + arrow. (Lucide `RefreshCw` / `RotateCcw`. Status: **Missing**).
  - `.check` (Lines 561–571): Ad-hoc checkmark. (`VooIconFactory.drawCheckmark` **exists** at line 1743; should delegate).
  - `.claude` (Lines 573–596): Anthropic Claude vendor brand mark.
  - `.codex` (Lines 598–620): Codex vendor brand mark.
  - `.antigravity` (Lines 622–645): Antigravity vendor brand mark.
  - `.lock`: Delegates to `VooIconFactory.drawLock` (**Exists**).

### 3.5 `Sources/UI/AgentPanelView.swift`
- **`AgentGlyphDrawing.draw`** (Lines 217–271):
  - `.history` (Lines 233–240): Ad-hoc clock dial + rewind arc. (Lucide `History` `IconHistory`. Status: **Missing**).
  - `.plus` (Lines 241–244): Ad-hoc plus lines. (`VooIconFactory.drawPlus` **exists**; should delegate).
  - `.collapse` (Lines 245–256): Ad-hoc panel rectangle + divider line. (Lucide `PanelRightClose` `IconPanelRightClose`. Status: **Missing**).
  - `.arrowUp` (Lines 257–264): Ad-hoc arrow up. (`VooIconFactory.drawArrowUp` **exists**; should delegate).
  - `.brandMark` (Lines 274–297): Ad-hoc duplicate implementation of VOO Brand Mark! (`VooIconFactory.drawBrandLogo` **exists**; should delegate).

### 3.6 `Sources/UI/OnboardingGuideView.swift`
- **`drawCloseButton`** (Lines 1078–1105): Ad-hoc X line segments. (Lucide `X`. Status: **Missing**).
- **`drawCheckmark`** (Lines 1684–1696): Ad-hoc checkmark. (`VooIconFactory.drawCheckmark` **exists**; should delegate).
- **`drawFolder`** (Lines 1699–1736): Ad-hoc outlined folder with quad curves. (Lucide `Folder`. Status: **Missing**).
- **Line 828**: `VooIconFactory.drawBrandLogo` (**Exists**).

### 3.7 `Sources/Canvas/CanvasStageView.swift`
- **Artboard Header Badge** (Lines 651, 666, 716):
  - `VooIconFactory.drawFrame` (**Exists**)
  - `VooIconFactory.drawChevronDown` (**Exists**)
  - `VooIconFactory.drawPlus` (**Exists**)
- **`drawImagePlaceholder`** (Lines 2249–2273): Ad-hoc image icon (rounded rect + mountain zig-zag + sun circle).
  - *Canonical Lucide*: `Image` (`IconImage` in `icons.jsx`, line 73).
  - *VooIconFactory Status*: **Missing** (Needs `drawImage`).
- **Floating Zoom Pill** (`ZoomPillView`, Lines 3379–3414):
  - `VooIconFactory.drawUndo` (**Exists**)
  - `VooIconFactory.drawRedo` (**Exists**)
  - `VooIconFactory.drawGrid` (**Exists**)
  - `VooIconFactory.drawPlus` (**Exists**)
  - `VooIconFactory.drawMinus` (**Exists**)

### 3.8 `Sources/UI/ContextBar.swift` & `Sources/UI/ContextualTaskbarView.swift`
- All buttons delegate directly to `VooIconFactory`:
  - `drawBooleanUnion`, `drawBooleanSubtract`, `drawBooleanIntersect`, `drawBooleanXor`, `drawBooleanDivide` (**Exists**)
  - `drawAlignLeft`, `drawAlignCenter`, `drawAlignRight`, `drawAlignTop`, `drawAlignMiddle`, `drawAlignBottom` (**Exists**)
  - `drawDistributeH`, `drawDistributeV` (**Exists**)
  - `drawGroup`, `drawUngroup` (**Exists**)
  - `drawNodeSharp`, `drawNodeSmooth`, `drawNodeSmart` (**Exists**)
  - `drawCopy`, `drawFlipH`, `drawFlipV`, `drawLock`, `drawUnlock`, `drawEye`, `drawEyeOff`, `drawSvg`, `drawCode`, `drawTrash`, `drawCheckmark`, `drawMinus` (**Exists**)

### 3.9 `Sources/UI/ToolFlyoutPopover.swift`
- `drawItemIcon` (Lines 206–233): All 12 sub-tools delegate directly to `VooIconFactory`:
  - `drawPen`, `drawCurvaturePen`, `drawPencil`, `drawRect`, `drawEllipse`, `drawLine`, `drawPolygon`, `drawStar`, `drawArrow`, `drawMarquee`, `drawLasso`, `drawShapes` (**Exists**)

---

## 4. Master Codebase Mapping Table

| File | Component / Method | Current Glyph Implementation | Canonical Lucide Name in `icons.jsx` | `VooIconFactory` Status | Action Required |
|---|---|---|---|---|---|
| `PropertiesPanelView.swift` | `PropertiesGlyphFactory.draw(.settings)` | Ad-hoc rounded rect + inner dot | `Settings` (`IconSettings` line 69) | **missing** | Add `drawSettings` to `VooIconFactory`, replace in caller |
| `PropertiesPanelView.swift` | `PropertiesGlyphFactory.draw(.transfer)` | Ad-hoc opposing horizontal arrow segments | `IconSwap` (lines 166–196) | **missing** | Add `drawSwap` to `VooIconFactory`, replace in caller |
| `PropertiesPanelView.swift` | `PropertiesGlyphFactory.draw(.eyedropper)` | Ad-hoc diagonal pipette path | `Pipette` (`IconPipette` line 402) | **missing** | Add `drawPipette` to `VooIconFactory`, replace in caller |
| `PropertiesPanelView.swift` | `PropertiesGlyphFactory.draw(.cornerRadius)` | Ad-hoc filled quarter-disc wedge | `IconCornerRadius` (lines 249–272) | **missing** | Add `drawCornerRadius` to `VooIconFactory`, replace in caller |
| `PropertiesPanelView.swift` | `PropertiesGlyphFactory.draw(.chevronDown)` | Ad-hoc chevron path | `ChevronDown` (`IconChevronDown` line 38) | **exists** | Delegate to `VooIconFactory.drawChevronDown` |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.sortArrows)` | Ad-hoc opposing arrows | `IconSwap` (lines 166–196) | **missing** | Delegate to `VooIconFactory.drawSwap` |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.mask)` | Ad-hoc rect + half-disc arc | `IconMask` (lines 198–220) | **missing** | Add `drawMask` to `VooIconFactory`, replace in caller |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.folder)` | Ad-hoc polygon outline | `Folder` (`IconFolder` line 91) | **missing** | Add `drawFolder` to `VooIconFactory`, replace in caller |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.chevronDown)` | Ad-hoc chevron | `ChevronDown` (`IconChevronDown` line 38) | **exists** | Delegate to `VooIconFactory.drawChevronDown` |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.diamond)` | Ad-hoc 4-point diamond | `Diamond` (`IconDiamond` line 21) | **missing** | Add `drawDiamond` to `VooIconFactory`, replace in caller |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.penCurve)` | Ad-hoc curve + filled endpoints | `Spline` (`IconBend` line 15) | **missing** | Add `drawSpline` to `VooIconFactory`, replace in caller |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.square)` | Ad-hoc rounded rect `(4,4,16,16)` | `Square` (`IconSquare` line 389) | **needs update** | Update `drawRect` to Lucide 24×24 coords, delegate |
| `LayersPanel.swift` | `LayersGlyphDrawing.draw(.circle)` | Ad-hoc ellipse `(3.5,3.5,17,17)` | `Circle` (`IconCircle` line 390) | **needs update** | Update `drawEllipse` to Lucide 24×24 coords, delegate |
| `WelcomeDashboardView.swift` | `drawFolderIcon` | Ad-hoc folder path with curves | `Folder` (`IconFolder` line 91) | **missing** | Delegate to `VooIconFactory.drawFolder`, delete private method |
| `WelcomeDashboardView.swift` | `drawStarIcon` | Ad-hoc 10-point star path | `Star` (`IconStar` line 395) | **needs update** | Update `drawStar` in `VooIconFactory` to Lucide polygon points, delegate |
| `WelcomeDashboardView.swift` | `drawRefreshIcon` | Ad-hoc 285° circular arc + head | `RefreshCw` (`IconRefresh` line 64) | **missing** | Add `drawRefresh` to `VooIconFactory`, delete private method |
| `WelcomeDashboardView.swift` | `drawFigmaIcon` | Ad-hoc 5-element Figma logo | Figma Brand Logo | **missing** | Add `drawFigma` to `VooIconFactory`, delete private method |
| `WelcomeDashboardView.swift` | `drawImageIcon` | Ad-hoc rounded rect + mountain | `Image` (`IconImage` line 73) | **missing** | Add `drawImage` to `VooIconFactory`, delete private method |
| `WindowController.swift` | `showPageSwitcherMenu` line 2216 | `NSImage(systemSymbolName: "rectangle.on.rectangle")` | `Copy` (`IconCopy` line 88) / `Layers` | **needs update** | Replace with `VooIconFactory.image(...)`, eliminate SF Symbol |
| `ToolRail.swift` | `ToolButton.draw(.brush)` | `VooIconFactory.drawMarquee` (dashed box) | `Brush` / `Paintbrush` (`IconBrush` / `IconPaint`) | **needs update** | Change to `drawBrush` in `VooIconFactory` |
| `ToolRail.swift` | `ToolRailAccessoryButton.draw(.hand)` | Ad-hoc palm + 3 tick lines | `Hand` / `Grab` | **missing** | Add `drawHand` to `VooIconFactory`, delegate |
| `ToolRail.swift` | `ToolRailAccessoryButton.draw(.lasso)` | Ad-hoc stroke ellipse + tail | `Lasso` (`IconLasso` line 388) | **exists** | Delegate to `VooIconFactory.drawLasso` |
| `ToolRail.swift` | `ToolRailAccessoryButton.draw(.wand)` | Ad-hoc line + cross ticks | `Wand2` (`IconWand` line 639) | **missing** | Add `drawWand` to `VooIconFactory`, delegate |
| `EditorChrome.swift` | `EditorChromeGlyph.drawPage` | Ad-hoc document + fold corner | `FileText` (`IconFileText` line 90) | **exists** | Delegate to `VooIconFactory.drawFileText` |
| `EditorChrome.swift` | `EditorChromeGlyph.drawMagnet` | Ad-hoc rotated U-magnet | `Magnet` (`IconMagnet` line 110) | **missing** | Add `drawMagnet` to `VooIconFactory`, delegate |
| `EditorChrome.swift` | `EditorChromeGlyph.drawMarquee` | Ad-hoc dashed rect | `Crop` / `SquareDashed` | **exists** | Delegate to `VooIconFactory.drawMarquee` |
| `EditorChrome.swift` | `EditorChromeGlyph.drawRotate` | Ad-hoc circular arc + head | `RotateCcw` (`IconRotateCcw` line 63/704) | **missing** | Add `drawRotateCcw` to `VooIconFactory`, delegate |
| `EditorChrome.swift` | `EditorChromeGlyph.drawFlipVertical` | Ad-hoc triangles + dashed line | `FlipVertical2` (`IconFlipV` line 706) | **exists** | Delegate to `VooIconFactory.drawFlipV` |
| `EditorChrome.swift` | `EditorChromeGlyph.drawFlipHorizontal` | Ad-hoc triangles + dashed line | `FlipHorizontal2` (`IconFlipH` line 705) | **exists** | Delegate to `VooIconFactory.drawFlipH` |
| `EditorChrome.swift` | `EditorChromeGlyph.drawDiamond` | Ad-hoc diamond | `Diamond` (`IconDiamond` line 21) | **missing** | Delegate to `VooIconFactory.drawDiamond` |
| `EditorChrome.swift` | `EditorChromeGlyph.drawSparkle` | Ad-hoc 4-point sparkle | `Sparkles` (`IconSparkles` line 638) | **missing** | Add `drawSparkle` / `drawSparkles` to `VooIconFactory`, delegate |
| `TitleBar.swift` | `DarkTabButton.draw(.close)` | Ad-hoc X line segments | `X` (`IconClose` line 36) | **missing** | Add `drawClose` to `VooIconFactory`, delegate |
| `TitleBar.swift` | `DarkTabButton.draw(.plus)` | Ad-hoc plus line segments | `Plus` (`IconAdd` line 20) | **exists** | Delegate to `VooIconFactory.drawPlus` |
| `TitleBar.swift` | `DarkTabButton.draw(.settings)` | Ad-hoc lightning bolt polygon | `Bolt` (`IconBolt` line 70) / `Zap` | **exists / needs update** | Delegate to `VooIconFactory.drawZap` or add `drawBolt` |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawSparkle` | Ad-hoc sparkle quad curves | `Sparkles` (`IconSparkles` line 638) | **missing** | Delegate to `VooIconFactory.drawSparkle` |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawKeyboard` | Ad-hoc keyboard outline + ticks | `Keyboard` (`IconKeyboard`) | **missing** | Add `drawKeyboard` to `VooIconFactory`, delegate |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawClose` | Ad-hoc X line segments | `X` (`IconClose` line 36) | **missing** | Delegate to `VooIconFactory.drawClose` |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawFolder` | Ad-hoc folder outline | `Folder` (`IconFolder` line 91) | **missing** | Delegate to `VooIconFactory.drawFolder` |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawFolderOpen` | Ad-hoc folder outline + flap | `FolderOpen` (`IconFolderOpen` line 92) | **missing** | Add `drawFolderOpen` to `VooIconFactory`, delegate |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawRefresh` | Ad-hoc circular arc + arrow | `RefreshCw` (`IconRefresh` line 64) | **missing** | Delegate to `VooIconFactory.drawRefresh` |
| `SettingsDrawerView.swift` | `SettingsGlyph.drawCheck` | Ad-hoc checkmark path | `Check` (`IconCheck` line 44) | **exists** | Delegate to `VooIconFactory.drawCheckmark` |
| `AgentPanelView.swift` | `AgentGlyphDrawing.draw(.history)` | Ad-hoc clock dial + rewind arc | `History` (`IconHistory` line 697) | **missing** | Add `drawHistory` to `VooIconFactory`, delegate |
| `AgentPanelView.swift` | `AgentGlyphDrawing.draw(.plus)` | Ad-hoc plus lines | `Plus` (`IconAdd` line 20) | **exists** | Delegate to `VooIconFactory.drawPlus` |
| `AgentPanelView.swift` | `AgentGlyphDrawing.draw(.collapse)` | Ad-hoc panel rect + line | `PanelRightClose` (`IconPanelRightClose` line 19) | **missing** | Add `drawPanelRightClose` to `VooIconFactory`, delegate |
| `AgentPanelView.swift` | `AgentGlyphDrawing.draw(.arrowUp)` | Ad-hoc arrow up | `ArrowUp` (`IconArrowUp` line 42) | **exists** | Delegate to `VooIconFactory.drawArrowUp` |
| `AgentPanelView.swift` | `AgentGlyphDrawing.draw(.brandMark)` | Duplicate VOO brand logo math | VOO Brand Logo | **exists** | Delegate to `VooIconFactory.drawBrandLogo` |
| `OnboardingGuideView.swift` | `drawCloseButton` | Ad-hoc X line segments | `X` (`IconClose` line 36) | **missing** | Delegate to `VooIconFactory.drawClose` |
| `OnboardingGuideView.swift` | `drawCheckmark` | Ad-hoc checkmark path | `Check` (`IconCheck` line 44) | **exists** | Delegate to `VooIconFactory.drawCheckmark` |
| `OnboardingGuideView.swift` | `drawFolder` | Ad-hoc outlined folder | `Folder` (`IconFolder` line 91) | **missing** | Delegate to `VooIconFactory.drawFolder` |
| `CanvasStageView.swift` | `drawImagePlaceholder` | Ad-hoc image frame + mountains | `Image` (`IconImage` line 73) | **missing** | Add `drawImage` to `VooIconFactory`, delegate |

---

## 5. Canonical Vector Specifications for Missing / Updated Glyphs

All glyphs in `VooIconFactory` must strictly execute on a standard 24×24 coordinate grid with default `strokeWidth: CGFloat = 1.5`, `ctx.setLineCap(.round)`, and `ctx.setLineJoin(.round)`.

### 5.1 Missing Canonical Glyphs to Add to `VooIconFactory`

#### 1. `Folder` (`IconFolder` / Lucide `Folder`)
```swift
// Lucide Folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
let path = CGMutablePath()
path.move(to: CGPoint(x: 4, y: 20))
path.addLine(to: CGPoint(x: 20, y: 20))
path.addArc(tangent1End: CGPoint(x: 22, y: 20), tangent2End: CGPoint(x: 22, y: 18), radius: 2)
path.addLine(to: CGPoint(x: 22, y: 8))
path.addArc(tangent1End: CGPoint(x: 22, y: 6), tangent2End: CGPoint(x: 20, y: 6), radius: 2)
path.addLine(to: CGPoint(x: 12.1, y: 6))
path.addLine(to: CGPoint(x: 9.6, y: 3.9))
path.addArc(tangent1End: CGPoint(x: 7.93, y: 3), tangent2End: CGPoint(x: 4, y: 3), radius: 2)
path.addLine(to: CGPoint(x: 4, y: 3))
path.addArc(tangent1End: CGPoint(x: 2, y: 3), tangent2End: CGPoint(x: 2, y: 5), radius: 2)
path.addLine(to: CGPoint(x: 2, y: 18))
path.addArc(tangent1End: CGPoint(x: 2, y: 20), tangent2End: CGPoint(x: 4, y: 20), radius: 2)
path.closeSubpath()
```

#### 2. `FolderOpen` (`IconFolderOpen` / Lucide `FolderOpen`)
```swift
// Lucide FolderOpen:
// path 1: M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2
```

#### 3. `Swap` (`IconSwap` in `icons.jsx:166–196`)
```swift
// Web VOO canonical IconSwap:
// path 1: M3 8.75H21L17.6 4.75
// path 2: M21 14.75H3L6.4 18.75
let p1 = CGMutablePath()
p1.move(to: CGPoint(x: 3, y: 8.75))
p1.addLine(to: CGPoint(x: 21, y: 8.75))
p1.addLine(to: CGPoint(x: 17.6, y: 4.75))

let p2 = CGMutablePath()
p2.move(to: CGPoint(x: 21, y: 14.75))
p2.addLine(to: CGPoint(x: 3, y: 14.75))
p2.addLine(to: CGPoint(x: 6.4, y: 18.75))
```

#### 4. `CornerRadius` (`IconCornerRadius` in `icons.jsx:249–272`)
```swift
// Web VOO canonical IconCornerRadius:
// path: M4 20V16C4 9.37258 9.37258 4 16 4H20
let path = CGMutablePath()
path.move(to: CGPoint(x: 4, y: 20))
path.addLine(to: CGPoint(x: 4, y: 16))
path.addCurve(to: CGPoint(x: 16, y: 4), control1: CGPoint(x: 4, y: 9.37258), control2: CGPoint(x: 9.37258, y: 4))
path.addLine(to: CGPoint(x: 20, y: 4))
```

#### 5. `Mask` (`IconMask` in `icons.jsx:198–220`)
```swift
// Web VOO canonical IconMask:
// rect: x=3 y=4 width=18 height=16 rx=3 ry=3 (stroked)
// circle: cx=12 cy=12 r=4 (filled)
let box = CGRect(x: 3, y: 4, width: 18, height: 16)
let frame = CGPath(roundedRect: box, cornerWidth: 3, cornerHeight: 3, transform: nil)
ctx.addPath(frame)
ctx.strokePath()

ctx.fillEllipse(in: CGRect(x: 8, y: 8, width: 8, height: 8))
```

#### 6. `Pipette` (`IconPipette` / Lucide `Pipette`)
```swift
// Lucide Pipette:
// M2 22l1-1h3l9-9
// M3 21v-3l9-9
// m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z
```

#### 7. `Diamond` (`IconDiamond` / Lucide `Diamond`)
```swift
// Lucide Diamond:
// M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z
```

#### 8. `Spline` (`IconBend` / Lucide `Spline`)
```swift
// Lucide Spline:
// circle cx=19 cy=5 r=2
// circle cx=5 cy=19 r=2
// path M5 17A12 12 0 0 1 17 5
```

#### 9. `Image` (`IconImage` / Lucide `Image`)
```swift
// Lucide Image:
// rect width=18 height=18 x=3 y=3 rx=2
// circle cx=9 cy=9 r=2
// path m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21
```

#### 10. `Close` / `X` (`IconClose` / Lucide `X`)
```swift
// Lucide X:
// path M18 6 6 18
// path m6 6 12 12
ctx.strokeLineSegments(between: [CGPoint(x: 18, y: 6), CGPoint(x: 6, y: 18)])
ctx.strokeLineSegments(between: [CGPoint(x: 6, y: 6), CGPoint(x: 18, y: 18)])
```

#### 11. `Refresh` (`IconRefresh` / Lucide `RefreshCw`)
```swift
// Lucide RefreshCw:
// M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8
// M21 3v5h-5
// M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16
// M8 16H3v5
```

#### 12. `RotateCcw` (`IconRestart` / `IconRotateCcw` / Lucide `RotateCcw`)
```swift
// Lucide RotateCcw:
// M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8
// M3 3v5h5
```

#### 13. `Settings` (`IconSettings` / Lucide `Settings`)
```swift
// Lucide Settings: gear path + circle cx=12 cy=12 r=3
```

#### 14. `Bolt` (`IconBolt` / Lucide `Bolt`)
```swift
// Lucide Bolt: M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z + circle cx=12 cy=12 r=4
```

#### 15. `Sparkles` (`IconSparkles` / Lucide `Sparkles`)
```swift
// Lucide Sparkles:
// m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z
// M5 3v4, M19 17v4, M3 5h4, M17 19h4
```

#### 16. `Magnet` (`IconMagnet` / Lucide `Magnet`)
```swift
// Lucide Magnet:
// m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.35-6.35a2.76 2.76 0 0 0-3.9-3.9L5 14
// m5 8 4 4
// m12 15 4 4
```

#### 17. `Keyboard` (`IconKeyboard` / Lucide `Keyboard`)
```swift
// Lucide Keyboard:
// rect width=20 height=16 x=2 y=4 rx=2
// key dots / line
```

#### 18. `History` (`IconHistory` / Lucide `History`)
```swift
// Lucide History:
// M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8
// M3 3v5h5
// M12 7v5l4 2
```

#### 19. `PanelRightClose` (`IconPanelRightClose` / Lucide `PanelRightClose`)
```swift
// Lucide PanelRightClose:
// rect width=18 height=18 x=3 y=3 rx=2
// M15 3v18
// m8 9 3 3-3 3
```

#### 20. `Hand` (`IconHand` / Lucide `Hand`)
```swift
// Lucide Hand: standard palm and 4 extended fingers
```

#### 21. `Wand` (`IconWand` / Lucide `Wand2`)
```swift
// Lucide Wand2:
// m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z
// m14 7 3 3, M5 6v4, M19 14v4, M10 2v2, M7 8H3, M21 16h-4, M11 3H9
```

#### 22. `Star` (`IconStar` / Lucide `Star` Points Alignment)
Update `drawStar` in `VooIconFactory`:
```swift
// Exact Lucide Star polygon points:
let pts = [
    CGPoint(x: 12, y: 2),
    CGPoint(x: 15.09, y: 8.26),
    CGPoint(x: 22, y: 9.27),
    CGPoint(x: 17, y: 14.14),
    CGPoint(x: 18.18, y: 21.02),
    CGPoint(x: 12, y: 17.77),
    CGPoint(x: 5.82, y: 21.02),
    CGPoint(x: 7, y: 14.14),
    CGPoint(x: 2, y: 9.27),
    CGPoint(x: 8.91, y: 8.26)
]
let path = CGMutablePath()
path.move(to: pts[0])
for p in pts.dropFirst() { path.addLine(to: p) }
path.closeSubpath()
```

#### 23. `NSImage` Generator Helper for `VooIconFactory`
```swift
public static func image(size: CGSize = CGSize(width: 16, height: 16), color: NSColor = .white, draw: (CGRect, NSColor) -> Void) -> NSImage {
    return NSImage(size: size, flipped: false) { rect in
        draw(rect, color)
        return true
    }
}
```

---

## 6. Coordinate Space & Rendering Architecture Gotchas

### Flipped vs. Unflipped Coordinate Systems in AppKit
In AppKit, the default view coordinate system has $y=0$ at the bottom-left with $y$ increasing upwards. However, several custom views override `isFlipped => true` (such as `WelcomeDashboardView`, `NSTableView` rows in `LayersPanel`, `EditorChrome`, and text/input fields) where $y=0$ is at the top-left with $y$ increasing downwards.

Currently, `VooIconFactory` uses:
```swift
let scale = min(rect.width, rect.height) / 24.0
ctx.translateBy(x: rect.origin.x, y: rect.origin.y + rect.height)
ctx.scaleBy(x: scale, y: -scale)
```
- In an **unflipped view**, this transformation correctly flips the $y$-axis so that SVG top-down coordinates render right-side up.
- In a **flipped view**, applying `scaleBy(x: scale, y: -scale)` causes the SVG coordinates to be rendered upside-down. This explains why `WelcomeDashboardView` introduced `drawVooIcon` to pre-flip the context, and why `LayersPanel` manually pre-flipped `VooIconFactory.drawText`.

### Architectural Recommendation
`VooIconFactory` can check `NSGraphicsContext.current?.isFlipped == true` or provide a unified canvas helper `withCanvas(in:rect:)` that automatically handles flipped vs unflipped contexts, ensuring that callers in both flipped and unflipped views can simply call `VooIconFactory.draw*(in:rect:color:strokeWidth:)` without manual inverted transformations.

---

## 7. Migration & Consolidation Plan

1. **Step 1 (`Sources/UI/Icons.swift`)**:
   - Add missing canonical Lucide glyphs: `Folder`, `FolderOpen`, `Swap`, `CornerRadius`, `Mask`, `Pipette`, `Diamond`, `Spline`, `Image`, `Close` (`X`), `Refresh`, `RotateCcw`, `Settings`, `Bolt`, `Sparkles`, `Magnet`, `Keyboard`, `History`, `PanelRightClose`, `Hand`, `Wand`, `Figma`.
   - Update `drawStar` to exact Lucide polygon vertex coordinates.
   - Add `VooIconFactory.image(...) -> NSImage` utility.
   - Add context flip detection so glyphs render right-side up in both flipped and unflipped views.
2. **Step 2 (`Sources/UI/PropertiesPanelView.swift`)**:
   - Refactor `PropertiesGlyphFactory` to delegate to `VooIconFactory`:
     - `.settings` -> `VooIconFactory.drawSettings`
     - `.transfer` -> `VooIconFactory.drawSwap`
     - `.eyedropper` -> `VooIconFactory.drawPipette`
     - `.cornerRadius` -> `VooIconFactory.drawCornerRadius`
     - `.chevronDown` -> `VooIconFactory.drawChevronDown`
3. **Step 3 (`Sources/UI/LayersPanel.swift`)**:
   - Refactor `LayersGlyphDrawing` to delegate all glyph cases to `VooIconFactory`:
     - `.sortArrows` -> `VooIconFactory.drawSwap`
     - `.mask` -> `VooIconFactory.drawMask`
     - `.folder` -> `VooIconFactory.drawFolder`
     - `.diamond` -> `VooIconFactory.drawDiamond`
     - `.penCurve` -> `VooIconFactory.drawSpline`
     - `.square` -> `VooIconFactory.drawRect`
     - `.circle` -> `VooIconFactory.drawEllipse`
     - Remove redundant manual flipping wrappers.
4. **Step 4 (`Sources/UI/WelcomeDashboardView.swift`)**:
   - Replace `drawFolderIcon`, `drawStarIcon`, `drawRefreshIcon`, `drawFigmaIcon`, `drawImageIcon` with direct `VooIconFactory` calls (`drawFolder`, `drawStar`, `drawRefresh`, `drawFigma`, `drawImage`).
   - Remove the 5 private drawing functions completely.
5. **Step 5 (`Sources/UI/WindowController.swift`)**:
   - Replace line 2216 `NSImage(systemSymbolName: "rectangle.on.rectangle", accessibilityDescription: nil)` with `VooIconFactory.image(size: CGSize(width: 16, height: 16)) { rect, color in VooIconFactory.drawCopy(in: rect, color: color) }`.
6. **Step 6 (`Other Views`)**:
   - `ToolRail.swift`: Delegate `.hand` to `drawHand`, `.lasso` to `drawLasso`, `.wand` to `drawWand`.
   - `EditorChrome.swift`: Delegate `.page` to `drawFileText`, `.magnet` to `drawMagnet`, `.marquee` to `drawMarquee`, `.rotate` to `drawRotateCcw`, `.flipVertical` to `drawFlipV`, `.flipHorizontal` to `drawFlipH`, `.diamond` to `drawDiamond`, `.sparkle` to `drawSparkle`.
   - `TitleBar.swift`: Delegate `.close` to `drawClose`, `.plus` to `drawPlus`, `.settings` to `drawBolt` / `drawZap`.
   - `SettingsDrawerView.swift`: Delegate `.sparkle`, `.keyboard`, `.close`, `.folder`, `.folderOpen`, `.refresh`, `.check` to `VooIconFactory`.
   - `AgentPanelView.swift`: Delegate `.history`, `.plus`, `.collapse`, `.arrowUp`, `.brandMark` to `VooIconFactory`.
   - `OnboardingGuideView.swift`: Delegate `drawCloseButton`, `drawCheckmark`, `drawFolder` to `VooIconFactory`.
   - `CanvasStageView.swift`: Replace `drawImagePlaceholder` with `VooIconFactory.drawImage`.
7. **Step 7 (Verification)**:
   - Run `./build.sh build` and verify clean build with zero errors.
   - Run `./tests/run_tests.sh` and verify all 308 tests pass with zero regressions.
