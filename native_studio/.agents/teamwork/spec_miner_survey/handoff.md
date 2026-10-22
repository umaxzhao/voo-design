# Handoff Report: Lucide Icon Specification Mining

**Task**: Canonical Lucide Icon Specification Mining for `native_studio`  
**Agent**: Specification Miner (`spec_miner_survey`)  
**Date**: 2026-10-21  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/`  
**Deliverable**: `/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/lucide_spec_report.md`  

---

## 1. Observation

Direct code observations from authoritative specification sources:

### Authoritative Web & Icon System Sources
- **`src/canvas/icons.jsx`**:
  - Line 2: `export const ICON_STROKE_WIDTH = 1.5;`
  - Lines 6–9: *"Icons come from Lucide (ISC, 24x24, stroke-based) — the stroke drawing is what makes them sit quietly behind the content at the 13-17px sizes this UI uses."*
  - Lines 14–123, 389–405, 632–756: Defines **214 direct Lucide icon re-exports** (`Pin`, `Spline`, `Scissors`, `PanelLeft`, `Search`, `SlidersHorizontal`, etc.).
  - Lines 142–250, 321–387, 407–620, 872–1014, 1052–1385: Defines **31 custom handcrafted vector function components** (`IconHelp`, `IconSwap`, `IconMask`, `IconLayerPrompt`, `IconCornerRadius`, `IconOpacity`, `IconHealAi`, `IconHealPatch`, `IconSelectionRect`, `IconSelectionEllipse`, `IconSelectionFree`, `IconPatch`, `IconSelectionPolygon`, `IconAiAutoMask`, `IconAiObjectSelection`, `IconAiRemove`, `IconPerspective`, `IconMeshWarp`, `IconDistort`, `IconVectorSquare`, `IconHd`, `IconGoogle`, `IconGithub`, `IconChrome`, `IconOpenCode`, `IconCredits`, `IconSphere`, `IconHelix`, `IconIcosahedron`, `IconDodecahedron`, `IconTorusKnot`).
  - Lines 622–631, 1228–1232: Defines **8 aliases and named export constants** (`IconObjectSelection`, `IconQuickSelection`, `IconRemove`, `IconMagic`, `IconRegionRect`, `IconRegionFree`, `IconRegion`, `IconCredit/IconPoints`).
- **`node_modules/lucide-react/dist/esm/icons/*.mjs`**:
  - Each icon module exports `__iconData` containing canonical `name`, `size: 24`, and an array of `node: [ [tag, attrs], ... ]` detailing exact `<path>`, `<circle>`, `<rect>`, `<line>`, `<polyline>`, and `<polygon>` elements.
- **`src/canvas/icons_motion.jsx`**:
  - Lines 4–20: Handcrafted filled overlapping motion glyph `IconMotion` (`viewBox="0 0 24 24"`, compound filled `<path d="M15.5 2.00023C12.13..." fill="currentColor" />`).
- **`src/canvas/components/editor_properties/kind_icons.jsx`**:
  - Lines 67–113: Maps 37 adjustment and layer-style kinds to Lucide `IconGlyph*` components.
  - Lines 132–156: Defines 3 handcrafted adjustment glyphs with Photoshop split-tone metaphors (`blackAndWhite`, `invert`, `threshold`) and a central fallback circle `FALLBACK` (`<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />`).
- **`public/voo-mark.svg`**:
  - Lines 1–5: Canonical VOO Brand Logo (`viewBox="0 0 24 24"`), compound filled path `d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016 16.5294 8.82703 16.5294 11.5C16.5294 14.173 14.2777 16.3398 11.5 16.3398C8.72233 16.3398 6.47059 14.173 6.47059 11.5C6.47059 8.82703 8.72233 6.66016 11.5 6.66016Z" fill="black"`.
- **`native_studio/UI_SPEC.md`**:
  - Section 0: `Icon: 13 / 14 / 16 / 20（按位置），stroke 1.5（细）/2（常规） 不使用彩色 emoji`
  - Explicit sizing constraints: 12px (opacity pill), 13px (open button, layers search/sort, properties headers, zoom bar, island bar), 14px (nav, +new, layer type/visibility, layers bottom bar), 15px (settings tabs), 16px (tool rail, tab close, import cards, agent header), 20px (brand logo, settings), 21px (recents view switch), 24px (new tab plus circle).

### Observed Native Divergence in `native_studio`
- **`Sources/UI/Icons.swift` (`VooIconFactory`)**:
  - 71 methods implemented, but missing critical canonical icons: `drawFolder`, `drawSettings`, `drawRefresh`, `drawSwap`, `drawPipette`, `drawCornerRadius`, etc.
  - `drawBrandLogo` (lines 16–50) draws outer hexagon and triangle then strokes a separate circle with line width 1.6, rather than filling the single compound cutout path from `voo-mark.svg`.
  - Several methods use hardcoded line width 1.8 instead of 1.5 (e.g. `drawFrame` line 86, `drawCursor` line 76).
- **`Sources/UI/PropertiesPanelView.swift` (`PropertiesGlyphFactory`)**:
  - Lines 124–224: Implements ad-hoc custom drawings for `.settings` (square with dot), `.transfer` (custom arrows instead of Lucide `IconSwap`), `.eyedropper` (custom pipette instead of Lucide `Pipette`), and `.cornerRadius` (quarter wedge instead of Lucide `IconCornerRadius`).
- **`Sources/UI/LayersPanel.swift` (`LayersGlyphDrawing`)**:
  - Lines 135–250: Implements ad-hoc `.sortArrows` (line segments), `.mask` (half-disc), and `.folder` (divergent folder geometry).
- **`Sources/UI/WelcomeDashboardView.swift`**:
  - Lines 1801–1931: Hardcodes private methods `drawFolderIcon`, `drawStarIcon`, `drawRefreshIcon`, `drawFigmaIcon`, `drawImageIcon`.
- **`Sources/UI/WindowController.swift`**:
  - Line 2216: Directly instantiates an SF Symbol `NSImage(systemSymbolName: "rectangle.on.rectangle", accessibilityDescription: nil)`, violating the Lucide vector standard.

---

## 2. Logic Chain

1. **Authoritative Source Hierarchy**:
   - `src/canvas/icons.jsx` is the primary, authoritative vector specification for VOO Design icons.
   - It re-exports Lucide icons and defines bespoke vector icons, establishing a unified visual language: 24×24 coordinate grid, stroke 1.5pt, `.round` line cap and join, `stroke="currentColor"`.
2. **Exhaustive Geometry Extraction**:
   - By querying `lucide-react` (v1.59.0) module metadata via automated AST parsing, exact path coordinates (`d="..."`), line points, circle radii, and rect boundaries were retrieved for all 214 Lucide exports with zero errors.
   - All 31 custom functions in `icons.jsx`, 8 aliases, 4 hand-drawn adjustment kinds in `kind_icons.jsx`, 1 motion glyph in `icons_motion.jsx`, and the VOO brand mark were parsed and mapped. Total: **261 canonical features**.
3. **Target Size Alignment with UI_SPEC.md**:
   - `UI_SPEC.md` defines target screen sizes: 12px, 13px, 14px, 15px, 16px, 20px, 21px, 24px.
   - On macOS Retina displays (backing scale 2.0), sizes 12px, 14px, 16px, 20px, 24px land on integer pixel counts (24, 28, 32, 40, 48 pixels), ensuring zero blur.
   - Scaling the 24×24 grid down to these sizes requires standardizing context line width scaling: either scaled proportionally ($1.5 \times s / 24$) or maintaining constant optical weight ($1.5 / \text{scale}$).
4. **Consolidation Rationale**:
   - Fragmented secondary glyph factories (`PropertiesGlyphFactory`, `LayersGlyphDrawing`, and private `draw*Icon` methods in `WelcomeDashboardView.swift` and `WindowController.swift`) diverge in stroke weight, geometry, and semantics.
   - Consolidating all icon drawing into `VooIconFactory` based on the authoritative vector paths in `lucide_spec_report.md` will eliminate redundant code, guarantee 100% visual parity with Web/Electron, and remove the forbidden `NSImage(systemSymbolName:)` call.

---

## 3. Caveats

- **Algorithmic Warps**: `WarpStyleIcon` in `src/canvas/components/editor_properties/warp_style_icon.jsx` algorithmically generates bicubic patch outlines on a 100×100 viewBox rather than a static 24×24 Lucide vector. For native rendering, precomputed paths or the bicubic patch algorithm must be evaluated.
- **Provider Marks**: Provider logos (`provider_icons.jsx`) reference third-party SVG files (`public/brand-icons/*.svg`). These are brand marks, not stroked Lucide icons.
- **Display P3 / Dynamic Tinting**: In macOS CoreGraphics, icons inherit foreground color via `NSColor.setStroke()` / `setFillColor()`. Unflipped vs flipped contexts must be handled when rendering in `NSTableView` rows.

---

## 4. Conclusion

1. **Comprehensive Specification Created**:
   - Complete report written to `/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/lucide_spec_report.md` (224 KB, 1,907 lines).
   - Contains:
     - Full specification overview and rules (24×24 grid, 1.5pt stroke, round caps/joins, sizing tiers).
     - **Features Discovered Table**: 261 categorized entries covering all Lucide re-exports, custom functions, aliases, and brand marks.
     - **Edge Cases Table**: 12 verified edge cases (retina snapping, flipped views, compound cutouts, sparkle transforms, dashed strokes, etc.).
     - **Complete Vector Geometry Catalog**: Exact XML element definitions for all 261 icons.
2. **Actionable Roadmap for Implementation Agents**:
   - **Step 1**: Expand `VooIconFactory` with missing Lucide methods: `drawFolder`, `drawSettings`, `drawRefresh`, `drawSwap`, `drawPipette`, `drawCornerRadius`, `drawBandage`, etc.
   - **Step 2**: Refactor existing `VooIconFactory` methods to strictly implement the 24×24 path coordinates and 1.5pt stroke width defined in `lucide_spec_report.md`.
   - **Step 3**: Refactor `PropertiesGlyphFactory`, `LayersGlyphDrawing`, and `WelcomeDashboardView` to delegate directly to `VooIconFactory`.
   - **Step 4**: Replace `NSImage(systemSymbolName: "rectangle.on.rectangle")` in `WindowController.swift` with `VooIconFactory.drawCopy`.

---

## 5. Verification Method

To independently verify the extracted specifications and findings:

1. **Verify Report Existence and Size**:
   ```bash
   ls -lh /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/lucide_spec_report.md
   wc -l /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/lucide_spec_report.md
   ```
   *Expected Output*: ~224 KB, 1907 lines.

2. **Verify Extraction Consistency**:
   ```bash
   node /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/extract_all_icons.mjs
   ```
   *Expected Output*: Total Lucide re-exports: 214, Total custom functions: 31, Errors: 0.

3. **Verify App Builds without Regressions**:
   ```bash
   cd /Users/tt/teamwork_projects/voo_design/native_studio
   ./build.sh build
   ./build.sh test
   ```

4. **Invalidation Conditions**:
   - Any modification to `src/canvas/icons.jsx` in the web project that adds or renames icons.
   - Upgrading `lucide-react` version in `package.json` with altered vector path definitions.
