# Icons.swift Vector & Canonical Lucide Alignment Audit

**Document Path**: `/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/explorer_icons_swift/icons_swift_audit.md`  
**Auditor**: Teamwork Explorer (Icons.swift Vector Auditor)  
**Date**: 2026-10-21  
**Target Codebase**: `native_studio` (`Sources/UI/Icons.swift`, `VooIconFactory`)  
**Canonical References**:  
- Web/Canvas Icon System: `../src/canvas/icons.jsx` (24×24, stroke 1.5 default, round cap/join)
- Canonical Lucide Definitions: `../node_modules/lucide-react/dist/esm/icons/` (v1.59.0)
- UI Specifications: `UI_SPEC.md`

---

## 1. Executive Summary

This audit evaluates the vector icon implementation in `native_studio` (`Sources/UI/Icons.swift`, enum `VooIconFactory`) against VOO Design's canonical Lucide icon system (`../src/canvas/icons.jsx`).

### Key Findings
1. **Scope & Inventory**: `VooIconFactory` contains **71 static drawing methods** (50 primary drawing methods + 21 sub-tool and contextual taskbar glyph methods).
2. **Stroke Width Fragmentation**: Canonical Lucide and VOO Design UI specifications (`UI_SPEC.md`, line 20; `icons.jsx`, line 2) dictate a uniform default stroke width of **1.5pt** (`ICON_STROKE_WIDTH = 1.5`). In `VooIconFactory`, default stroke widths are fragmented across 5 different values:
   - **1.8pt default**: 35 methods
   - **2.0pt default**: 6 methods (`drawText`, `drawUndo`, `drawRedo`, `drawPlus`, `drawMinus`, `drawCheckmark`)
   - **1.6pt default**: 3 methods (`drawCube`, `drawLayoutGrid`, `drawLayoutList`)
   - **1.5pt default**: 11 methods (`drawAlign*`, `drawDistribute*`, `drawNode*`)
   - **1.4pt default**: 5 methods (`drawBoolean*`)
   - **Hardcoded / Missing parameter**: 2 methods (`drawBrandLogo` hardcodes 1.6pt; `drawCursor` hardcodes 1.8pt on outline).
3. **Line Cap & Line Join Inconsistencies**:
   - Canonical Lucide specification requires both `strokeLinecap="round"` and `strokeLinejoin="round"` on all stroked vector paths.
   - **48 out of 71 methods** in `VooIconFactory` omit `ctx.setLineJoin(.round)`, resulting in sharp, unstyled miter joints on lines and shapes.
   - **15 methods** completely omit `ctx.setLineCap(.round)` as well (e.g., `drawMarquee`, `drawShapes`, `drawLayoutGrid`, `drawContrast`, all `drawBoolean*`, `drawAlignLeft/Center/Right`, `drawNode*`, `drawEllipse`).
4. **Coordinate Transformation & Centering Flaws**:
   - Every method uses `let s = min(rect.width, rect.height) / 24.0` followed by `ctx.translateBy(x: rect.origin.x, y: rect.origin.y + rect.height)` and `ctx.scaleBy(x: s, y: -s)`.
   - **Centering Bug**: On non-square rects (e.g. 28×20 or 24×16), `x: rect.origin.x` pins the 24×24 drawing to the left edge rather than centering it at `rect.midX - 12 * s`.
   - **Flipped View Inversion Bug**: In flipped views (such as NSTableView row views in `LayersPanel.swift`), `rect.origin.y + rect.height` maps to the visual bottom, and `scaleBy(x: s, y: -s)` flips the rendering upside down unless callers apply manual hacks.
   - **Severe Orientation Defect in `drawText`**: Lines 201–204 draw the horizontal bar at `y = 19` and the vertical stem extending down to `y = 5` with the comment `// Top horizontal crossbar of 'T' (at y = 19)`. Because the transform inverts Y, `y = 19` is rendered at the visual bottom in unflipped views! This caused the 'T' to be rendered upside-down, prompting an explicit reflection workaround in `LayersPanel.swift:188–197`.
5. **Topological & Geometric Divergences from Lucide**:
   - `drawCursor`: Renders a custom macOS-style arrow polygon rather than canonical Lucide `MousePointer2` (`mouse-pointer-2.mjs`).
   - `drawText`: Missing serif terminals and baseline serif; inverted coordinate space compared to canonical Lucide `Type` (`type.mjs`).
   - `drawPen`: Ommits the canonical fountain pen ink breather circle `r=2` at `(11, 11)`; has sharp tip polygon vertices instead of Lucide's rounded curves (`pen-tool.mjs`).
   - `drawEraser`: Sharp miter vertices without the canonical `a2 2` corner radii (`eraser.mjs`).
   - `drawZap`: Sharp polygon without rounded corner kinks (`zap.mjs`).
   - `drawUndo` / `drawRedo`: Bottom return loop abruptly truncated, omitting the horizontal return stroke to `H11` / `H13` (`undo-2.mjs`, `redo-2.mjs`).
   - `drawSearch`: Circle stroked at `CGRect(3, 3, 14, 14)` (center 10,10, radius 7) instead of canonical Lucide center `(11, 11)` radius 8 (`search.mjs`).
   - `drawLock` / `drawUnlock`: Body box width is 16pt instead of canonical 18pt; `drawUnlock` shackle is an unswung 180° arc instead of Lucide's open swing curve `9.9-1`.
   - `drawContrast`: Fills outer radius 10 half-circle instead of Lucide's inner radius 6 half-circle (`contrast.mjs`).
   - `drawEyeOff`: Draws full open eye with a diagonal strike through it instead of Lucide's broken eye contours and pupil arc (`eye-off.mjs`).
   - `drawBooleanUnion/Subtract/Intersect`: Ad-hoc custom Venn diagrams with semi-transparent circle fills (0.25 alpha) instead of canonical Lucide `SquaresUnite`, `SquaresSubtract`, `SquaresIntersect`.
   - `drawGroup` / `drawUngroup`: Two overlapping rounded rectangles and small offset squares instead of Lucide's canonical corner brackets and internal tiles (`group.mjs`, `ungroup.mjs`).
   - `drawFlipH` / `drawFlipV`: Axis definitions are swapped relative to Lucide standard (`triangles-centerline-dashed-horizontal.mjs` vs `triangles-centerline-dashed-vertical.mjs`).
6. **Ad-Hoc Proliferation in Calling Views**:
   - `PropertiesPanelView.swift` (`PropertiesGlyphFactory`): 5 ad-hoc glyphs (`settings`, `transfer`, `eyedropper`, `cornerRadius`, `chevronDown`) drawn in a non-standard 16×16 coordinate box.
   - `LayersPanel.swift` (`LayersGlyphDrawing`): 8 ad-hoc glyphs (`sortArrows`, `mask`, `folder`, `chevronDown`, `diamond`, `penCurve`, `square`, `circle`).
   - `WelcomeDashboardView.swift`: 5 private inline drawing methods (`drawFolderIcon`, `drawStarIcon`, `drawRefreshIcon`, `drawFigmaIcon`, `drawImageIcon`).
   - `TitleBar.swift`: 3 private inline drawing methods (`.close`, `.plus`, `.settings`).
   - `EditorChrome.swift` (`EditorChromeGlyph`): 8 private drawing methods (`drawPage`, `drawMagnet`, `drawMarquee`, `drawRotate`, `drawFlipVertical`, `drawFlipHorizontal`, `drawDiamond`, `drawSparkle`).
   - `WindowController.swift`: 1 instance of `NSImage(systemSymbolName: "rectangle.on.rectangle")`.

---

## 2. Complete Inventory of All 71 Methods in `VooIconFactory`

| # | Method Name | Line | Canonical Lucide / Asset | Current Default Stroke | Cap .round | Join .round | Status & Summary of Defects |
|---|---|---|---|---|---|---|---|
| 1 | `drawBrandLogo` | 16 | VOO Brand Mark | N/A (hardcoded 1.6pt) | ❌ | ❌ | Brand mark. Circle stroked at 1.6pt; outer hex filled. Missing strokeWidth parameter. |
| 2 | `drawCursor` | 53 | `mouse-pointer-2` | N/A (hardcoded 1.8pt) | ✅ | ✅ | **Divergent**: macOS arrow polygon, NOT Lucide `MousePointer2`. Inverted coordinates in unflipped views. |
| 3 | `drawFrame` | 86 | `frame` | 1.8pt | ✅ | ❌ | Line join missing. Stroke 1.8pt instead of 1.5pt. Lines match Lucide. |
| 4 | `drawMarquee` | 106 | `crop` / `IconSelectionRect` | 1.8pt | ❌ | ❌ | Missing cap and join. Dashed box (4,4,16,16), not matching Lucide `Crop` or `IconSelectionRect`. |
| 5 | `drawPen` | 123 | `pen-tool` | 1.8pt | ✅ | ✅ | **Divergent**: Missing center ink breather circle (`r=2` at 11,11). Sharp polygon handle instead of rounded corner handle. |
| 6 | `drawEraser` | 162 | `eraser` | 1.8pt | ✅ | ✅ | **Divergent**: Sharp polygon corners, missing Lucide's `a2 2` corner radii. |
| 7 | `drawText` | 190 | `type` | 2.0pt | ✅ | ❌ | **CRITICAL DEFECT**: Inverted Y coordinate (draws 'T' upside down). Missing serif terminals & baseline serif. |
| 8 | `drawShapes` | 210 | `square` | 1.8pt | ❌ | ❌ | Missing cap & join. 16×16 at (4,4) rx=3 instead of Lucide 18×18 at (3,3) rx=2. Duplicate with `drawRect`. |
| 9 | `drawCube` | 229 | `box` | 1.6pt | ✅ | ✅ | Outer hexagon has sharp points; Lucide `Box` has `a2 2` rounded apexes and corners. |
| 10 | `drawUndo` | 261 | `undo-2` | 2.0pt | ✅ | ✅ | **Divergent**: Return loop truncated at (20, 15); missing horizontal return stroke to `H11`. |
| 11 | `drawRedo` | 288 | `redo-2` | 2.0pt | ✅ | ✅ | **Divergent**: Return loop truncated at (4, 15); missing horizontal return stroke to `H13`. |
| 12 | `drawGrid` | 315 | `grid-3x3` | 1.8pt | ✅ | ❌ | Missing line join. Stroke 1.8pt instead of 1.5pt. Geometry matches. |
| 13 | `drawPlus` | 340 | `plus` | 2.0pt | ✅ | ❌ | Missing line join. Stroke 2.0pt instead of 1.5pt. Geometry matches. |
| 14 | `drawMinus` | 358 | `minus` | 2.0pt | ✅ | ❌ | Missing line join. Stroke 2.0pt instead of 1.5pt. Geometry matches. |
| 15 | `drawClock` | 375 | `clock-3` | 1.8pt | ✅ | ✅ | Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide `Clock3`. |
| 16 | `drawFileText` | 395 | `file-text` | 1.8pt | ✅ | ✅ | Approximated document fold. Stroke 1.8pt instead of 1.5pt. |
| 17 | `drawLayoutGrid` | 435 | `layout-grid` | 1.6pt | ❌ | ❌ | Missing cap & join. Rects have corner radius 1.5 instead of Lucide `rx=1`. Stroke 1.6pt. |
| 18 | `drawCompass` | 459 | `compass` | 1.8pt | ✅ | ✅ | Needle has sharp diamond points; Lucide has `a2 2` corner radii at needle center. |
| 19 | `drawArrowRight` | 486 | `arrow-right` | 1.8pt | ✅ | ✅ | Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide `ArrowRight`. |
| 20 | `drawZap` | 511 | `zap` | 1.8pt | ✅ | ✅ | **Divergent**: Sharp polygon points; Lucide `Zap` has `a1.5 1.5` rounded tips & `a0.5 0.5` inner kinks. |
| 21 | `drawLayoutList` | 538 | `layout-list` | 1.6pt | ✅ | ❌ | Missing join. Rects have rx=1.5 instead of rx=1. Lines at y=5,9,15,19 instead of 4,9,15,20. |
| 22 | `drawSearch` | 563 | `search` | 1.8pt | ✅ | ❌ | **Divergent**: Circle center at (10,10) r=7 instead of Lucide center (11,11) r=8. Off-center by 1pt. |
| 23 | `drawSliders` | 581 | `sliders-horizontal` | 1.8pt | ✅ | ❌ | Missing join. Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide lines. |
| 24 | `drawContrast` | 608 | `contrast` | 1.8pt | ❌ | ❌ | **Divergent**: Missing cap & join. Fills outer r=10 half-circle instead of Lucide inner r=6 semicircle. |
| 25 | `drawCopy` | 632 | `copy` | 1.8pt | ✅ | ✅ | **Divergent**: Front rect is 13×13 instead of Lucide 14×14. Back sheet has sharp corner instead of rx=2. |
| 26 | `drawTrash` | 659 | `trash-2` / `trash` | 1.8pt | ✅ | ✅ | Lid handle has sharp corners instead of Lucide `a2 2` corner rounding. |
| 27 | `drawEye` | 698 | `eye` | 1.8pt | ✅ | ✅ | Stroke 1.8pt instead of 1.5pt. Geometry approximates Lucide `Eye`. |
| 28 | `drawEyeOff` | 723 | `eye-off` | 1.8pt | ✅ | ✅ | **Divergent**: Draws full open eye + diagonal line; Lucide has broken eye arcs and pupil arc. |
| 29 | `drawLock` | 747 | `lock` | 1.8pt | ✅ | ✅ | **Divergent**: Body rect is 16×11 instead of Lucide 18×11 (2pt too narrow). |
| 30 | `drawUnlock` | 775 | `lock-open` / `unlock` | 1.8pt | ✅ | ✅ | **Divergent**: Body rect 16×11 instead of 18×11. Shackle is 180° arc instead of open swing curve `9.9-1`. |
| 31 | `drawChevronDown` | 802 | `chevron-down` | 1.8pt | ✅ | ✅ | Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide `ChevronDown`. |
| 32 | `drawChevronRight` | 825 | `chevron-right` | 1.8pt | ✅ | ✅ | Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide `ChevronRight`. |
| 33 | `drawArrowUp` | 848 | `arrow-up` | 1.8pt | ✅ | ✅ | Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide `ArrowUp`. |
| 34 | `drawGlobe` | 873 | `globe` | 1.8pt | ✅ | ❌ | **Divergent**: Missing join. Strokes full inner ellipse (7,2,10,20) instead of Lucide single meridian arc. |
| 35 | `drawSmartphone` | 892 | `smartphone` | 1.8pt | ✅ | ❌ | **Divergent**: Missing join. Body 12×20 at x=6 instead of Lucide 14×20 at x=5. Home button is line not dot. |
| 36 | `drawMonitor` | 913 | `monitor` | 1.8pt | ✅ | ❌ | Missing join. Stroke 1.8pt instead of 1.5pt. Geometry matches Lucide. |
| 37 | `drawPresentation` | 935 | `presentation` | 1.8pt | ✅ | ✅ | Board corners are sharp; Lucide has `a2 2` corner radius at bottom corners. Stand starts at y=14 instead of y=16. |
| 38 | `drawCamera` | 968 | `camera` | 1.8pt | ✅ | ✅ | Shoulder slopes are sharp straight segments; Lucide has smooth tangent arcs. |
| 39 | `drawLayers` | 1003 | `layers` | 1.8pt | ✅ | ✅ | **Divergent**: Sharp rhombus corners; Lucide `Layers` has smooth rounded corners `a2 2` and `a1 1`. |
| 40 | `drawBooleanUnion` | 1043 | `squares-unite` | 1.4pt | ❌ | ❌ | **Divergent**: Overlapping circles with 0.25 alpha fill, NOT Lucide `SquaresUnite` (stroke outline). |
| 41 | `drawBooleanSubtract` | 1062 | `squares-subtract` | 1.4pt | ❌ | ❌ | **Divergent**: Overlapping circles with partial fill, NOT Lucide `SquaresSubtract`. |
| 42 | `drawBooleanIntersect` | 1083 | `squares-intersect` | 1.4pt | ❌ | ❌ | **Divergent**: Overlapping circles with filled lens, NOT Lucide `SquaresIntersect`. |
| 43 | `drawBooleanXor` | 1103 | Boolean XOR (Custom) | 1.4pt | ❌ | ❌ | Custom Venn diagram. Missing cap & join. Stroke 1.4pt. |
| 44 | `drawBooleanDivide` | 1123 | Boolean Divide (Custom) | 1.4pt | ❌ | ❌ | Custom Venn diagram. Missing cap & join. Stroke 1.4pt. |
| 45 | `drawAlignLeft` | 1144 | `align-start-vertical` | 1.5pt | ❌ | ❌ | **Divergent**: Missing cap/join. Draws solid filled sharp boxes with 0.6 alpha; Lucide is stroked `rx=2` rects. |
| 46 | `drawAlignCenter` | 1161 | `align-center-vertical` | 1.5pt | ❌ | ❌ | **Divergent**: Missing cap/join. Solid filled boxes; Lucide is stroked paths. |
| 47 | `drawAlignRight` | 1178 | `align-end-vertical` | 1.5pt | ❌ | ❌ | **Divergent**: Missing cap/join. Solid filled boxes; Lucide is stroked `rx=2` rects. |
| 48 | `drawNodeSharp` | 1197 | Vector Node Sharp (Custom) | 1.5pt | ❌ | ❌ | Custom vector anchor glyph. Missing cap & join. |
| 49 | `drawNodeSmooth` | 1219 | Vector Node Smooth (Custom) | 1.5pt | ❌ | ❌ | Custom vector anchor glyph. Missing cap & join. |
| 50 | `drawNodeSmart` | 1240 | Vector Node Smart (Custom) | 1.5pt | ❌ | ❌ | Custom vector anchor glyph. Missing cap & join. |
| 51 | `drawRect` | 1260 | `square` | 1.8pt | ✅ | ✅ | 17×17 at (3.5, 3.5) rx=2. Conflicting duplicate with `drawShapes` (16×16 rx=3). Lucide is 18×18 rx=2. |
| 52 | `drawEllipse` | 1278 | `circle` | 1.8pt | ❌ | ❌ | **Divergent**: Missing cap/join. Radius is 8.5 (17×17) instead of Lucide `r=10` (20×20). |
| 53 | `drawLine` | 1291 | `slash` | 1.8pt | ✅ | ❌ | Missing join. Diagonal line (4,20)-(20,4). |
| 54 | `drawPolygon` | 1305 | `hexagon` / `pentagon` | 1.8pt | ✅ | ✅ | Hexagon with sharp vertices; Lucide `Hexagon` has rounded corners. |
| 55 | `drawStar` | 1336 | `star` | 1.8pt | ✅ | ✅ | **Divergent**: Sharp trigonometric vertices; Lucide has rounded tips `a0.53` and inner curves `a2.12`. |
| 56 | `drawArrow` | 1369 | `arrow-up-right` | 1.8pt | ✅ | ✅ | Geometry approximates Lucide `ArrowUpRight`. Stroke 1.8pt. |
| 57 | `drawCurvaturePen` | 1393 | `spline` | 1.8pt | ✅ | ✅ | Quad curve with filled circles; Lucide `Spline` has stroked circles and circular arc. |
| 58 | `drawPencil` | 1420 | `pencil` | 1.8pt | ✅ | ✅ | Geometry approximates Lucide `Pencil`. Stroke 1.8pt. |
| 59 | `drawLasso` | 1448 | `lasso` | 1.8pt | ✅ | ✅ | Ad-hoc bezier loops differing from Lucide `Lasso`. |
| 60 | `drawFlipH` | 1473 | `triangles-centerline-dashed-horizontal` | 1.8pt | ✅ | ✅ | **Divergent**: Draws vertical dashed line (which is `FlipVertical2` in Lucide). Swapped axis. |
| 61 | `drawFlipV` | 1511 | `triangles-centerline-dashed-vertical` | 1.8pt | ✅ | ✅ | **Divergent**: Draws horizontal dashed line (which is `FlipHorizontal2` in Lucide). Swapped axis. |
| 62 | `drawAlignTop` | 1549 | `align-start-horizontal` | 1.5pt | ✅ | ❌ | Missing join. Solid filled rects instead of stroked rounded rects. |
| 63 | `drawAlignMiddle` | 1567 | `align-center-horizontal` | 1.5pt | ✅ | ❌ | Missing join. Solid filled rects instead of stroked rounded rects. |
| 64 | `drawAlignBottom` | 1585 | `align-end-horizontal` | 1.5pt | ✅ | ❌ | Missing join. Solid filled rects instead of stroked rounded rects. |
| 65 | `drawDistributeH` | 1603 | `align-horizontal-distribute-center` | 1.5pt | ✅ | ❌ | Missing join. Solid filled rect instead of stroked Lucide glyph. |
| 66 | `drawDistributeV` | 1621 | `align-vertical-distribute-center` | 1.5pt | ✅ | ❌ | Missing join. Solid filled rect instead of stroked Lucide glyph. |
| 67 | `drawGroup` | 1639 | `group` | 1.8pt | ✅ | ✅ | **Divergent**: Draws 2 overlapping rounded rects; Lucide `Group` is 4 corner brackets + 2 inner tiles. |
| 68 | `drawUngroup` | 1660 | `ungroup` | 1.8pt | ✅ | ✅ | **Divergent**: Draws 2 small squares + diagonal line; Lucide `Ungroup` has 4 corner brackets. |
| 69 | `drawCode` | 1682 | `code` / `code-2` | 1.8pt | ✅ | ✅ | Has extra diagonal slash (M13 6-11 18), making it `Code2` rather than `Code` / `IconCode` (`braces.mjs`). |
| 70 | `drawSvg` | 1712 | Vector S-Curve (Custom) | 1.8pt | ✅ | ✅ | Custom S-curve with 4 anchor circles. |
| 71 | `drawCheckmark` | 1739 | `check` | 2.0pt | ✅ | ✅ | Stroke 2.0pt instead of 1.5pt. Geometry matches Lucide `Check`. |

---

## 3. Detailed Topology & Coordinate Audits for High-Impact Divergences

### 3.1 Method 2: `drawCursor` vs Lucide `MousePointer2`
- **Location**: `Sources/UI/Icons.swift:53–83`
- **Current Swift Implementation**:
  ```swift
  let path = CGMutablePath()
  path.move(to: CGPoint(x: 5, y: 20))
  path.addLine(to: CGPoint(x: 5, y: 5))
  path.addLine(to: CGPoint(x: 9.5, y: 9.5))
  path.addLine(to: CGPoint(x: 13.5, y: 3.5))
  path.addLine(to: CGPoint(x: 15.5, y: 5.0))
  path.addLine(to: CGPoint(x: 11.5, y: 11.0))
  path.addLine(to: CGPoint(x: 17.5, y: 11.0))
  path.closeSubpath()
  ```
- **Canonical Lucide (`mouse-pointer-2.mjs`)**:
  ```json
  ["path", { "d": "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" }]
  ```
- **Defects**:
  1. Current path is an ad-hoc 7-point classic desktop cursor with an asymmetrical handle.
  2. Lucide's `MousePointer2` is an aerodynamic modern pointer with rounded tip (`a0.495`), angled body at 6.5/16 slope, and notch with `a2 2` fillet radius.
  3. Stroke width is hardcoded `1.8` when `isSolid == false`, lacking the standard `strokeWidth: CGFloat = 1.5` parameter.

### 3.2 Method 7: `drawText` vs Lucide `Type`
- **Location**: `Sources/UI/Icons.swift:190–208`
- **Current Swift Implementation**:
  ```swift
  // Top horizontal crossbar of 'T' (at y = 19)
  ctx.strokeLineSegments(between: [CGPoint(x: 4, y: 19), CGPoint(x: 20, y: 19)])
  // Vertical stem of 'T' (from y = 19 down to y = 5)
  ctx.strokeLineSegments(between: [CGPoint(x: 12, y: 19), CGPoint(x: 12, y: 5)])
  ```
- **Canonical Lucide (`type.mjs`)**:
  ```json
  [
    ["path", { "d": "M12 4v16" }],
    ["path", { "d": "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" }],
    ["path", { "d": "M9 20h6" }]
  ]
  ```
- **Defects**:
  1. **Inverted Y Orientation**: Authored with `y = 19` as the crossbar and `y = 5` as the stem base. When `ctx.scaleBy(x: s, y: -s)` is applied to an unflipped view, `y = 19` renders at the visual bottom, resulting in an upside-down 'T'.
  2. **Missing Serifs**: Canonical Lucide `Type` has top serifs dropping from `y=5` down to `y=7` at `x=4` and `x=20`, and a bottom horizontal foot from `x=9` to `x=15` at `y=20`.
  3. Default `strokeWidth` is 2.0pt instead of 1.5pt.

### 3.3 Method 5: `drawPen` vs Lucide `PenTool`
- **Location**: `Sources/UI/Icons.swift:123–160`
- **Current Swift Implementation**:
  Straight-line nib body, followed by sharp polygon handle `(18.6, 12.4)-(21.6, 15.4)-(15.4, 21.6)-(12.4, 18.6)`. Center ink breather hole is absent.
- **Canonical Lucide (`pen-tool.mjs`)**:
  ```json
  [
    ["path", { "d": "m18 13-.654-4.736a4 4 0 0 0-2.756-3.266l-9.163-2.9a2 2 0 0 0-2.017.493l-.82.819a2 2 0 0 0-.492 2.017l2.9 9.163a4 4 0 0 0 3.266 2.756L13 18" }],
    ["path", { "d": "M18.648 12.352a1.205 1.205 0 0 1 1.704 0l1.296 1.296a1.205 1.205 0 0 1 0 1.704l-6.296 6.296a1.205 1.205 0 0 1-1.704 0l-1.296-1.296a1.205 1.205 0 0 1 0-1.704z" }],
    ["path", { "d": "m3 3 6.586 6.586" }],
    ["circle", { "cx": "11", "cy": "11", "r": "2" }]
  ]
  ```
- **Defects**:
  1. Complete omission of the canonical breather circle `circle cx="11" cy="11" r="2"`.
  2. Handle is drawn with sharp vertices without the `a1.205` corner radii.
  3. Nib body lacks Lucide's `a4 4` and `a2 2` contoured curves.

### 3.4 Method 10 & 11: `drawUndo` / `drawRedo` vs Lucide `Undo2` / `Redo2`
- **Location**: `Sources/UI/Icons.swift:261–313`
- **Canonical Lucide (`undo-2.mjs`)**:
  ```json
  [
    ["path", { "d": "M9 14 4 9l5-5" }],
    ["path", { "d": "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" }]
  ]
  ```
- **Defects**:
  1. In `Icons.swift`, the arc is constructed via `path.addCurve(to: CGPoint(x: 20, y: 14.5), ...)` and abruptly terminates at `CGPoint(x: 20, y: 15)`. The bottom semicircle loop and horizontal return segment to `H11` are completely missing.
  2. `drawRedo` has the exact same mirror defect (stops at `(4, 15)`, omitting the return to `H13`).
  3. Default stroke width is 2.0pt instead of 1.5pt.

### 3.5 Method 20: `drawZap` vs Lucide `Zap`
- **Location**: `Sources/UI/Icons.swift:511–536`
- **Current Swift Implementation**:
  Polygon through points `(13, 2) -> (3, 14) -> (12, 14) -> (11, 22) -> (21, 10) -> (12, 10)`.
- **Canonical Lucide (`zap.mjs`)**:
  ```json
  ["path", { "d": "M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" }]
  ```
- **Defects**:
  Lucide `Zap` features rounded corner arcs at all outer vertices (`a1.5 1.5`) and inner notches (`a0.5 0.5`). The current `Icons.swift` drawing produces harsh, razor-sharp miter points.

### 3.6 Method 40–42: `drawBooleanUnion`, `drawBooleanSubtract`, `drawBooleanIntersect`
- **Location**: `Sources/UI/Icons.swift:1043–1101`
- **Current Swift Implementation**:
  Two overlapping circles stroked and filled with `color.withAlphaComponent(0.25)`.
- **Canonical Web / Lucide Definition (`src/canvas/icons.jsx:746–749`)**:
  - `IconSelectionUnion` -> Lucide `SquaresUnite` (`squares-unite.mjs`):
    `d: "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z"`
  - `IconSelectionSubtract` -> Lucide `SquaresSubtract` (`squares-subtract.mjs`)
  - `IconSelectionIntersect` -> Lucide `SquaresIntersect` (`squares-intersect.mjs`)
- **Defects**:
  1. Completely divergent metaphor: Web VOO Design uses stroked overlapping squares (`squares-*` family) on the 24×24 grid with 1.5pt stroke. Native `Icons.swift` draws filled circular Venn diagrams with arbitrary alpha fills (0.25).
  2. Stroke width is 1.4pt instead of 1.5pt; line cap and join are not set.

### 3.7 Method 45–47: `drawAlignLeft`, `drawAlignCenter`, `drawAlignRight`
- **Location**: `Sources/UI/Icons.swift:1144–1194`
- **Current Swift Implementation**:
  Draws an alignment line combined with two solid filled sharp rectangles (`ctx.fill(CGRect(x: 6, y: 6, width: 12, height: 4))`, alpha 0.6).
- **Canonical Lucide Definitions**:
  - `AlignLeft` -> Lucide `AlignStartVertical` (`align-start-vertical.mjs`):
    `path M2 2v20`, `rect x="6" y="4" width="16" height="6" rx="2"`, `rect x="6" y="14" width="9" height="6" rx="2"`.
  - `AlignCenter` -> Lucide `AlignCenterVertical` (`align-center-vertical.mjs`):
    `path M12 2v20`, flanked by two stroked rounded brackets on each side.
  - `AlignRight` -> Lucide `AlignEndVertical` (`align-end-vertical.mjs`):
    `path M22 22V2`, `rect x="2" y="4" width="16" height="6" rx="2"`, `rect x="9" y="14" width="9" height="6" rx="2"`.
- **Defects**:
  Current implementation draws filled rectangles with sharp corners and alpha tinting, violating the pure stroke-based Lucide design contract.

### 3.8 Method 67 & 68: `drawGroup` & `drawUngroup`
- **Location**: `Sources/UI/Icons.swift:1639–1680`
- **Current Swift Implementation**:
  `drawGroup` draws two overlapping 10×10 rounded rects at (3,3) and (11,11). `drawUngroup` draws two 8×8 rects at (2,2) and (14,14) with a line.
- **Canonical Lucide Definitions (`group.mjs`, `ungroup.mjs`)**:
  - `Group`: 4 corner brackets enclosing 2 internal tiles (`rect width="7" height="5"`).
  - `Ungroup`: 4 corner brackets with exploded dashed lines.
- **Defects**:
  Completely divergent silhouettes. Does not match `IconGroup` exported in `src/canvas/icons.jsx:32`.

---

## 4. Audit of Secondary & Ad-Hoc Icon Implementations Outside `VooIconFactory`

### 4.1 `Sources/UI/PropertiesPanelView.swift` (`PropertiesGlyphFactory`)
Defined at lines 124–224. Renders glyphs inside an ad-hoc 16×16 coordinate space (`scale = side / 16.0`):
- `case .settings`: Draws a 10×10 rounded square with an inset filled dot `(6.3, 6.3, 3.4, 3.4)`. **Diverges** from Lucide `Settings` (gear glyph).
- `case .transfer`: Two opposing horizontal arrows in 16×16 space. **Diverges** from canonical `IconSwap` (`src/canvas/icons.jsx:166`).
- `case .eyedropper`: Solid filled wedge and bulb in 16×16 space. **Diverges** from Lucide `Pipette` (`pipette.mjs`).
- `case .cornerRadius`: Solid filled quarter-disc wedge. **Diverges** from canonical `IconCornerRadius` (`src/canvas/icons.jsx:248`).
- `case .chevronDown`: Re-implements chevron down path in 16×16 space instead of delegating to `VooIconFactory.drawChevronDown`.

### 4.2 `Sources/UI/LayersPanel.swift` (`LayersGlyphDrawing`)
Defined at lines 135–286:
- `case .sortArrows`: Custom inline drawing of two opposing horizontal arrows with manual trigonometric offsets. Should delegate to canonical `VooIconFactory.drawSwap`.
- `case .mask`: Draws a rounded frame with a half-disc inside (`radius: 5.5`). Should delegate to canonical `VooIconFactory.drawMask` (`IconMask` in `icons.jsx:198`, which has a full filled circle `r=4`).
- `case .folder`: Custom inline path drawing of a folder `(3, 8)-(3, 6)-(9, 6)-(11, 8)...`. Should delegate to canonical `VooIconFactory.drawFolder` (`folder.mjs`).
- `case .chevronDown`: Custom inline chevron drawing; duplicate of `VooIconFactory.drawChevronDown`.
- `case .diamond`: Custom inline diamond with sharp corners `(12, 3)-(21, 12)-(12, 21)-(3, 12)`. Should delegate to canonical `VooIconFactory.drawDiamond` (`diamond.mjs`, which has `a2.41` corner radii).
- `case .penCurve`: Custom inline S-curve with two solid filled circles at endpoints. Should delegate to canonical `VooIconFactory.drawSpline` (`spline.mjs`).
- `case .square` & `case .circle`: Custom inline shapes; should delegate to `VooIconFactory.drawShapes` and `VooIconFactory.drawEllipse`.

### 4.3 `Sources/UI/WelcomeDashboardView.swift`
- `drawFolderIcon` (line 1801): Ad-hoc folder drawing. Diverges from Lucide `Folder`.
- `drawStarIcon` (line 1829): Ad-hoc 10-point star with sharp vertices. Diverges from Lucide `Star`.
- `drawRefreshIcon` (line 1856): Ad-hoc single circular arc with arrowhead. Diverges from Lucide `RefreshCw` (`refresh-cw.mjs`).
- `drawFigmaIcon` (line 1887): Ad-hoc Figma logo. In `Icons.swift:1002`, Figma import is designated to Lucide `Layers` (`drawLayers`).
- `drawImageIcon` (line 1931): Ad-hoc image drawing with custom mountain path. Diverges from Lucide `Image` (`image.mjs`).

### 4.4 `Sources/UI/TitleBar.swift`
- `case .close` (line 319): Custom inline X drawing. Should delegate to canonical Lucide `X` (`drawClose` / `x.mjs`).
- `case .plus` (line 335): Custom inline plus drawing. Should delegate to `VooIconFactory.drawPlus`.
- `case .settings` (line 350): Custom inline polygon lightning bolt `P(7.0, 0.0)`. Should delegate to `VooIconFactory.drawZap` or Lucide `Bolt` / `Settings`.

### 4.5 `Sources/UI/EditorChrome.swift` (`EditorChromeGlyph`)
Lines 90–407 contain private implementations:
- `drawPage`: Custom inline file page drawing.
- `drawMagnet`: Custom inline magnet drawing.
- `drawMarquee`: Custom inline dashed marquee.
- `drawRotate`: Custom 44-step open circular arrow loop.
- `drawFlipVertical` / `drawFlipHorizontal`: Inverted axis triangle pairs.
- `drawDiamond`: Sharp diamond polygon.
- `drawSparkle`: Ad-hoc 4-pointed sparkle.

### 4.6 `Sources/UI/WindowController.swift`
- Line 2216: `item.image = NSImage(systemSymbolName: "rectangle.on.rectangle", accessibilityDescription: nil)`
- Direct violation of R3 / Acceptance Criteria banning `NSImage(systemSymbolName:)`. Should be rendered via pure vector drawing using canonical Lucide `Copy` (`VooIconFactory.drawCopy`).

---

## 5. Comprehensive Catalog of Missing Icons Needed in `VooIconFactory`

To allow all panels to completely eradicate private and inline icon drawing routines, `VooIconFactory` must expose the following canonical icons:

| Icon Method to Add | Lucide Glyph | Canonical Source Path | SVG Path / Geometry | Primary Consumers |
|---|---|---|---|---|
| `drawFolder` | `Folder` | `icons/folder.mjs` | `d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"` | `WelcomeDashboardView` (sidebar, toolbar), `LayersPanel` (group row) |
| `drawRefreshCw` / `drawRefresh` | `RefreshCw` | `icons/refresh-cw.mjs` | `M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8`, `M21 3v5h-5`, `M21 12a9 9 0 0 1-9 9...`, `M8 16H3v5` | `WelcomeDashboardView` (rescan button) |
| `drawSwap` | `IconSwap` | `src/canvas/icons.jsx:166` | `M3 8.75H21L17.6 4.75`, `M21 14.75H3L6.4 18.75` | `PropertiesPanelView` (swap fill/stroke), `LayersPanel` (sort button) |
| `drawSettings` | `Settings` | `icons/settings.mjs` | Gear contour with 6 teeth + `circle cx="12" cy="12" r="3"` | `PropertiesPanelView` (section header preset button), `TitleBar` |
| `drawPipette` | `Pipette` | `icons/pipette.mjs` | Diagonal eyedropper with bulb and droplet `M12 9-8.414 8.414...` | `PropertiesPanelView` (color picker eyedropper) |
| `drawCornerRadius` | `IconCornerRadius` | `src/canvas/icons.jsx:248` | `M4 20V16C4 9.37258 9.37258 4 16 4H20` | `PropertiesPanelView` (corner radius field) |
| `drawMask` | `IconMask` | `src/canvas/icons.jsx:198` | `rect x="3" y="4" width="18" height="16" rx="3" ry="3"` + `circle cx="12" cy="12" r="4"` (filled) | `LayersPanel` (mask layer icon) |
| `drawDiamond` | `Diamond` | `icons/diamond.mjs` | `M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z` | `LayersPanel` (component/symbol layer), `EditorChrome` |
| `drawSpline` | `Spline` | `icons/spline.mjs` | `circle cx="19" cy="5" r="2"`, `circle cx="5" cy="19" r="2"`, `path M5 17A12 12 0 0 1 17 5` | `LayersPanel` (path layer), `EditorChrome` |
| `drawImage` | `Image` | `icons/image.mjs` | `rect (3,3,18,18) rx=2`, `circle cx="9" cy="9" r="2"`, `path m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21` | `WelcomeDashboardView` (screenshot card), `LayersPanel` (image layer) |
| `drawClose` | `X` | `icons/x.mjs` | `path d="M18 6 6 18"`, `path d="m6 6 12 12"` | `TitleBar` (tab close button), modal dialogs |
| `drawMagnet` | `Magnet` | `icons/magnet.mjs` | Horseshoe body with pole stripes | `EditorChrome` (snapping toggle) |
| `drawSparkles` | `Sparkles` | `icons/sparkles.mjs` | Central 4-pointed sparkle + small secondary stars | `EditorChrome` (AI generation button) |
| `drawRotateCcw` | `RotateCcw` | `icons/rotate-ccw.mjs` | Counter-clockwise arc with arrowhead | `EditorChrome` (rotation tool) |

---

## 6. Implementation Blueprint & Recommendations for Implementer

### 6.1 Standardized 24×24 Vector Context Helper
To resolve centering flaws, non-square bounding box distortions, line cap/join omissions, and coordinate inconsistencies in a single clean pattern, `VooIconFactory` should introduce a private canvas wrapper:

```swift
private static func withCanonicalCanvas(
    in rect: CGRect,
    color: NSColor,
    strokeWidth: CGFloat = 1.5,
    _ body: (CGContext) -> Void
) {
    guard let ctx = NSGraphicsContext.current?.cgContext else { return }
    guard rect.width > 0, rect.height > 0 else { return }
    ctx.saveGState()
    
    // Perfect 24×24 uniform aspect ratio scaling & centering
    let s = min(rect.width, rect.height) / 24.0
    let ox = rect.midX - 12.0 * s
    let oy = rect.midY + 12.0 * s
    
    ctx.translateBy(x: ox, y: oy)
    ctx.scaleBy(x: s, y: -s)
    
    // Canonical Lucide stroke defaults
    ctx.setStrokeColor(color.cgColor)
    ctx.setFillColor(color.cgColor)
    ctx.setLineWidth(strokeWidth)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    
    body(ctx)
    ctx.restoreGState()
}
```

### 6.2 Standard Parameter Signatures
All stroked icon methods in `VooIconFactory` must conform to:
```swift
public static func drawIconName(in rect: CGRect, color: NSColor = .white, strokeWidth: CGFloat = 1.5)
```
This satisfies the canonical 1.5pt rule (`UI_SPEC.md`, `icons.jsx`), while preserving the ability for callers on zoomed stages (e.g. `CanvasStageView`) to pass scaled values such as `1.5 / zoom`.

### 6.3 Remediation of Flipped Coordinate Workarounds
Once `drawText` is aligned with canonical Lucide `Type` (y=4 to y=20), the inverted T workaround in `LayersPanel.swift:188–197` can be completely deleted.

### 6.4 Panel Deduplication Plan
1. **PropertiesPanelView.swift**:
   - Replace `PropertiesGlyphFactory` entirely by delegating directly to `VooIconFactory`:
     - `.settings` -> `VooIconFactory.drawSettings`
     - `.transfer` -> `VooIconFactory.drawSwap`
     - `.eyedropper` -> `VooIconFactory.drawPipette`
     - `.cornerRadius` -> `VooIconFactory.drawCornerRadius`
     - `.chevronDown` -> `VooIconFactory.drawChevronDown`
2. **LayersPanel.swift**:
   - Delete inline SVG drawings inside `LayersGlyphDrawing`.
   - Forward all cases to `VooIconFactory`.
3. **WelcomeDashboardView.swift**:
   - Delete private helpers `drawFolderIcon`, `drawStarIcon`, `drawRefreshIcon`, `drawFigmaIcon`, `drawImageIcon`.
   - Replace with `VooIconFactory.drawFolder`, `VooIconFactory.drawStar`, `VooIconFactory.drawRefreshCw`, `VooIconFactory.drawLayers`, `VooIconFactory.drawImage`.
4. **TitleBar.swift**:
   - Replace inline drawing in `AppTitleBarTabButton` with `VooIconFactory.drawClose`, `VooIconFactory.drawPlus`, `VooIconFactory.drawZap`.
5. **WindowController.swift**:
   - Replace `NSImage(systemSymbolName: "rectangle.on.rectangle")` with pure CoreGraphics vector image rendering via `VooIconFactory.drawCopy`.

---

## 7. Verification Strategy

1. **Build Integrity**:
   Execute `./build.sh build` to guarantee compilation with zero errors across all modules.
2. **Regression Testing**:
   Execute `./build.sh test` to verify all 300+ existing automated unit and adversarial tests pass without regression.
3. **Visual Parity**:
   Run visual tests comparing the native renderings against the web design references in `../src/canvas/` at standard sizes (12px, 13px, 14px, 15px, 16px, 20px).
