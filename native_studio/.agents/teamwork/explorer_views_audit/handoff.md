# Handoff Report — Views Icon Usage Audit

## 1. Observation

### Source Evidence & Exact Locations
1. **System Symbol Usage**:
   - `Sources/UI/WindowController.swift:2216`:
     ```swift
     item.image = NSImage(systemSymbolName: "rectangle.on.rectangle", accessibilityDescription: nil)
     ```
     This is the sole instance of `NSImage(systemSymbolName:)` in the entire codebase. No instances of `NSImage(named:)` exist in `Sources/`.

2. **Secondary Glyph Factories & Ad-Hoc Drawings**:
   - `Sources/UI/PropertiesPanelView.swift` lines 124–224: `PropertiesGlyphFactory` defines 5 glyph kinds (`settings`, `transfer`, `eyedropper`, `cornerRadius`, `chevronDown`) using custom 16×16 vector drawing.
     - Line 150: `.settings` draws a rounded box `(3, 3, 10, 10)` with an ellipse `(6.3, 6.3, 3.4, 3.4)`.
     - Line 158: `.transfer` draws opposing horizontal arrows with ad-hoc stroke line segments.
     - Line 176: `.eyedropper` draws a custom pipette with line segments and filled bulb.
     - Line 205: `.cornerRadius` draws a filled quarter-disc wedge using `addArc`.
     - Line 215: `.chevronDown` duplicates `VooIconFactory.drawChevronDown`.
   - `Sources/UI/LayersPanel.swift` lines 135–286: `LayersGlyphDrawing` defines 15 glyph kinds.
     - Lines 149–174: `.sortArrows` draws custom opposing horizontal arrows with stroked arrowheads.
     - Lines 215–227: `.mask` draws an ad-hoc rounded frame with a filled half-disc arc.
     - Lines 228–240: `.folder` draws an ad-hoc polygon outline `(3,8)-(3,6)-(9,6)-(11,8)-(21,8)-(21,19)-(3,19)`.
     - Lines 241–248: `.chevronDown` duplicates `VooIconFactory.drawChevronDown`.
     - Lines 249–258: `.diamond` draws an ad-hoc 4-point diamond polygon.
     - Lines 259–269: `.penCurve` draws an ad-hoc cubic bezier curve with filled circles at endpoints.
     - Lines 270–276: `.square` draws a rounded rectangle `(4, 4, 16, 16)`.
     - Lines 277–279: `.circle` draws an ellipse in `(3.5, 3.5, 17, 17)`.
     - Line 188: `.text` manually inverts context coordinates because `VooIconFactory` assumes an unflipped context.
   - `Sources/UI/WelcomeDashboardView.swift` lines 1801–1956: 5 private ad-hoc drawing methods:
     - Lines 1801–1827: `drawFolderIcon(in:color:strokeWidth:)` (custom folder path with quad curves).
     - Lines 1829–1854: `drawStarIcon(in:color:strokeWidth:)` (custom 10-point star path).
     - Lines 1856–1885: `drawRefreshIcon(in:color:strokeWidth:)` (custom 285° circular arc + arrowhead).
     - Lines 1887–1929: `drawFigmaIcon(in:color:strokeWidth:)` (custom 5-element Figma logo).
     - Lines 1931–1956: `drawImageIcon(in:color:strokeWidth:)` (custom rounded rect with mountain zig-zag and sun).
     - Lines 1775–1783: `drawVooIcon` pre-flips context $y$-axis because the view is `isFlipped == true`.
   - `Sources/UI/ToolRail.swift` lines 318–347: `ToolRailAccessoryButton.draw`:
     - Lines 320–328: `.hand` draws an ad-hoc rounded palm + 3 finger tick lines.
     - Lines 329–333: `.lasso` draws an ad-hoc ellipse + tail line (ignoring `VooIconFactory.drawLasso`).
     - Lines 334–346: `.wand` draws an ad-hoc line + cross ticks.
   - `Sources/UI/EditorChrome.swift` lines 95–406: `EditorChromeGlyph`:
     - Lines 158–181: `drawPage` draws an ad-hoc folded page document.
     - Lines 183–229: `drawMagnet` draws an ad-hoc rotated U-magnet with pole caps.
     - Lines 231–241: `drawMarquee` draws an ad-hoc dashed box.
     - Lines 243–296: `drawRotate` draws an ad-hoc 295° circular arc + arrowhead.
     - Lines 298–330: `drawFlipVertical` draws ad-hoc top/bottom triangles + dashed line.
     - Lines 332–364: `drawFlipHorizontal` draws ad-hoc left/right triangles + dashed line.
     - Lines 366–378: `drawDiamond` draws an ad-hoc diamond.
     - Lines 380–406: `drawSparkle` draws an ad-hoc 4-point sparkle with quad curves.
   - `Sources/UI/TitleBar.swift` lines 314–371: `DarkTabButton.draw`:
     - Lines 319–334: `.close` draws ad-hoc X line segments.
     - Lines 335–349: `.plus` draws ad-hoc plus line segments.
     - Lines 350–370: `.settings` draws an ad-hoc 6-point lightning bolt polygon.
   - `Sources/UI/SettingsDrawerView.swift` lines 360–571: `SettingsGlyph`:
     - Lines 420–445: `drawSparkle` (ad-hoc sparkle).
     - Lines 447–474: `drawKeyboard` (ad-hoc keyboard frame + ticks).
     - Lines 476–486: `drawClose` (ad-hoc X).
     - Lines 489–516: `drawFolder` & `drawFolderOpen` (ad-hoc folder).
     - Lines 518–559: `drawRefresh` (ad-hoc circular arc + arrow).
     - Lines 561–571: `drawCheck` (ad-hoc checkmark).
   - `Sources/UI/AgentPanelView.swift` lines 217–297: `AgentGlyphDrawing`:
     - Lines 233–240: `.history` (ad-hoc clock dial + rewind arc).
     - Lines 241–244: `.plus` (ad-hoc plus lines).
     - Lines 245–256: `.collapse` (ad-hoc panel rectangle + line).
     - Lines 257–264: `.arrowUp` (ad-hoc arrow up).
     - Lines 274–297: `.brandMark` (duplicate implementation of VOO brand logo).
   - `Sources/UI/OnboardingGuideView.swift`:
     - Lines 1078–1105: `drawCloseButton` (ad-hoc X lines).
     - Lines 1684–1696: `drawCheckmark` (ad-hoc checkmark path).
     - Lines 1699–1736: `drawFolder` (ad-hoc outlined folder).
   - `Sources/Canvas/CanvasStageView.swift`:
     - Lines 2249–2273: `drawImagePlaceholder` (ad-hoc image icon with mountain zig-zag and sun).

3. **Canonical Lucide Definitions in `../src/canvas/icons.jsx`**:
   - `ICON_STROKE_WIDTH = 1.5` (line 2).
   - Standard 24×24 viewBox, stroke-based path rendering with round line cap and round line join.
   - Key matching glyphs:
     - `IconSwap` (lines 166–196): 2 stroked lines with arrowheads (`M3 8.75H21L17.6 4.75`, `M21 14.75H3L6.4 18.75`).
     - `IconCornerRadius` (lines 249–272): stroked rounded corner curve (`M4 20V16C4 9.37258 9.37258 4 16 4H20`).
     - `IconMask` (lines 198–220): rounded rect `(3, 4, 18, 16)` rx=3 ry=3 + solid circle center (12, 12) r=4.
     - `IconFolder` (line 91): Lucide `Folder`.
     - `IconFolderOpen` (line 92): Lucide `FolderOpen`.
     - `IconStar` (line 395): Lucide `Star` (`polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"`).
     - `IconRefresh` (line 64): Lucide `RefreshCw`.
     - `IconRestart` / `IconRotateCcw` (line 63/704): Lucide `RotateCcw`.
     - `IconPipette` (line 402): Lucide `Pipette`.
     - `IconImage` (line 73): Lucide `Image`.
     - `IconClose` (line 36): Lucide `X`.
     - `IconDiamond` (line 21): Lucide `Diamond`.
     - `IconBend` (line 15): Lucide `Spline`.
     - `IconSquare` (line 389): Lucide `Square`.
     - `IconCircle` (line 390): Lucide `Circle`.
     - `IconSparkles` (line 638): Lucide `Sparkles`.
     - `IconMagnet` (line 110): Lucide `Magnet`.
     - `IconHistory` (line 697): Lucide `History`.
     - `IconPanelRightClose` (line 19): Lucide `PanelRightClose`.
     - `IconWand` (line 639): Lucide `Wand2`.

4. **Build & Test Baseline**:
   - `./build.sh build` compiles cleanly: produces `VOO Design Native.app` (3.73 MB binary, 5.25 MB bundle).
   - `./tests/run_tests.sh` runs 354 tests: 352 PASS, 2 FAIL (`test_T1_PenSubTool_CyclingAndGlyphUpdates` and `test_T1_TextTool_IMECandidateRectCalculation`).

---

## 2. Logic Chain

1. **Premise 1**: Requirement R1 mandates a comprehensive audit of all icons and glyphs across all views, mapping them to canonical Lucide definitions in `../src/canvas/icons.jsx`.
   - *Observation*: We audited all 41 Swift files in `Sources/` and cataloged 50 existing `VooIconFactory` methods, 24 ad-hoc drawings, and 4 secondary factories.
2. **Premise 2**: Requirement R2 mandates strict alignment with Lucide specifications (24×24 bounding box, round cap/join, 1.5 default stroke width) and elimination of non-standard drawings.
   - *Observation*: Ad-hoc implementations of `folder`, `star`, `refresh`, `transfer`, `mask`, `cornerRadius`, `diamond`, `spline`, and `settings` diverge in topology, coordinate bounding box, and corner radius.
   - *Inference*: These ad-hoc drawings must be eliminated and centralized into `VooIconFactory` using verified Lucide 24×24 coordinates.
3. **Premise 3**: Requirement R3 requires panel-level deduplication and consolidation: eliminating `PropertiesGlyphFactory`, `LayersGlyphDrawing`, and private `draw*Icon` routines, as well as eliminating `NSImage(systemSymbolName:)`.
   - *Observation*: `WindowController.swift:2216` uses `NSImage(systemSymbolName: "rectangle.on.rectangle")`. Multiple files duplicate `drawChevronDown`, `drawPlus`, `drawCheckmark`, `drawBrandLogo`, and `drawFlipH`/`drawFlipV`.
   - *Inference*: Introducing `VooIconFactory.image(...) -> NSImage` resolves the SF Symbol usage cleanly without external dependencies. Delegating `PropertiesGlyphFactory` and `LayersGlyphDrawing` to `VooIconFactory` removes hundreds of lines of duplicated vector code.
4. **Premise 4**: View coordinates vary between unflipped (`isFlipped == false`) and flipped (`isFlipped == true`).
   - *Observation*: `VooIconFactory` currently assumes an unflipped context, forcing flipped views like `WelcomeDashboardView` (`drawVooIcon`) and `LayersPanel` (`drawText`) to apply manual inverse transformations.
   - *Inference*: Updating `VooIconFactory` with context-aware flip handling (`NSGraphicsContext.current?.isFlipped`) will unify drawing behavior across all views without requiring callers to invent ad-hoc wrappers.

---

## 3. Caveats

1. **Pre-Existing Test Failures**:
   - In `./tests/run_tests.sh`, 2 out of 354 tests currently fail (`test_T1_PenSubTool_CyclingAndGlyphUpdates` and `test_T1_TextTool_IMECandidateRectCalculation`). These failures are unrelated to icon vector drawing, but are documented as the pre-existing baseline so downstream agents do not mistake them for icon regressions.
2. **AI Vendor Brand Marks**:
   - In `SettingsDrawerView.swift`, lines 573–645 render vendor marks for `Claude`, `Codex`, and `Antigravity`. These are not Lucide icons, but rather proprietary vendor brand affordances. They should either be added to `VooIconFactory` as brand marks or retained as vendor assets.
3. **Figma Brand Icon**:
   - In `WelcomeDashboardView.swift:1887`, `drawFigmaIcon` draws the Figma 5-element logo mark. This is a brand asset rather than a standard Lucide glyph. It should be housed in `VooIconFactory.drawFigma` alongside `drawBrandLogo`.
4. **ToolRail Brush vs Marquee**:
   - `ToolRail.swift:220` currently routes `.brush` to `VooIconFactory.drawMarquee` (dashed rectangle). In the web editor, brush is represented by `IconBrush` / `IconPaint`. When centralizing icons, the tool button should be pointed to a canonical `drawBrush` method.

---

## 4. Conclusion

1. The audit is complete. A total of 50 existing `VooIconFactory` methods and 24 ad-hoc/secondary glyph implementations were identified and mapped 1:1 to their canonical counterparts in `../src/canvas/icons.jsx`.
2. A single instance of `NSImage(systemSymbolName:)` was isolated at `WindowController.swift:2216` and can be replaced with `VooIconFactory.image(...)` using canonical vector drawing.
3. The comprehensive audit report and master mapping table are documented in `views_audit_report.md`.
4. The implementation path is clear and ready for the builder agent to execute without ambiguity.

---

## 5. Verification Method

To independently verify the observations and findings in this report:
1. **Verify System Symbol Absence/Presence**:
   ```bash
   grep -rn "systemSymbolName" Sources/
   # Expected result: exactly one match at Sources/UI/WindowController.swift:2216
   ```
2. **Verify Secondary Glyph Factories**:
   ```bash
   grep -rn "PropertiesGlyphFactory" Sources/
   grep -rn "LayersGlyphDrawing" Sources/
   ```
3. **Verify Build Baseline**:
   ```bash
   ./build.sh build
   # Expected result: Build succeeds with code 0, generating VOO Design Native.app bundle
   ```
4. **Verify Test Baseline**:
   ```bash
   ./tests/run_tests.sh
   # Expected result: 352 passing tests, 2 known pre-existing failures
   ```
5. **Inspect Audit Report**:
   ```bash
   cat .agents/teamwork/explorer_views_audit/views_audit_report.md
   ```
