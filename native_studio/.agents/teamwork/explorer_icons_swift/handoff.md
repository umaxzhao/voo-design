# Handoff Report: Icons.swift Vector Audit & Canonical Lucide Alignment

**Agent**: explorer_icons_swift  
**Role**: Vector Icon Auditor & Synthesizer  
**Date**: 2026-10-21  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/explorer_icons_swift/`  
**Target Codebase**: `Sources/UI/Icons.swift` (`VooIconFactory`)  
**Companion Artifact**: `icons_swift_audit.md` (Comprehensive audit of all 71 methods)

---

## 1. Observation

### 1.1 Complete Method Inventory in `VooIconFactory`
Direct analysis of `Sources/UI/Icons.swift` revealed **71 static methods** (not 50 as previously assumed, due to 21 additional sub-tool and taskbar glyphs at lines 1260–1758):
- **Core Canvas Tools & Chrome (1–39)**:
  `drawBrandLogo` (line 16), `drawCursor` (53), `drawFrame` (86), `drawMarquee` (106), `drawPen` (123), `drawEraser` (162), `drawText` (190), `drawShapes` (210), `drawCube` (229), `drawUndo` (261), `drawRedo` (288), `drawGrid` (315), `drawPlus` (340), `drawMinus` (358), `drawClock` (375), `drawFileText` (395), `drawLayoutGrid` (435), `drawCompass` (459), `drawArrowRight` (486), `drawZap` (511), `drawLayoutList` (538), `drawSearch` (563), `drawSliders` (581), `drawContrast` (608), `drawCopy` (632), `drawTrash` (659), `drawEye` (698), `drawEyeOff` (723), `drawLock` (747), `drawUnlock` (775), `drawChevronDown` (802), `drawChevronRight` (825), `drawArrowUp` (848), `drawGlobe` (873), `drawSmartphone` (892), `drawMonitor` (913), `drawPresentation` (935), `drawCamera` (968), `drawLayers` (1003).
- **Boolean & Contextual Alignment Operations (40–50)**:
  `drawBooleanUnion` (1043), `drawBooleanSubtract` (1062), `drawBooleanIntersect` (1083), `drawBooleanXor` (1103), `drawBooleanDivide` (1123), `drawAlignLeft` (1144), `drawAlignCenter` (1161), `drawAlignRight` (1178), `drawNodeSharp` (1197), `drawNodeSmooth` (1219), `drawNodeSmart` (1240).
- **Sub-tools & Secondary Operations (51–71)**:
  `drawRect` (1260), `drawEllipse` (1278), `drawLine` (1291), `drawPolygon` (1305), `drawStar` (1336), `drawArrow` (1369), `drawCurvaturePen` (1393), `drawPencil` (1420), `drawLasso` (1448), `drawFlipH` (1473), `drawFlipV` (1511), `drawAlignTop` (1549), `drawAlignMiddle` (1567), `drawAlignBottom` (1585), `drawDistributeH` (1603), `drawDistributeV` (1621), `drawGroup` (1639), `drawUngroup` (1660), `drawCode` (1682), `drawSvg` (1712), `drawCheckmark` (1739).

### 1.2 Stroke Width Discrepancies
- Reference `UI_SPEC.md:20` and `../src/canvas/icons.jsx:2` specify:
  `export const ICON_STROKE_WIDTH = 1.5;`
- Observed `VooIconFactory` default parameter values:
  - `strokeWidth = 1.8`: 35 methods
  - `strokeWidth = 2.0`: 6 methods (`drawText:190`, `drawUndo:261`, `drawRedo:288`, `drawPlus:340`, `drawMinus:358`, `drawCheckmark:1739`)
  - `strokeWidth = 1.6`: 3 methods (`drawCube:229`, `drawLayoutGrid:435`, `drawLayoutList:538`)
  - `strokeWidth = 1.5`: 11 methods (`drawAlignLeft/Center/Right`, `drawAlignTop/Middle/Bottom`, `drawDistributeH/V`, `drawNode*`)
  - `strokeWidth = 1.4`: 5 methods (`drawBoolean*`)
  - Missing parameter / hardcoded: `drawBrandLogo:46` (`ctx.setLineWidth(1.6)`), `drawCursor:76` (`ctx.setLineWidth(1.8)`).

### 1.3 Missing Caps & Joins
- **Line joins**: **48 of 71 methods** lack `ctx.setLineJoin(.round)`, resulting in sharp miter joints that diverge from Lucide's rounded stroke aesthetic.
- **Line caps**: **15 methods** lack `ctx.setLineCap(.round)`.

### 1.4 Coordinate System & Inversion Defects
- Transform across all methods:
  ```swift
  let s = min(rect.width, rect.height) / 24.0
  ctx.translateBy(x: rect.origin.x, y: rect.origin.y + rect.height)
  ctx.scaleBy(x: s, y: -s)
  ```
- **Centering bug**: `x: rect.origin.x` aligns to the left boundary in rectangular rects (e.g. 28×20), rather than centering at `rect.midX - 12 * s`.
- **`drawText` inverted Y**:
  ```swift
  // Top horizontal crossbar of 'T' (at y = 19)
  ctx.strokeLineSegments(between: [CGPoint(x: 4, y: 19), CGPoint(x: 20, y: 19)])
  // Vertical stem of 'T' (from y = 19 down to y = 5)
  ctx.strokeLineSegments(between: [CGPoint(x: 12, y: 19), CGPoint(x: 12, y: 5)])
  ```
  In an unflipped AppKit view with `scaleBy(x: s, y: -s)`, `y = 19` maps to the bottom. The 'T' rendered upside-down.
  Directly observed in `Sources/UI/LayersPanel.swift:188–197`:
  ```swift
  case .text:
      // VooIconFactory glyphs are authored in a y-up space; the layer rows
      // live in a flipped NSTableView, so flip the T back upright.
      guard let ctx = NSGraphicsContext.current?.cgContext else { return }
      ctx.saveGState()
      ctx.translateBy(x: 0, y: rect.midY)
      ctx.scaleBy(x: 1, y: -1)
      ctx.translateBy(x: 0, y: -rect.midY)
      VooIconFactory.drawText(in: rect, color: color, strokeWidth: strokeWidth)
      ctx.restoreGState()
      return
  ```

### 1.5 Concrete Topology Mismatches
1. `drawCursor:53` vs `mouse-pointer-2.mjs`:
   `Icons.swift` uses a 7-vertex sharp polygon `(5,20)-(5,5)-(9.5,9.5)-(13.5,3.5)-(15.5,5.0)-(11.5,11.0)-(17.5,11.0)`. Lucide `MousePointer2` is `M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z`.
2. `drawPen:123` vs `pen-tool.mjs`:
   Completely missing ink breather circle `circle cx="11" cy="11" r="2"`.
3. `drawEraser:162` vs `eraser.mjs`:
   Sharp polygonal vertices without the `a2 2` rounded corner arcs.
4. `drawZap:511` vs `zap.mjs`:
   Sharp vertices `(13,2)-(3,14)-(12,14)-(11,22)-(21,10)-(12,10)` without Lucide's `a1.5 1.5` rounded tips and `a0.5 0.5` inner kinks.
5. `drawUndo:261` & `drawRedo:288` vs `undo-2.mjs` & `redo-2.mjs`:
   Return arcs truncate at `(20, 15)` and `(4, 15)`, omitting horizontal return strokes to `H11` and `H13`.
6. `drawSearch:563` vs `search.mjs`:
   Stroked ellipse in `CGRect(3, 3, 14, 14)` (center 10,10, radius 7); Lucide has center `(11, 11)` radius 8.
7. `drawContrast:608` vs `contrast.mjs`:
   Fills outer radius 10 half-circle; Lucide inner arc has radius 6 (`M12 18a6 6 0 0 0 0-12v12z`).
8. `drawLock:747` & `drawUnlock:775` vs `lock.mjs` & `lock-open.mjs`:
   Body width is 16pt instead of 18pt. Unlock shackle is 180° arc instead of open swing curve `9.9-1`.
9. `drawBooleanUnion/Subtract/Intersect:1043–1101` vs `squares-unite.mjs`, `squares-subtract.mjs`, `squares-intersect.mjs`:
   Divergent Venn diagrams with 0.25 alpha fills instead of pure stroke outlines of overlapping squares.
10. `drawGroup:1639` & `drawUngroup:1660` vs `group.mjs` & `ungroup.mjs`:
   Divergent overlapping rectangles instead of Lucide's 4 corner brackets and internal tiles.

### 1.6 Ad-hoc Secondary Drawing Routines Across Codebase
- `Sources/UI/PropertiesPanelView.swift:124–224` (`PropertiesGlyphFactory`): 5 ad-hoc glyphs (`settings`, `transfer`, `eyedropper`, `cornerRadius`, `chevronDown`) in a 16×16 box.
- `Sources/UI/LayersPanel.swift:135–286` (`LayersGlyphDrawing`): 8 ad-hoc glyphs (`sortArrows`, `mask`, `folder`, `chevronDown`, `diamond`, `penCurve`, `square`, `circle`).
- `Sources/UI/WelcomeDashboardView.swift:1801–1956`: 5 private inline routines (`drawFolderIcon`, `drawStarIcon`, `drawRefreshIcon`, `drawFigmaIcon`, `drawImageIcon`).
- `Sources/UI/TitleBar.swift:319–370`: 3 inline routines (`.close`, `.plus`, `.settings`).
- `Sources/UI/EditorChrome.swift:90–407`: 8 inline routines (`drawPage`, `drawMagnet`, `drawMarquee`, `drawRotate`, `drawFlipVertical`, `drawFlipHorizontal`, `drawDiamond`, `drawSparkle`).
- `Sources/UI/WindowController.swift:2216`:
  `item.image = NSImage(systemSymbolName: "rectangle.on.rectangle", accessibilityDescription: nil)` (System symbol violation).

---

## 2. Logic Chain

1. **Premise**: VOO Design requires strict visual and geometric parity between web (`../src/canvas/icons.jsx`) and native AppKit (`Sources/UI/Icons.swift`).
2. **Standardization Rule**: All icons must share a 24×24 coordinate grid, stroke-based rendering with round line cap and join, and a default stroke width of 1.5pt (`UI_SPEC.md:20`).
3. **Current Deviation**:
   - `VooIconFactory` currently diverges across stroke width (1.4–2.0pt), line joins (omitted in 67% of methods), and corner rounding (omitted in key tools like pen, eraser, zap, layers, cube).
   - `drawText` was authored with inverted Y assumptions, creating an upside-down icon in standard views and forcing downstream workarounds.
   - Calling views (`WelcomeDashboardView`, `PropertiesPanelView`, `LayersPanel`, `TitleBar`, `EditorChrome`, `WindowController`) bypassed `VooIconFactory` and implemented divergent private icon drawings because `VooIconFactory` lacked canonical icons (such as `Folder`, `Star`, `RefreshCw`, `Swap`, `Settings`, `Pipette`, `CornerRadius`, `Mask`, `Diamond`, `Spline`, `Image`, `Close`).
4. **Conclusion**:
   - Canonicalizing `VooIconFactory` requires introducing a centralized `withCanonicalCanvas` helper that enforces proper 24×24 aspect-ratio centering, round caps, round joins, and 1.5pt stroke width.
   - The 10 divergent icon geometries must be updated to exact Lucide vector path data.
   - The 14 missing icons must be added to `VooIconFactory` so all panels can eliminate their private ad-hoc drawings.
   - The system symbol call in `WindowController` must be replaced with vector drawing via `VooIconFactory.drawCopy`.

---

## 3. Caveats

1. **Metal Shader Stages**: This audit specifically covered 2D CoreGraphics vector drawing in AppKit UI views (`Sources/UI/`). Metal pipeline render passes (`Sources/Canvas/MetalCanvasStage.swift`) were not altered or in scope for vector icon changes.
2. **Brand Assets**: `drawBrandLogo` is a proprietary VOO brand mark (hexagon + triangle + circle), not a Lucide icon. It should maintain its canonical geometry while adopting standard centering and stroke parameters.
3. **Domain-Specific Node Glyphs**: `drawNodeSharp`, `drawNodeSmooth`, and `drawNodeSmart` are specialized CAD vector path node indicators from the Affinity/Figma vector engine. They should be retained in `VooIconFactory` but standardized with 1.5pt stroke and round joins.

---

## 4. Conclusion

The audit is complete. All 71 methods in `VooIconFactory` and all ad-hoc secondary icon implementations across `native_studio` have been cataloged with exact file paths, line numbers, Lucide counterparts, and vector path topologies.

The comprehensive findings and implementation specifications are recorded in:
`/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/explorer_icons_swift/icons_swift_audit.md`

Downstream implementers can now execute the consolidation and vector canonicalization directly from these specifications with zero ambiguity.

---

## 5. Verification Method

To independently verify the audit findings:
1. **Method Count & Signatures**:
   Run:
   ```bash
   grep -n "public static func draw" Sources/UI/Icons.swift
   ```
   Confirm all 71 methods and their line numbers match Section 2.
2. **Canonical Lucide Comparison**:
   Inspect any icon's canonical node definition in `../node_modules/lucide-react/dist/esm/icons/<name>.mjs` and compare with Section 3.
3. **Build & Test Verification**:
   Run:
   ```bash
   ./build.sh build
   ./build.sh test
   ```
   Verification condition: `./build.sh build` completes with zero errors, and `./build.sh test` completes with 100% test pass rate.
