# Canonical Lucide Icon Specification for VOO Design & native_studio

**Specification Status**: Complete, Authoritative Reference  
**Extraction Date**: 2026-10-21  
**Author**: Specification Miner (`spec_miner_survey`)  
**Primary Sources Analyzed**:
1. `/Users/tt/teamwork_projects/voo_design/src/canvas/icons.jsx`
2. `/Users/tt/teamwork_projects/voo_design/node_modules/lucide-react/` (v1.59.0 / ISC)
3. `/Users/tt/teamwork_projects/voo_design/src/canvas/icons_motion.jsx`
4. `/Users/tt/teamwork_projects/voo_design/src/canvas/components/editor_properties/kind_icons.jsx`
5. `/Users/tt/teamwork_projects/voo_design/public/voo-mark.svg`
6. `/Users/tt/teamwork_projects/voo_design/native_studio/UI_SPEC.md`

---

## Executive Summary & Core Rules

### 1. Vector Geometry & Coordinate Space
- **Grid Size**: All canonical Lucide glyphs and VOO Design custom glyphs are strictly authored on a **24×24 unit coordinate box** (`viewBox="0 0 24 24"`).
- **Stroke Width**: Default stroke width across VOO Design is **1.5pt** (`ICON_STROKE_WIDTH = 1.5` in `icons.jsx`), overriding Lucide's default package stroke of 2.0pt.
- **Line Caps & Joins**: All stroked paths, polylines, and lines enforce **`.round` line cap** (`stroke-linecap="round"`) and **`.round` line join** (`stroke-linejoin="round"`).
- **Paint Semantics**:
  - Outlined stroke glyphs: `stroke="currentColor"`, `fill="none"`.
  - Filled glyphs: `fill="currentColor"`, `stroke="none"` (e.g. `VooBrandLogo`, `IconMotion`, `IconChrome`, `IconOpenCode`, `IconMask` inner circle, `IconOpacity` half-disc, `IconAiAutoMask` / `IconHealAi` sparkles).
  - Dashed strokes: Stored with specific dash arrays (e.g. `strokeDasharray="3 4"` or `"3 2.5"` for selection marquees and patch tools).

### 2. Sizing Conventions per UI_SPEC.md
The native macOS app (`native_studio`) renders icons across 7 strict size tiers:
| Target Size | Component Context | Sizing Rule & Notes |
|---|---|---|
| **12px** | LayersPanel opacity/blend row pill | `UI_SPEC.md` §4: `pill h28、px10、radius12、icon12、文字10` |
| **13px** | WelcomeDashboard Open button; LayersPanel search/sort; Inspector headers; EditorChrome zoom bar; Island bar; KindIcon default | `UI_SPEC.md` §2, §4, §5, §6. Stroke scaled or crisp 1.2–1.4pt. |
| **14px** | WelcomeDashboard navigation; +New button; LayersPanel row type & eye visibility; Layers bottom bar; Login marks; Credits asterisk | `UI_SPEC.md` §2, §4. Standard density for lists and compact toolbar rows. |
| **15px** | Settings drawer tab items; `IconHelp` default | `UI_SPEC.md` §9: `Tab min-h48、px12 py12、radius12、gap8、icon15` |
| **16px** | ToolRail tool buttons (active/inactive); TitleBar tab close; WelcomeDashboard import cards; AgentPanel header | `UI_SPEC.md` §1, §3, §7. Standard primary tool icon size. |
| **20px** | TitleBar Brand Logo button; TitleBar Settings ⚡ button | `UI_SPEC.md` §1: `品牌按钮 icon 20`, `设置 ⚡ 20×20` |
| **21px** | WelcomeDashboard view switcher | `UI_SPEC.md` §2: `视图切换 21×21、padding4、radius8` |
| **24px** | TitleBar new document plus circle button; standard Lucide grid | `UI_SPEC.md` §1: `新建 + 24×24 圆` |

### 3. Stroke Scaling & Retina Pixel Snapping
- **Proportional Scaling in CoreGraphics**: When scaling the 24×24 coordinate grid to target size $s$ via `ctx.scaleBy(x: s / 24.0, y: -s / 24.0)`, setting context line width to 1.5pt will scale down to $1.5 \times (s / 24)$ pt. At 16px, this yields exactly 1.0pt stroke. At 12px, it yields 0.75pt.
- **Fixed Optical Weight**: If `UI_SPEC.md` requires stroke 1.5pt constant on screen, context line width in the scaled grid must be set to `strokeWidth / (s / 24.0)`.
- **Retina Snapping**: On 2x Retina screens (`NSScreen.backingScaleFactor == 2.0`), target sizes 12px, 14px, 16px, 20px, 24px land on exact pixel boundaries (24px, 28px, 32px, 40px, 48px device pixels), guaranteeing crisp zero-blur rendering.

---

## Features Discovered

Total Discovered Canonical Icons: **261**

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Adjustment & Filter Glyphs | IconGlyphAperture (`aperture`) | 1x <circle>, 6x <path>: <circle cx="12" cy="12" r="10" /> <path d="m14.31 8 5.74 9.94" ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/aperture.mjs |
| 2 | Adjustment & Filter Glyphs | IconGlyphBevel (`cone`) | 1x <path>, 1x <ellipse>: <path d="m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98" /> <ell... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cone.mjs |
| 3 | Adjustment & Filter Glyphs | IconGlyphBlur (`circle-dashed`) | 8x <path>: <path d="M10.1 2.182a10 10 0 0 1 3.8 0" /> <path d="M13.9 21.818a10 10 0 0 1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dashed.mjs |
| 4 | Adjustment & Filter Glyphs | IconGlyphChannelMixer (`chart-no-axes-column`) | 3x <path>: <path d="M5 21v-6" /> <path d="M12 21V3" /> <path d="M19 21V9" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chart-no-axes-column.mjs |
| 5 | Adjustment & Filter Glyphs | IconGlyphClouds (`cloud`) | 1x <path>: <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cloud.mjs |
| 6 | Adjustment & Filter Glyphs | IconGlyphColorBalance (`git-compare-arrows`) | 2x <circle>, 4x <path>: <circle cx="5" cy="6" r="3" /> <path d="M12 6h5a2 2 0 0 1 2 2v7... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/git-compare-arrows.mjs |
| 7 | Adjustment & Filter Glyphs | IconGlyphContrast (`contrast`) | 1x <circle>, 1x <path>: <circle cx="12" cy="12" r="10" /> <path d="M12 18a6 6 0 0 0 0-1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/contrast.mjs |
| 8 | Adjustment & Filter Glyphs | IconGlyphCurves (`spline`) | 2x <circle>, 1x <path>: <circle cx="19" cy="5" r="2" /> <circle cx="5" cy="19" r="2" />... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/spline.mjs |
| 9 | Adjustment & Filter Glyphs | IconGlyphEmboss (`highlighter`) | 2x <path>: <path d="m9 11-6 6v3h9l3-3" /> <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/highlighter.mjs |
| 10 | Adjustment & Filter Glyphs | IconGlyphFill (`paint-bucket`) | 4x <path>: <path d="M11 7 6 2" /> <path d="M18.992 12H2.041" /> <path d="M21.145 18.38A... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/paint-bucket.mjs |
| 11 | Adjustment & Filter Glyphs | IconGlyphGlow (`sparkles`) | 3x <path>, 1x <circle>: <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkles.mjs |
| 12 | Adjustment & Filter Glyphs | IconGlyphGradientMap (`sliders-vertical`) | 9x <path>: <path d="M10 8h4" /> <path d="M12 21v-9" /> <path d="M12 8V3" /> <path d="M1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sliders-vertical.mjs |
| 13 | Adjustment & Filter Glyphs | IconGlyphGradientOverlay (`rainbow`) | 3x <path>: <path d="M22 17a10 10 0 0 0-20 0" /> <path d="M6 17a6 6 0 0 1 12 0" /> <path... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rainbow.mjs |
| 14 | Adjustment & Filter Glyphs | IconGlyphHalftone (`circle-dot`) | 2x <circle>: <circle cx="12" cy="12" r="1" /> <circle cx="12" cy="12" r="10" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dot.mjs |
| 15 | Adjustment & Filter Glyphs | IconGlyphHue (`palette`) | 1x <path>, 4x <circle>: <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/palette.mjs |
| 16 | Adjustment & Filter Glyphs | IconGlyphInnerGlow (`scan-line`) | 5x <path>: <path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <pa... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scan-line.mjs |
| 17 | Adjustment & Filter Glyphs | IconGlyphInnerShadow (`scan`) | 4x <path>: <path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <pa... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scan.mjs |
| 18 | Adjustment & Filter Glyphs | IconGlyphLevels (`chart-no-axes-column-increasing`) | 3x <path>: <path d="M5 21v-6" /> <path d="M12 21V9" /> <path d="M19 21V3" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chart-no-axes-column-increasing.mjs |
| 19 | Adjustment & Filter Glyphs | IconGlyphMoon (`moon`) | 1x <path>: <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/moon.mjs |
| 20 | Adjustment & Filter Glyphs | IconGlyphNoise (`grip`) | 9x <circle>: <circle cx="12" cy="5" r="1" /> <circle cx="19" cy="5" r="1" /> <circle cx... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grip.mjs |
| 21 | Adjustment & Filter Glyphs | IconGlyphPhotoFilter (`blend`) | 2x <circle>: <circle cx="15" cy="9" r="7" /> <circle cx="9" cy="15" r="7" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/blend.mjs |
| 22 | Adjustment & Filter Glyphs | IconGlyphPixelate (`grid-3x3`) | 1x <rect>, 4x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 9h... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grid-3x3.mjs |
| 23 | Adjustment & Filter Glyphs | IconGlyphPosterize (`equal`) | 2x <line>: <line x1="5" x2="19" y1="9" y2="9" /> <line x1="5" x2="19" y1="15" y2="15" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/equal.mjs |
| 24 | Adjustment & Filter Glyphs | IconGlyphSatin (`waves-horizontal`) | 3x <path>: <path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" /> <path d="M2 19q2.5 2 5 0t5 0 5 0 5 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/waves-horizontal.mjs |
| 25 | Adjustment & Filter Glyphs | IconGlyphSaturation (`droplets`) | 2x <path>: <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplets.mjs |
| 26 | Adjustment & Filter Glyphs | IconGlyphSelectiveColor (`pipette`) | 3x <path>: <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pipette.mjs |
| 27 | Adjustment & Filter Glyphs | IconGlyphSepia (`camera`) | 1x <path>, 1x <circle>: <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/camera.mjs |
| 28 | Adjustment & Filter Glyphs | IconGlyphShadow (`square-stack`) | 2x <path>, 1x <rect>: <path d="M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2" ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square-stack.mjs |
| 29 | Adjustment & Filter Glyphs | IconGlyphSharpen (`wand`) | 9x <path>: <path d="M15 4V2" /> <path d="M15 16v-2" /> <path d="M8 9h2" /> <path d="M20... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/wand.mjs |
| 30 | Adjustment & Filter Glyphs | IconGlyphSolarize (`eclipse`) | 1x <circle>, 1x <path>: <circle cx="12" cy="12" r="10" /> <path d="M12 2a7 7 0 1 0 10 1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eclipse.mjs |
| 31 | Adjustment & Filter Glyphs | IconGlyphSparkle (`sparkle`) | 1x <path>: <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkle.mjs |
| 32 | Adjustment & Filter Glyphs | IconGlyphStroke (`square-dashed`) | 12x <path>: <path d="M5 3a2 2 0 0 0-2 2" /> <path d="M19 3a2 2 0 0 1 2 2" /> <path d="M... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square-dashed.mjs |
| 33 | Adjustment & Filter Glyphs | IconGlyphSun (`sun`) | 1x <circle>, 8x <path>: <circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun.mjs |
| 34 | Adjustment & Filter Glyphs | IconGlyphSunMedium (`sun-medium`) | 1x <circle>, 8x <path>: <circle cx="12" cy="12" r="4" /> <path d="M12 3v1" /> <path d="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun-medium.mjs |
| 35 | Adjustment & Filter Glyphs | IconGlyphThermometer (`thermometer`) | 1x <path>: <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/thermometer.mjs |
| 36 | Adjustment & Filter Glyphs | IconGlyphTint (`droplet`) | 1x <path>: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplet.mjs |
| 37 | Adjustment & Filter Glyphs | IconGlyphVignette (`focus`) | 1x <circle>, 4x <path>: <circle cx="12" cy="12" r="3" /> <path d="M3 7V5a2 2 0 0 1 2-2h... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/focus.mjs |
| 38 | Adjustment & Filter Glyphs | KindIcon(blackAndWhite) (`handdrawn-blackAndWhite`) | Photoshop split disc: circle cx=12 cy=12 r=9 + half circle path d='M12 3a9 9 0 0 0 0 18... | kind (string), size (default 13), strokeWidth (default 1.5), className | 24×24 stroke+fill SVG / CoreGraphics path | Renders FALLBACK (circle r=4) if kind unknown | src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN |
| 39 | Adjustment & Filter Glyphs | KindIcon(invert) (`handdrawn-invert`) | Split polarity panel: rect x=3 y=3 w=18 h=18 rx=2 + left filled rect path d='M5 5h7v14H... | kind (string), size (default 13), strokeWidth (default 1.5), className | 24×24 stroke+fill SVG / CoreGraphics path | Renders FALLBACK (circle r=4) if kind unknown | src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN |
| 40 | Adjustment & Filter Glyphs | KindIcon(kind-fallback) (`handdrawn-kind-fallback`) | Catalogue fallback dot: circle cx=12 cy=12 r=4 fill=currentColor | kind (string), size (default 13), strokeWidth (default 1.5), className | 24×24 stroke+fill SVG / CoreGraphics path | Renders FALLBACK (circle r=4) if kind unknown | src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN |
| 41 | Adjustment & Filter Glyphs | KindIcon(threshold) (`handdrawn-threshold`) | Histogram hard cut: vertical bars d='M4 16V8M7 16v-5M10 16V6M13 16v-8M16 16v-4M19 16V9'... | kind (string), size (default 13), strokeWidth (default 1.5), className | 24×24 stroke+fill SVG / CoreGraphics path | Renders FALLBACK (circle r=4) if kind unknown | src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN |
| 42 | AI & Smart Generation Tools | IconAiAutoMask (`custom-aiautomask`) | <path d="M21 11V5C21 4.46957... (outer box)" /> <path d="M18.3194 21.8847... (sparkle)"... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconAiAutoMask |
| 43 | AI & Smart Generation Tools | IconAiObjectSelection (`custom-aiobjectselection`) | <path d="M7 22..." /> <path d="M7 16.9299..." /> <path d="M3.34 14... strokeDasharray="... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconAiObjectSelection |
| 44 | AI & Smart Generation Tools | IconAiRemove (`custom-airemove`) | <path d="M18.3194 21.8847... (sparkle)" /> <path d="M12.0973 20.9995... (eraser body)" ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconAiRemove |
| 45 | AI & Smart Generation Tools | IconHealAi (`custom-healai`) | <g transform="scale(0.7)"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconHealAi |
| 46 | AI & Smart Generation Tools | IconImageAi (`image-play`) | 3x <path>, 1x <circle>: <path d="M15 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/image-play.mjs |
| 47 | AI & Smart Generation Tools | IconMagic (`alias -> IconAiAutoMask`) | Points to IconAiAutoMask | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconMagic = IconAiAutoMask |
| 48 | AI & Smart Generation Tools | IconReversePrompt (`pencil-sparkles`) | 8x <path>: <path d="M10 3H8" /> <path d="m15.007 5.008 3.987 3.986" /> <path d="M20 15v... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pencil-sparkles.mjs |
| 49 | AI & Smart Generation Tools | IconSparkle (`sparkles`) | 3x <path>, 1x <circle>: <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkles.mjs |
| 50 | AI & Smart Generation Tools | IconSparkles (`sparkles`) | 3x <path>, 1x <circle>: <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkles.mjs |
| 51 | AI & Smart Generation Tools | IconWand (`wand-sparkles`) | 8x <path>: <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/wand-sparkles.mjs |
| 52 | App Shell & UI Affordances | IconAdd (`plus`) | 2x <path>: <path d="M5 12h14" /> <path d="M12 5v14" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/plus.mjs |
| 53 | App Shell & UI Affordances | IconAlign (`workflow`) | 2x <rect>, 1x <path>: <rect width="8" height="8" x="3" y="3" rx="2" /> <path d="M7 11v4... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/workflow.mjs |
| 54 | App Shell & UI Affordances | IconAnnotate (`arrow-down-to-dot`) | 2x <path>, 1x <circle>: <path d="M12 2v14" /> <path d="m19 9-7 7-7-7" /> <circle cx="12... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-down-to-dot.mjs |
| 55 | App Shell & UI Affordances | IconArrowDownToDot (`arrow-down-to-dot`) | 2x <path>, 1x <circle>: <path d="M12 2v14" /> <path d="m19 9-7 7-7-7" /> <circle cx="12... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-down-to-dot.mjs |
| 56 | App Shell & UI Affordances | IconArrowSize (`move-horizontal`) | 3x <path>: <path d="m18 8 4 4-4 4" /> <path d="M2 12h20" /> <path d="m6 8-4 4 4 4" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/move-horizontal.mjs |
| 57 | App Shell & UI Affordances | IconArrowUp (`arrow-up`) | 2x <path>: <path d="m5 12 7-7 7 7" /> <path d="M12 19V5" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-up.mjs |
| 58 | App Shell & UI Affordances | IconArrowUpRight (`arrow-up-right`) | 2x <path>: <path d="M7 7h10v10" /> <path d="M7 17 17 7" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-up-right.mjs |
| 59 | App Shell & UI Affordances | IconAt (`at-sign`) | 1x <circle>, 1x <path>: <circle cx="12" cy="12" r="4" /> <path d="M16 8v5a3 3 0 0 0 6 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/at-sign.mjs |
| 60 | App Shell & UI Affordances | IconBolt (`bolt`) | 1x <path>, 1x <circle>: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bolt.mjs |
| 61 | App Shell & UI Affordances | IconBookmark (`bookmark`) | 1x <path>: <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bookmark.mjs |
| 62 | App Shell & UI Affordances | IconCamera (`camera`) | 1x <path>, 1x <circle>: <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/camera.mjs |
| 63 | App Shell & UI Affordances | IconCheck (`check`) | 1x <path>: <path d="M20 6 9 17l-5-5" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/check.mjs |
| 64 | App Shell & UI Affordances | IconChevronDown (`chevron-down`) | 1x <path>: <path d="m6 9 6 6 6-6" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-down.mjs |
| 65 | App Shell & UI Affordances | IconChevronLeft (`chevron-left`) | 1x <path>: <path d="m15 18-6-6 6-6" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-left.mjs |
| 66 | App Shell & UI Affordances | IconChevronRight (`chevron-right`) | 1x <path>: <path d="m9 18 6-6-6-6" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-right.mjs |
| 67 | App Shell & UI Affordances | IconChevronUp (`chevron-up`) | 1x <path>: <path d="m18 15-6-6-6 6" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-up.mjs |
| 68 | App Shell & UI Affordances | IconClose (`x`) | 2x <path>: <path d="M18 6 6 18" /> <path d="m6 6 12 12" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/x.mjs |
| 69 | App Shell & UI Affordances | IconCollapse (`minimize-2`) | 4x <path>: <path d="m14 10 7-7" /> <path d="M20 10h-6V4" /> <path d="m3 21 7-7" /> <pat... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/minimize-2.mjs |
| 70 | App Shell & UI Affordances | IconCone (`cone`) | 1x <path>, 1x <ellipse>: <path d="m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98" /> <ell... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cone.mjs |
| 71 | App Shell & UI Affordances | IconCredit (`alias -> IconCredits`) | Points to IconCredits | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export { IconCredits as IconCredit } |
| 72 | App Shell & UI Affordances | IconDonut (`torus`) | 2x <ellipse>: <ellipse cx="12" cy="11" rx="3" ry="2" /> <ellipse cx="12" cy="12.5" rx="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/torus.mjs |
| 73 | App Shell & UI Affordances | IconDraggable (`grip-vertical`) | 6x <circle>: <circle cx="9" cy="12" r="1" /> <circle cx="9" cy="5" r="1" /> <circle cx=... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grip-vertical.mjs |
| 74 | App Shell & UI Affordances | IconDroplet (`droplet`) | 1x <path>: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplet.mjs |
| 75 | App Shell & UI Affordances | IconDroplets (`droplets`) | 2x <path>: <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplets.mjs |
| 76 | App Shell & UI Affordances | IconEdit (`pencil`) | 2x <path>: <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pencil.mjs |
| 77 | App Shell & UI Affordances | IconExpand (`maximize-2`) | 4x <path>: <path d="M15 3h6v6" /> <path d="m21 3-7 7" /> <path d="m3 21 7-7" /> <path d... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/maximize-2.mjs |
| 78 | App Shell & UI Affordances | IconGalaxy (`galaxy`) | 4x <path>, 1x <circle>: <path d="M16.005 15.108a5.041 6.52 28.25 00-8.008-6.217 5.041 6... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/galaxy.mjs |
| 79 | App Shell & UI Affordances | IconGallery (`images`) | 2x <path>, 1x <circle>, 1x <rect>: <path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/images.mjs |
| 80 | App Shell & UI Affordances | IconGamepad (`gamepad-2`) | 4x <line>, 1x <path>: <line x1="6" x2="10" y1="11" y2="11" /> <line x1="8" x2="8" y1="9... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/gamepad-2.mjs |
| 81 | App Shell & UI Affordances | IconGlobe (`globe`) | 1x <circle>, 2x <path>: <circle cx="12" cy="12" r="10" /> <path d="M12 2a14.5 14.5 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/globe.mjs |
| 82 | App Shell & UI Affordances | IconGradient (`blend`) | 2x <circle>: <circle cx="15" cy="9" r="7" /> <circle cx="9" cy="15" r="7" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/blend.mjs |
| 83 | App Shell & UI Affordances | IconHeart (`heart`) | 1x <path>: <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/heart.mjs |
| 84 | App Shell & UI Affordances | IconHelp (`custom-help`) | <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <line x1="12" y1="17" x2="12.01" y2="... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconHelp |
| 85 | App Shell & UI Affordances | IconHistory (`rotate-ccw-clock`) | 3x <path>: <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rotate-ccw-clock.mjs |
| 86 | App Shell & UI Affordances | IconInfo (`info`) | 1x <circle>, 2x <path>: <circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/info.mjs |
| 87 | App Shell & UI Affordances | IconMagnet (`magnet`) | 3x <path>: <path d="m12 15 4 4" /> <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/magnet.mjs |
| 88 | App Shell & UI Affordances | IconMarker (`map-pin`) | 1x <path>, 1x <circle>: <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/map-pin.mjs |
| 89 | App Shell & UI Affordances | IconMessagePlus (`message-square-plus`) | 3x <path>: <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/message-square-plus.mjs |
| 90 | App Shell & UI Affordances | IconMinus (`minus`) | 1x <path>: <path d="M5 12h14" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/minus.mjs |
| 91 | App Shell & UI Affordances | IconMoon (`moon`) | 1x <path>: <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/moon.mjs |
| 92 | App Shell & UI Affordances | IconMore (`ellipsis`) | 3x <circle>: <circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/ellipsis.mjs |
| 93 | App Shell & UI Affordances | IconPalette (`palette`) | 1x <path>, 4x <circle>: <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/palette.mjs |
| 94 | App Shell & UI Affordances | IconPalmtree (`tree-palm`) | 4x <path>: <path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4" /> <path d="M13 7... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/tree-palm.mjs |
| 95 | App Shell & UI Affordances | IconPin (`pin`) | 2x <path>: <path d="M12 17v5" /> <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pin.mjs |
| 96 | App Shell & UI Affordances | IconPresentation (`presentation`) | 3x <path>: <path d="M2 3h20" /> <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /> <... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/presentation.mjs |
| 97 | App Shell & UI Affordances | IconPuzzle (`puzzle`) | 1x <path>: <path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/puzzle.mjs |
| 98 | App Shell & UI Affordances | IconRefresh (`refresh-cw`) | 4x <path>: <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /> <path d="M21... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/refresh-cw.mjs |
| 99 | App Shell & UI Affordances | IconRegion (`alias -> IconSelectionRect`) | Points to IconSelectionRect | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconRegion = IconSelectionRect |
| 100 | App Shell & UI Affordances | IconRegionFree (`alias -> IconSelectionFree`) | Points to IconSelectionFree | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconRegionFree = IconSelectionFree |
| 101 | App Shell & UI Affordances | IconRegionRect (`alias -> IconAiObjectSelection`) | Points to IconAiObjectSelection | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconRegionRect = IconAiObjectSelection |
| 102 | App Shell & UI Affordances | IconRemove (`alias -> IconAiRemove`) | Points to IconAiRemove | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconRemove = IconAiRemove |
| 103 | App Shell & UI Affordances | IconRestart (`rotate-ccw`) | 2x <path>: <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rotate-ccw.mjs |
| 104 | App Shell & UI Affordances | IconRippleDelete (`arrow-left-to-line`) | 3x <path>: <path d="M3 19V5" /> <path d="m13 6-6 6 6 6" /> <path d="M7 12h14" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-left-to-line.mjs |
| 105 | App Shell & UI Affordances | IconSearch (`search`) | 1x <path>, 1x <circle>: <path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/search.mjs |
| 106 | App Shell & UI Affordances | IconSettings (`settings`) | 1x <path>, 1x <circle>: <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/settings.mjs |
| 107 | App Shell & UI Affordances | IconShuffle (`shuffle`) | 5x <path>: <path d="m18 14 4 4-4 4" /> <path d="m18 2 4 4-4 4" /> <path d="M2 18h1.973a... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/shuffle.mjs |
| 108 | App Shell & UI Affordances | IconSlash (`slash`) | 1x <path>: <path d="M22 2 2 22" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/slash.mjs |
| 109 | App Shell & UI Affordances | IconSliders (`sliders-horizontal`) | 9x <path>: <path d="M10 5H3" /> <path d="M12 19H3" /> <path d="M14 3v4" /> <path d="M16... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sliders-horizontal.mjs |
| 110 | App Shell & UI Affordances | IconSmartphone (`smartphone`) | 1x <rect>, 1x <path>: <rect width="14" height="20" x="5" y="2" rx="2" ry="2" /> <path d... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/smartphone.mjs |
| 111 | App Shell & UI Affordances | IconSticker (`face-slightly-smiling-plus`) | 6x <path>: <path d="M13.267 2.08a10 10 0 108.653 8.653" /> <path d="M15 10V9" /> <path ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/face-slightly-smiling-plus.mjs |
| 112 | App Shell & UI Affordances | IconStop (`square`) | 1x <rect>: <rect width="18" height="18" x="3" y="3" rx="2" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square.mjs |
| 113 | App Shell & UI Affordances | IconStore (`box`) | 3x <path>: <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/box.mjs |
| 114 | App Shell & UI Affordances | IconSun (`sun`) | 1x <circle>, 8x <path>: <circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun.mjs |
| 115 | App Shell & UI Affordances | IconSunMedium (`sun-medium`) | 1x <circle>, 8x <path>: <circle cx="12" cy="12" r="4" /> <path d="M12 3v1" /> <path d="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun-medium.mjs |
| 116 | App Shell & UI Affordances | IconUnlink (`unlink-2`) | 1x <path>: <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/unlink-2.mjs |
| 117 | App Shell & UI Affordances | IconUnlock (`lock-open`) | 1x <rect>, 1x <path>: <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/lock-open.mjs |
| 118 | App Shell & UI Affordances | IconZoomIn (`zoom-in`) | 1x <circle>, 3x <line>: <circle cx="11" cy="11" r="8" /> <line x1="21" x2="16.65" y1="2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/zoom-in.mjs |
| 119 | App Shell & UI Affordances | IconZoomOut (`zoom-out`) | 1x <circle>, 2x <line>: <circle cx="11" cy="11" r="8" /> <line x1="21" x2="16.65" y1="2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/zoom-out.mjs |
| 120 | Brand Assets & Identity | VooBrandLogo (`voo-mark`) | Compound filled path: d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21... | rect / size (20px in TitleBar per UI_SPEC, 24px default), color (black or white) | 24×24 compound filled vector glyph (even-odd winding cutout circle) | Renders solid hexagon fallback if compound clipping fails | public/voo-mark.svg |
| 121 | Canvas, Layout & Navigation Panels | IconComponent (`component`) | 4x <path>: <path d="M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.37... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/component.mjs |
| 122 | Canvas, Layout & Navigation Panels | IconFrame (`frame`) | 4x <line>: <line x1="22" x2="2" y1="6" y2="6" /> <line x1="22" x2="2" y1="18" y2="18" /... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/frame.mjs |
| 123 | Canvas, Layout & Navigation Panels | IconGrid3x3 (`grid-3x3`) | 1x <rect>, 4x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 9h... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grid-3x3.mjs |
| 124 | Canvas, Layout & Navigation Panels | IconGroup (`group`) | 4x <path>, 2x <rect>: <path d="M3 7V5c0-1.1.9-2 2-2h2" /> <path d="M17 3h2c1.1 0 2 .9 2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/group.mjs |
| 125 | Canvas, Layout & Navigation Panels | IconLayout (`layout-template`) | 3x <rect>: <rect width="18" height="7" x="3" y="3" rx="1" /> <rect width="9" height="7"... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layout-template.mjs |
| 126 | Canvas, Layout & Navigation Panels | IconLayoutGrid (`layout-grid`) | 4x <rect>: <rect width="7" height="7" x="3" y="3" rx="1" /> <rect width="7" height="7" ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layout-grid.mjs |
| 127 | Canvas, Layout & Navigation Panels | IconLayoutRight (`panel-right`) | 1x <rect>, 1x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M15 3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/panel-right.mjs |
| 128 | Canvas, Layout & Navigation Panels | IconLayoutTemplate (`layout-template`) | 3x <rect>: <rect width="18" height="7" x="3" y="3" rx="1" /> <rect width="9" height="7"... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layout-template.mjs |
| 129 | Canvas, Layout & Navigation Panels | IconMap (`map`) | 3x <path>: <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.76... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/map.mjs |
| 130 | Canvas, Layout & Navigation Panels | IconMove (`move`) | 6x <path>: <path d="M12 2v20" /> <path d="m15 19-3 3-3-3" /> <path d="m19 9 3 3-3 3" />... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/move.mjs |
| 131 | Canvas, Layout & Navigation Panels | IconPanelLeft (`panel-left`) | 1x <rect>, 1x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M9 3v... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/panel-left.mjs |
| 132 | Canvas, Layout & Navigation Panels | IconPanelRightClose (`panel-right-close`) | 1x <rect>, 2x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M15 3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/panel-right-close.mjs |
| 133 | Canvas, Layout & Navigation Panels | IconSwap (`custom-swap`) | <path d="M3 8.75H21L17.6 4.75" /> <path d="M21 14.75H3L6.4 18.75" /> | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconSwap |
| 134 | Document & File Management | IconBranch (`git-branch`) | 1x <path>, 2x <circle>: <path d="M15 6a9 9 0 0 0-9 9V3" /> <circle cx="18" cy="6" r="3"... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/git-branch.mjs |
| 135 | Document & File Management | IconCopy (`copy`) | 1x <rect>, 1x <path>: <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /> <path d... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/copy.mjs |
| 136 | Document & File Management | IconDownload (`download`) | 3x <path>: <path d="M12 15V3" /> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/download.mjs |
| 137 | Document & File Management | IconFileAdd (`file-plus`) | 4x <path>: <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/file-plus.mjs |
| 138 | Document & File Management | IconFolder (`folder`) | 1x <path>: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder.mjs |
| 139 | Document & File Management | IconFolderMinus (`folder-minus`) | 2x <path>: <path d="M9 13h6" /> <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder-minus.mjs |
| 140 | Document & File Management | IconFolderOpen (`folder-open`) | 1x <path>: <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder-open.mjs |
| 141 | Document & File Management | IconFolderPlus (`folder-plus`) | 3x <path>: <path d="M12 10v6" /> <path d="M9 13h6" /> <path d="M20 20a2 2 0 0 0 2-2V8a2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder-plus.mjs |
| 142 | Document & File Management | IconRedo (`redo-2`) | 2x <path>: <path d="m15 14 5-5-5-5" /> <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/redo-2.mjs |
| 143 | Document & File Management | IconSave (`save`) | 3x <path>: <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/save.mjs |
| 144 | Document & File Management | IconShare (`share-2`) | 3x <circle>, 2x <line>: <circle cx="18" cy="5" r="3" /> <circle cx="6" cy="12" r="3" />... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/share-2.mjs |
| 145 | Document & File Management | IconTrash (`trash`) | 5x <path>: <path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/trash.mjs |
| 146 | Document & File Management | IconUndo (`undo-2`) | 2x <path>: <path d="M9 14 4 9l5-5" /> <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/undo-2.mjs |
| 147 | Document & File Management | IconUpload (`upload`) | 3x <path>: <path d="M12 3v12" /> <path d="m17 8-5-5-5 5" /> <path d="M21 15v4a2 2 0 0 1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/upload.mjs |
| 148 | Document & File Management | IconUsers (`users`) | 3x <path>, 1x <circle>: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d=... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/users.mjs |
| 149 | Drawing, Painting & Vector Path Editing | IconBend (`spline`) | 2x <circle>, 1x <path>: <circle cx="19" cy="5" r="2" /> <circle cx="5" cy="19" r="2" />... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/spline.mjs |
| 150 | Drawing, Painting & Vector Path Editing | IconBrush (`brush`) | 3x <path>: <path d="m11 10 3 3" /> <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/brush.mjs |
| 151 | Drawing, Painting & Vector Path Editing | IconBrushHardness (`circle-dashed`) | 8x <path>: <path d="M10.1 2.182a10 10 0 0 1 3.8 0" /> <path d="M13.9 21.818a10 10 0 0 1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dashed.mjs |
| 152 | Drawing, Painting & Vector Path Editing | IconBrushOpacity (`circle-dot`) | 2x <circle>: <circle cx="12" cy="12" r="1" /> <circle cx="12" cy="12" r="10" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dot.mjs |
| 153 | Drawing, Painting & Vector Path Editing | IconBrushWidth (`brush`) | 3x <path>: <path d="m11 10 3 3" /> <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/brush.mjs |
| 154 | Drawing, Painting & Vector Path Editing | IconBucket (`paint-bucket`) | 4x <path>: <path d="M11 7 6 2" /> <path d="M18.992 12H2.041" /> <path d="M21.145 18.38A... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/paint-bucket.mjs |
| 155 | Drawing, Painting & Vector Path Editing | IconCut (`scissors`) | 2x <circle>, 3x <path>: <circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <p... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scissors.mjs |
| 156 | Drawing, Painting & Vector Path Editing | IconCutout (`scissors`) | 2x <circle>, 3x <path>: <circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <p... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scissors.mjs |
| 157 | Drawing, Painting & Vector Path Editing | IconEraser (`eraser`) | 2x <path>: <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eraser.mjs |
| 158 | Drawing, Painting & Vector Path Editing | IconPaint (`paintbrush`) | 3x <path>: <path d="m14.622 17.897-10.68-2.913" /> <path d="M18.376 2.622a1 1 0 1 1 3.0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/paintbrush.mjs |
| 159 | Drawing, Painting & Vector Path Editing | IconPen (`pen-tool`) | 3x <path>, 1x <circle>: <path d="m18 13-.654-4.736a4 4 0 00-2.756-3.266l-9.163-2.9a2 2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pen-tool.mjs |
| 160 | Drawing, Painting & Vector Path Editing | IconPentagon (`pentagon`) | 1x <path>: <path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pentagon.mjs |
| 161 | Drawing, Painting & Vector Path Editing | IconPipette (`pipette`) | 3x <path>: <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pipette.mjs |
| 162 | Drawing, Painting & Vector Path Editing | IconScissors (`scissors`) | 2x <circle>, 3x <path>: <circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <p... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scissors.mjs |
| 163 | Healing & Retouching Family | IconHealClone (`stamp`) | 3x <path>: <path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" /> <path ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/stamp.mjs |
| 164 | Healing & Retouching Family | IconHealing (`bandage`) | 6x <path>, 1x <rect>: <path d="M10 10.01h.01" /> <path d="M10 14.01h.01" /> <path d="M1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bandage.mjs |
| 165 | Healing & Retouching Family | IconHealPatch (`custom-healpatch`) | <rect x="2" y="2" width="11" height="11" rx="2.5" strokeDasharray="3 2.5" /> <rect x="1... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconHealPatch |
| 166 | Healing & Retouching Family | IconHealSpot (`bandage`) | 6x <path>, 1x <rect>: <path d="M10 10.01h.01" /> <path d="M10 14.01h.01" /> <path d="M1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bandage.mjs |
| 167 | Healing & Retouching Family | IconPatch (`custom-patch`) | <path d="M4 14a8 8 0 0 1 16 0c0 4.418-3.582 7-8 7s-8-2.582-8-7z" strokeDasharray="3 3" ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconPatch |
| 168 | Healing & Retouching Family | IconStamp (`stamp`) | 3x <path>: <path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" /> <path ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/stamp.mjs |
| 169 | Layers, Masking & Composition | IconClipMask (`corner-down-right`) | 2x <path>: <path d="m15 10 5 5-5 5" /> <path d="M4 4v7a4 4 0 0 0 4 4h12" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/corner-down-right.mjs |
| 170 | Layers, Masking & Composition | IconExternalLink (`external-link`) | 3x <path>: <path d="M15 3h6v6" /> <path d="M10 14 21 3" /> <path d="M18 13v6a2 2 0 0 1-... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/external-link.mjs |
| 171 | Layers, Masking & Composition | IconEye (`eye`) | 1x <path>, 1x <circle>: <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.87... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eye.mjs |
| 172 | Layers, Masking & Composition | IconEyeOff (`eye-off`) | 4x <path>: <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eye-off.mjs |
| 173 | Layers, Masking & Composition | IconLayerPrompt (`custom-layerprompt`) | <path d="M21 11V5C21 4.46957 20.7893 3.96086 20.4142 3.58579C20.0391 3.21071 19.5304 3 ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconLayerPrompt |
| 174 | Layers, Masking & Composition | IconLayers (`layers`) | 3x <path>: <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layers.mjs |
| 175 | Layers, Masking & Composition | IconLayers2 (`layers-2`) | 2x <path>: <path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layers-2.mjs |
| 176 | Layers, Masking & Composition | IconLink (`link-2`) | 2x <path>, 1x <line>: <path d="M9 17H7A5 5 0 0 1 7 7h2" /> <path d="M15 7h2a5 5 0 1 1 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/link-2.mjs |
| 177 | Layers, Masking & Composition | IconLock (`lock`) | 1x <rect>, 1x <path>: <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/lock.mjs |
| 178 | Layers, Masking & Composition | IconMask (`custom-mask`) | <rect x="3" y="4" width="18" height="16" rx="3" ry="3" /> <circle cx="12" cy="12" r="4"... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconMask |
| 179 | Layers, Masking & Composition | IconOpacity (`custom-opacity`) | <circle cx="12" cy="12" r="8" stroke="currentColor" /> <path d="M12 4A8 8 0 0 0 12 20Z"... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconOpacity |
| 180 | Layers, Masking & Composition | IconTransparency (`grid-3x3`) | 1x <rect>, 4x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 9h... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grid-3x3.mjs |
| 181 | Media, Audio/Video & Animation | IconClapper (`clapperboard`) | 4x <path>: <path d="m12.296 3.464 3.02 3.956" /> <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/clapperboard.mjs |
| 182 | Media, Audio/Video & Animation | IconFilm (`film`) | 1x <rect>, 7x <path>: <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M7 3v... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/film.mjs |
| 183 | Media, Audio/Video & Animation | IconImage (`image`) | 1x <rect>, 1x <circle>, 1x <path>: <rect width="18" height="18" x="3" y="3" rx="2" ry="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/image.mjs |
| 184 | Media, Audio/Video & Animation | IconMotion (`custom-motion`) | Filled overlapping motion circles: <path d="M15.5 2.00023C12.13... fill="currentColor" /> | size (default 16), className | Filled 24×24 compound vector glyph in currentColor | Renders empty if SVG fails | src/canvas/icons_motion.jsx |
| 185 | Media, Audio/Video & Animation | IconMusic (`eighth-notes`) | 1x <path>, 2x <circle>: <path d="M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eighth-notes.mjs |
| 186 | Media, Audio/Video & Animation | IconPause (`pause`) | 2x <rect>: <rect x="14" y="3" width="5" height="18" rx="1" /> <rect x="5" y="3" width="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pause.mjs |
| 187 | Media, Audio/Video & Animation | IconPictureInPicture (`picture-in-picture-2`) | 1x <path>, 1x <rect>: <path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/picture-in-picture-2.mjs |
| 188 | Media, Audio/Video & Animation | IconPlay (`play`) | 1x <path>: <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/play.mjs |
| 189 | Media, Audio/Video & Animation | IconRepeat (`repeat`) | 4x <path>: <path d="m17 2 4 4-4 4" /> <path d="M3 11v-1a4 4 0 0 1 4-4h14" /> <path d="m... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/repeat.mjs |
| 190 | Media, Audio/Video & Animation | IconSkipBack (`skip-back`) | 2x <path>: <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/skip-back.mjs |
| 191 | Media, Audio/Video & Animation | IconSkipForward (`skip-forward`) | 2x <path>: <path d="M21 4v16" /> <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/skip-forward.mjs |
| 192 | Media, Audio/Video & Animation | IconSubtitles (`captions`) | 1x <rect>, 1x <path>: <rect width="18" height="14" x="3" y="5" rx="2" ry="2" /> <path d... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/captions.mjs |
| 193 | Media, Audio/Video & Animation | IconTime (`clock-3`) | 1x <circle>, 1x <path>: <circle cx="12" cy="12" r="10" /> <path d="M12 6v6h4" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/clock-3.mjs |
| 194 | Media, Audio/Video & Animation | IconVideo (`video`) | 1x <path>, 1x <rect>: <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/video.mjs |
| 195 | Media, Audio/Video & Animation | IconVolume2 (`volume-2`) | 3x <path>: <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/volume-2.mjs |
| 196 | Media, Audio/Video & Animation | IconVolumeX (`volume-x`) | 3x <path>: <path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/volume-x.mjs |
| 197 | Selection & Marquee Tools | IconCrop (`crop`) | 2x <path>: <path d="M6 2v14a2 2 0 0 0 2 2h14" /> <path d="M18 22V8a2 2 0 0 0-2-2H2" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/crop.mjs |
| 198 | Selection & Marquee Tools | IconCursor (`mouse-pointer-2`) | 1x <path>: <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/mouse-pointer-2.mjs |
| 199 | Selection & Marquee Tools | IconLasso (`lasso`) | 2x <path>, 1x <circle>: <path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" /> <path d="M7 2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/lasso.mjs |
| 200 | Selection & Marquee Tools | IconObjectSelection (`alias -> IconAiObjectSelection`) | Points to IconAiObjectSelection | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconObjectSelection = IconAiObjectSelection |
| 201 | Selection & Marquee Tools | IconQuickSelection (`alias -> IconSelectionFree`) | Points to IconSelectionFree | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export const IconQuickSelection = IconSelectionFree |
| 202 | Selection & Marquee Tools | IconSelectionEllipse (`custom-selectionellipse`) | <circle cx="12" cy="12.5" r="9.5" strokeDasharray="3 4" /> | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconSelectionEllipse |
| 203 | Selection & Marquee Tools | IconSelectionFree (`custom-selectionfree`) | <path d="M3.704 15.4671C2.3274 13.8314... strokeDasharray="3 4" /> <path d="M7 23.0001C... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconSelectionFree |
| 204 | Selection & Marquee Tools | IconSelectionIntersect (`squares-intersect`) | 11x <path>: <path d="M10 22a2 2 0 0 1-2-2" /> <path d="M14 2a2 2 0 0 1 2 2" /> <path d=... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/squares-intersect.mjs |
| 205 | Selection & Marquee Tools | IconSelectionPolygon (`custom-selectionpolygon`) | <path d="M12 3.5L21 9.5V18.5L12 24.5L3 18.5V9.5Z" strokeDasharray="3 4" /> <circle cx="... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconSelectionPolygon |
| 206 | Selection & Marquee Tools | IconSelectionRect (`custom-selectionrect`) | <path d="M5 4C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6" ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconSelectionRect |
| 207 | Selection & Marquee Tools | IconSelectionReplace (`square`) | 1x <rect>: <rect width="18" height="18" x="3" y="3" rx="2" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square.mjs |
| 208 | Selection & Marquee Tools | IconSelectionSubtract (`squares-subtract`) | 6x <path>: <path d="M10 22a2 2 0 0 1-2-2" /> <path d="M16 22h-2" /> <path d="M16 4a2 2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/squares-subtract.mjs |
| 209 | Selection & Marquee Tools | IconSelectionUnion (`squares-unite`) | 1x <path>: <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/squares-unite.mjs |
| 210 | Shapes, Geometry & Transforms | IconAsterisk (`asterisk`) | 3x <path>: <path d="M12 5v14" /> <path d="m18.065 8.496-12.125 7" /> <path d="m5.94 8.5... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/asterisk.mjs |
| 211 | Shapes, Geometry & Transforms | IconAstroid (`astroid`) | 1x <path>: <path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/astroid.mjs |
| 212 | Shapes, Geometry & Transforms | IconBox3 (`box`) | 3x <path>: <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/box.mjs |
| 213 | Shapes, Geometry & Transforms | IconCircle (`circle`) | 1x <circle>: <circle cx="12" cy="12" r="10" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle.mjs |
| 214 | Shapes, Geometry & Transforms | IconCornerRadius (`custom-cornerradius`) | <path d="M4 20V16C4 9.37258 9.37258 4 16 4H20" /> | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconCornerRadius |
| 215 | Shapes, Geometry & Transforms | IconCreditAsterisk (`alias -> IconCredits`) | Points to IconCredits | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export { IconCredits as IconCreditAsterisk } |
| 216 | Shapes, Geometry & Transforms | IconCylinder (`cylinder`) | 1x <ellipse>, 1x <path>: <ellipse cx="12" cy="5" rx="9" ry="3" /> <path d="M3 5v14a9 3 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cylinder.mjs |
| 217 | Shapes, Geometry & Transforms | IconDiamond (`diamond`) | 1x <path>: <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/diamond.mjs |
| 218 | Shapes, Geometry & Transforms | IconDistort (`custom-distort`) | <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4 21l3.39-.97C8.93 20.66 10.... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconDistort |
| 219 | Shapes, Geometry & Transforms | IconDodecahedron (`custom-dodecahedron`) | <polygon points="12 2 21 8.5 17.5 19 6.5 19 3 8.5" /> <polygon points="12 15 15.5 12.5 ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconDodecahedron |
| 220 | Shapes, Geometry & Transforms | IconFlipH (`triangles-centerline-dashed-horizontal`) | 6x <path>: <path d="M10 12H8" /> <path d="M16 12h-2" /> <path d="M22 12h-2" /> <path d=... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/triangles-centerline-dashed-horizontal.mjs |
| 221 | Shapes, Geometry & Transforms | IconFlipV (`triangles-centerline-dashed-vertical`) | 6x <path>: <path d="M12 14v2" /> <path d="M12 20v2" /> <path d="M12 2v2" /> <path d="M1... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/triangles-centerline-dashed-vertical.mjs |
| 222 | Shapes, Geometry & Transforms | IconHelix (`custom-helix`) | <path d="M7 4.5c5-2 10 0 10 2.5s-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2.5-5 3.5-... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconHelix |
| 223 | Shapes, Geometry & Transforms | IconHelpCircle (`circle-question-mark`) | 1x <circle>, 2x <path>: <circle cx="12" cy="12" r="10" /> <path d="M9.09 9a3 3 0 0 1 5.... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-question-mark.mjs |
| 224 | Shapes, Geometry & Transforms | IconIcosahedron (`custom-icosahedron`) | <polygon points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" /> <line x1="12" y1="2" x2="12... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconIcosahedron |
| 225 | Shapes, Geometry & Transforms | IconMeshWarp (`custom-meshwarp`) | <path d="M4 6c4-2 12 2 16 0" /> <path d="M4 12c4-2 12 2 16 0" /> <path d="M4 18c4-2 12 ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconMeshWarp |
| 226 | Shapes, Geometry & Transforms | IconPerspective (`custom-perspective`) | <path d="M5 19L8 5h8l3 14H5z" /> <path d="M7 12h10" /> <path d="M12 5v14" /> <path d="M... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconPerspective |
| 227 | Shapes, Geometry & Transforms | IconPlayCircle (`circle-play`) | 1x <path>, 1x <circle>: <path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-play.mjs |
| 228 | Shapes, Geometry & Transforms | IconPoint (`circle-dot`) | 2x <circle>: <circle cx="12" cy="12" r="1" /> <circle cx="12" cy="12" r="10" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dot.mjs |
| 229 | Shapes, Geometry & Transforms | IconPointer (`pointer`) | 5x <path>: <path d="M22 14a8 8 0 0 1-8 8" /> <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pointer.mjs |
| 230 | Shapes, Geometry & Transforms | IconPoints (`alias -> IconCredits`) | Points to IconCredits | Inherits from target icon | Same as target icon | Same as target icon | src/canvas/icons.jsx:export { IconCredits as IconPoints } |
| 231 | Shapes, Geometry & Transforms | IconPolygon (`pentagon`) | 1x <path>: <path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pentagon.mjs |
| 232 | Shapes, Geometry & Transforms | IconPyramid (`pyramid`) | 2x <path>: <path d="M2.5 16.88a1 1 0 0 1-.32-1.43l9-13.02a1 1 0 0 1 1.64 0l9 13.01a1 1 ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pyramid.mjs |
| 233 | Shapes, Geometry & Transforms | IconRotateCcw (`rotate-ccw`) | 2x <path>: <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rotate-ccw.mjs |
| 234 | Shapes, Geometry & Transforms | IconSphere (`custom-sphere`) | <circle cx="12" cy="12" r="9" /> <ellipse cx="12" cy="12" rx="9" ry="3.5" /> | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconSphere |
| 235 | Shapes, Geometry & Transforms | IconSquare (`square`) | 1x <rect>: <rect width="18" height="18" x="3" y="3" rx="2" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square.mjs |
| 236 | Shapes, Geometry & Transforms | IconStar (`star`) | 1x <path>: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/star.mjs |
| 237 | Shapes, Geometry & Transforms | IconTorus (`torus`) | 2x <ellipse>: <ellipse cx="12" cy="11" rx="3" ry="2" /> <ellipse cx="12" cy="12.5" rx="... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/torus.mjs |
| 238 | Shapes, Geometry & Transforms | IconTorusKnot (`custom-torusknot`) | <circle cx="12" cy="12" r="8" /> <path d="M12 4a8 8 0 0 1 7 4M12 20a8 8 0 0 1-7-4" /> <... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconTorusKnot |
| 239 | Shapes, Geometry & Transforms | IconTriangle (`triangle`) | 1x <path>: <path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/triangle.mjs |
| 240 | Shapes, Geometry & Transforms | IconVectorSquare (`custom-vectorsquare`) | <rect x="5" y="5" width="14" height="14" stroke="currentColor" fill="none" /> <rect x="... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconVectorSquare |
| 241 | Third-Party, Services & Identity | IconApi (`plug`) | 4x <path>: <path d="M12 22v-5" /> <path d="M15 8V2" /> <path d="M17 8a1 1 0 0 1 1 1v4a4... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/plug.mjs |
| 242 | Third-Party, Services & Identity | IconChrome (`custom-chrome`) | <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconChrome |
| 243 | Third-Party, Services & Identity | IconCode (`braces`) | 2x <path>: <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/braces.mjs |
| 244 | Third-Party, Services & Identity | IconCredits (`custom-credits`) | <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36l12.72-12.72" /> | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconCredits |
| 245 | Third-Party, Services & Identity | IconGithub (`custom-github`) | <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 ... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconGithub |
| 246 | Third-Party, Services & Identity | IconGoogle (`custom-google`) | <path d="M20.5 12.2A8.5 8.5 0 1 1 18.2 6.3L15 9.5a4.5 4.5 0 1 0 1.9 2.7H12" /> | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconGoogle |
| 247 | Third-Party, Services & Identity | IconHd (`custom-hd`) | <rect x="2" y="4" width="20" height="16" rx="4" /> <path d="M6 8v8" /> <path d="M10 8v8... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconHd |
| 248 | Third-Party, Services & Identity | IconOpenCode (`custom-opencode`) | <path d="M0 0h24v24H0z" fill="none" /> <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" fill=... | size (default 16 or 14), strokeWidth (default 1.5), className, color | 24×24 stroke/fill SVG / CoreGraphics path | Renders fallback bounds if path fails | src/canvas/icons.jsx:export function IconOpenCode |
| 249 | Third-Party, Services & Identity | IconServer (`server`) | 2x <rect>, 2x <line>: <rect width="20" height="8" x="2" y="2" rx="2" ry="2" /> <rect wi... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/server.mjs |
| 250 | Third-Party, Services & Identity | IconTerminal (`square-terminal`) | 2x <path>, 1x <rect>: <path d="m7 11 2-2-2-2" /> <path d="M11 13h4" /> <rect width="18"... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square-terminal.mjs |
| 251 | Third-Party, Services & Identity | IconZap (`zap`) | 1x <path>: <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/zap.mjs |
| 252 | Typography & Text Styling | IconAlignCenter (`text-align-center`) | 3x <path>: <path d="M21 5H3" /> <path d="M17 12H7" /> <path d="M19 19H5" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/text-align-center.mjs |
| 253 | Typography & Text Styling | IconAlignLeft (`text-align-start`) | 3x <path>: <path d="M21 5H3" /> <path d="M15 12H3" /> <path d="M17 19H3" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/text-align-start.mjs |
| 254 | Typography & Text Styling | IconAlignRight (`text-align-end`) | 3x <path>: <path d="M21 5H3" /> <path d="M21 12H9" /> <path d="M21 19H7" /> | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/text-align-end.mjs |
| 255 | Typography & Text Styling | IconBold (`bold`) | 1x <path>: <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bold.mjs |
| 256 | Typography & Text Styling | IconFileText (`file-text`) | 5x <path>: <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/file-text.mjs |
| 257 | Typography & Text Styling | IconItalic (`italic`) | 3x <line>: <line x1="19" x2="10" y1="4" y2="4" /> <line x1="14" x2="5" y1="20" y2="20" ... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/italic.mjs |
| 258 | Typography & Text Styling | IconListOrdered (`list-ordered`) | 6x <path>: <path d="M11 5h10" /> <path d="M11 12h10" /> <path d="M11 19h10" /> <path d=... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/list-ordered.mjs |
| 259 | Typography & Text Styling | IconListUnordered (`list`) | 6x <path>: <path d="M3 5h.01" /> <path d="M3 12h.01" /> <path d="M3 19h.01" /> <path d=... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/list.mjs |
| 260 | Typography & Text Styling | IconText (`type`) | 3x <path>: <path d="M12 4v16" /> <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /> <... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/type.mjs |
| 261 | Typography & Text Styling | IconUnderline (`underline`) | 1x <path>, 1x <line>: <path d="M6 4v6a6 6 0 0 0 12 0V4" /> <line x1="4" x2="20" y1="20"... | size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color | 24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt | Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24 | src/canvas/icons.jsx -> lucide-react/dist/esm/icons/underline.mjs |


---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Subpixel Snapping at Fractional Sizes (13px & 15px) | Rendered at 13×13 or 15×15 on 1x display vs 2x Retina display | On 2x displays, 13px becomes 26 physical pixels (even integer, crisp). On 1x displays, 0.5px centering offset required to avoid subpixel antialiasing blur. |
| 2 | CoreGraphics Flipped Coordinate System | Rendered inside flipped `NSTableView` rows (e.g. `LayersPanel`) | Standard `CGContext` has y-up (origin bottom-left), whereas macOS flipped views have origin top-left. Drawing with `translateBy(0, height); scaleBy(1, -1)` maps canonical Lucide y-down coordinates to screen without upside-down inversion. |
| 3 | Filled vs Stroked Cursor in Active Tool State | `drawCursor` with `isSolid: true` vs `isSolid: false` | In ToolRail, inactive tool draws stroke 1.5pt with round join; active tool draws solid white fill with white background circle pill. |
| 4 | Compound Path Cutout for VOO Brand Logo | Outer hexagon, inverted triangle, and central circle | The SVG defines a single compound path (`public/voo-mark.svg`). When filled using the Non-Zero Winding rule, the inner triangle and circle render properly cutout; in CoreGraphics, `path.fill(using: .evenOdd)` or non-zero must be chosen to ensure the inner circular aperture stays transparent. |
| 5 | Sparkle Group Scaling in AI Retouching Tools | `IconAiAutoMask`, `IconAiObjectSelection`, `IconAiRemove`, `IconHealAi` | Sparkle badge is placed in bottom-right quadrant with affine transform: `transform="translate(3.6, 3.4) scale(0.8)"`. Path coordinates must be transformed before merging into a single `CGPath`. |
| 6 | Dashed Stroke Marquees | `IconSelectionRect`, `IconSelectionEllipse`, `IconSelectionFree`, `IconSelectionPolygon`, `IconPatch` | Require explicit phase and dash array (e.g. `setLineDash(phase: 0, lengths: [3, 4])`). CoreGraphics contexts must reset dash lengths after drawing to avoid leaking into subsequent strokes. |
| 7 | Custom Photoshop-Style Split Glyphs in kind_icons.jsx | `blackAndWhite`, `invert`, `threshold` | Half the glyph is stroked, half is filled (`fill="currentColor"`). Lucide has no split-tone equivalents, so these MUST be retained as custom vector drawings on the 24×24 grid. |
| 8 | Missing/Unknown Adjustment Kind in kind_icons.jsx | Unknown `kind` string passed to `KindIcon` | Authoritative fallback is central filled solid dot `<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />` (NOT an empty square or error throw). |
| 9 | Algorithmic Warp Icon Geometry (WarpStyleIcon) | Preset strings (`bulge`, `fisheye`, `twist`, `custom`) | Generates bicubic patch outlines on a 100×100 viewBox with 7pt stroke, rather than standard 24×24 Lucide SVG. Custom preset renders frame with 4 corner handle circles. |
| 10 | System Symbol Name Divergence in WindowController | `NSImage(systemSymbolName: "rectangle.on.rectangle")` | Diverges from Lucide. Must be replaced with canonical `VooIconFactory.drawCopy` (Lucide `Copy`) on 24×24 grid. |
| 11 | Secondary Factory Inconsistencies | `PropertiesGlyphFactory` (.settings, .transfer, .eyedropper) | `.settings` currently draws a rounded square with dot instead of Lucide `Settings` gear; `.transfer` draws ad-hoc arrows instead of Lucide `IconSwap`; `.eyedropper` draws ad-hoc pipette instead of Lucide `Pipette`. All must delegate to canonical Lucide vector geometries. |
| 12 | Inline Ad-hoc Icons in WelcomeDashboardView | `drawFolderIcon`, `drawStarIcon`, `drawRefreshIcon` | Currently hardcoded private routines in `WelcomeDashboardView.swift`. Must be consolidated to `VooIconFactory.drawFolder` (Lucide `Folder`), `drawStar` (Lucide `Star`), and `drawRefresh` (Lucide `RefreshCw`). |

---

## Complete Vector Geometry Catalog (Canonical 24×24 XML Nodes)

Below is the authoritative coordinate and element definition for every canonical icon:

### 1. `IconGlyphAperture` (Canonical: `aperture`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="m14.31 8 5.74 9.94" /> <path d="M9.69 8h11.48" /> <path d="m7.38 12 5.74-9.94" /> <path d="M9.69 16 3.95 6.06" /> <path d="M14.31 16H2.83" /> <path d="m16.62 12-5.74 9.94" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/aperture.mjs`

### 2. `IconGlyphBevel` (Canonical: `cone`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98" /> <ellipse cx="12" cy="19" rx="9" ry="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cone.mjs`

### 3. `IconGlyphBlur` (Canonical: `circle-dashed`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10.1 2.182a10 10 0 0 1 3.8 0" /> <path d="M13.9 21.818a10 10 0 0 1-3.8 0" /> <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" /> <path d="M2.182 13.9a10 10 0 0 1 0-3.8" /> <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" /> <path d="M21.818 10.1a10 10 0 0 1 0 3.8" /> <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" /> <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dashed.mjs`

### 4. `IconGlyphChannelMixer` (Canonical: `chart-no-axes-column`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M5 21v-6" /> <path d="M12 21V3" /> <path d="M19 21V9" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chart-no-axes-column.mjs`

### 5. `IconGlyphClouds` (Canonical: `cloud`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cloud.mjs`

### 6. `IconGlyphColorBalance` (Canonical: `git-compare-arrows`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="5" cy="6" r="3" /> <path d="M12 6h5a2 2 0 0 1 2 2v7" /> <path d="m15 9-3-3 3-3" /> <circle cx="19" cy="18" r="3" /> <path d="M12 18H7a2 2 0 0 1-2-2V9" /> <path d="m9 15 3 3-3 3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/git-compare-arrows.mjs`

### 7. `IconGlyphContrast` (Canonical: `contrast`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="M12 18a6 6 0 0 0 0-12v12z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/contrast.mjs`

### 8. `IconGlyphCurves` (Canonical: `spline`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="19" cy="5" r="2" /> <circle cx="5" cy="19" r="2" /> <path d="M5 17A12 12 0 0 1 17 5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/spline.mjs`

### 9. `IconGlyphEmboss` (Canonical: `highlighter`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m9 11-6 6v3h9l3-3" /> <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/highlighter.mjs`

### 10. `IconGlyphFill` (Canonical: `paint-bucket`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11 7 6 2" /> <path d="M18.992 12H2.041" /> <path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" /> <path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/paint-bucket.mjs`

### 11. `IconGlyphGlow` (Canonical: `sparkles`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /> <path d="M20 2v4" /> <path d="M22 4h-4" /> <circle cx="4" cy="20" r="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkles.mjs`

### 12. `IconGlyphGradientMap` (Canonical: `sliders-vertical`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 8h4" /> <path d="M12 21v-9" /> <path d="M12 8V3" /> <path d="M17 16h4" /> <path d="M19 12V3" /> <path d="M19 21v-5" /> <path d="M3 14h4" /> <path d="M5 10V3" /> <path d="M5 21v-7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sliders-vertical.mjs`

### 13. `IconGlyphGradientOverlay` (Canonical: `rainbow`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M22 17a10 10 0 0 0-20 0" /> <path d="M6 17a6 6 0 0 1 12 0" /> <path d="M10 17a2 2 0 0 1 4 0" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rainbow.mjs`

### 14. `IconGlyphHalftone` (Canonical: `circle-dot`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="1" /> <circle cx="12" cy="12" r="10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dot.mjs`

### 15. `IconGlyphHue` (Canonical: `palette`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /> <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/palette.mjs`

### 16. `IconGlyphInnerGlow` (Canonical: `scan-line`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <path d="M21 17v2a2 2 0 0 1-2 2h-2" /> <path d="M7 21H5a2 2 0 0 1-2-2v-2" /> <path d="M7 12h10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scan-line.mjs`

### 17. `IconGlyphInnerShadow` (Canonical: `scan`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <path d="M21 17v2a2 2 0 0 1-2 2h-2" /> <path d="M7 21H5a2 2 0 0 1-2-2v-2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scan.mjs`

### 18. `IconGlyphLevels` (Canonical: `chart-no-axes-column-increasing`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M5 21v-6" /> <path d="M12 21V9" /> <path d="M19 21V3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chart-no-axes-column-increasing.mjs`

### 19. `IconGlyphMoon` (Canonical: `moon`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/moon.mjs`

### 20. `IconGlyphNoise` (Canonical: `grip`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="5" r="1" /> <circle cx="19" cy="5" r="1" /> <circle cx="5" cy="5" r="1" /> <circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" /> <circle cx="12" cy="19" r="1" /> <circle cx="19" cy="19" r="1" /> <circle cx="5" cy="19" r="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grip.mjs`

### 21. `IconGlyphPhotoFilter` (Canonical: `blend`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="15" cy="9" r="7" /> <circle cx="9" cy="15" r="7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/blend.mjs`

### 22. `IconGlyphPixelate` (Canonical: `grid-3x3`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 9h18" /> <path d="M3 15h18" /> <path d="M9 3v18" /> <path d="M15 3v18" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grid-3x3.mjs`

### 23. `IconGlyphPosterize` (Canonical: `equal`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<line x1="5" x2="19" y1="9" y2="9" /> <line x1="5" x2="19" y1="15" y2="15" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/equal.mjs`

### 24. `IconGlyphSatin` (Canonical: `waves-horizontal`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" /> <path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" /> <path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/waves-horizontal.mjs`

### 25. `IconGlyphSaturation` (Canonical: `droplets`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" /> <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplets.mjs`

### 26. `IconGlyphSelectiveColor` (Canonical: `pipette`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" /> <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" /> <path d="m2 22 .414-.414" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pipette.mjs`

### 27. `IconGlyphSepia` (Canonical: `camera`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /> <circle cx="12" cy="13" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/camera.mjs`

### 28. `IconGlyphShadow` (Canonical: `square-stack`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2" /> <path d="M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2" /> <rect width="8" height="8" x="14" y="14" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square-stack.mjs`

### 29. `IconGlyphSharpen` (Canonical: `wand`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15 4V2" /> <path d="M15 16v-2" /> <path d="M8 9h2" /> <path d="M20 9h2" /> <path d="M17.8 11.8 19 13" /> <path d="M15 9h.01" /> <path d="M17.8 6.2 19 5" /> <path d="m3 21 9-9" /> <path d="M12.2 6.2 11 5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/wand.mjs`

### 30. `IconGlyphSolarize` (Canonical: `eclipse`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="M12 2a7 7 0 1 0 10 10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eclipse.mjs`

### 31. `IconGlyphSparkle` (Canonical: `sparkle`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkle.mjs`

### 32. `IconGlyphStroke` (Canonical: `square-dashed`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M5 3a2 2 0 0 0-2 2" /> <path d="M19 3a2 2 0 0 1 2 2" /> <path d="M21 19a2 2 0 0 1-2 2" /> <path d="M5 21a2 2 0 0 1-2-2" /> <path d="M9 3h1" /> <path d="M9 21h1" /> <path d="M14 3h1" /> <path d="M14 21h1" /> <path d="M3 9v1" /> <path d="M21 9v1" /> <path d="M3 14v1" /> <path d="M21 14v1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square-dashed.mjs`

### 33. `IconGlyphSun` (Canonical: `sun`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="M12 20v2" /> <path d="m4.93 4.93 1.41 1.41" /> <path d="m17.66 17.66 1.41 1.41" /> <path d="M2 12h2" /> <path d="M20 12h2" /> <path d="m6.34 17.66-1.41 1.41" /> <path d="m19.07 4.93-1.41 1.41" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun.mjs`

### 34. `IconGlyphSunMedium` (Canonical: `sun-medium`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="4" /> <path d="M12 3v1" /> <path d="M12 20v1" /> <path d="M3 12h1" /> <path d="M20 12h1" /> <path d="m18.364 5.636-.707.707" /> <path d="m6.343 17.657-.707.707" /> <path d="m5.636 5.636.707.707" /> <path d="m17.657 17.657.707.707" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun-medium.mjs`

### 35. `IconGlyphThermometer` (Canonical: `thermometer`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/thermometer.mjs`

### 36. `IconGlyphTint` (Canonical: `droplet`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplet.mjs`

### 37. `IconGlyphVignette` (Canonical: `focus`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="3" /> <path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <path d="M21 17v2a2 2 0 0 1-2 2h-2" /> <path d="M7 21H5a2 2 0 0 1-2-2v-2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/focus.mjs`

### 38. `KindIcon(blackAndWhite)` (Canonical: `handdrawn-blackAndWhite`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Handcrafted 24×24 Vector Glyph in kind_icons.jsx
- **Authoritative Elements**: `<circle cx="12" cy="12" r="9" /> <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />`
- **Discovered Via**: `src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN`

### 39. `KindIcon(invert)` (Canonical: `handdrawn-invert`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Handcrafted 24×24 Vector Glyph in kind_icons.jsx
- **Authoritative Elements**: `<rect x="3" y="3" width="18" height="18" rx="2" /> <path d="M5 5h7v14H5z" fill="currentColor" stroke="none" />`
- **Discovered Via**: `src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN`

### 40. `KindIcon(kind-fallback)` (Canonical: `handdrawn-kind-fallback`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Handcrafted 24×24 Vector Glyph in kind_icons.jsx
- **Authoritative Elements**: `<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />`
- **Discovered Via**: `src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN`

### 41. `KindIcon(threshold)` (Canonical: `handdrawn-threshold`)
- **Category**: Adjustment & Filter Glyphs
- **Type**: Handcrafted 24×24 Vector Glyph in kind_icons.jsx
- **Authoritative Elements**: `<path d="M4 16V8M7 16v-5M10 16V6M13 16v-8M16 16v-4M19 16V9" /> <path d="M3 19h18" /> <path d="M12.4 3v14h-.8V3z" fill="currentColor" stroke="none" />`
- **Discovered Via**: `src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN`

### 42. `IconAiAutoMask` (Canonical: `custom-aiautomask`)
- **Category**: AI & Smart Generation Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M21 11V5C21 4.46957... (outer box)" /> <path d="M18.3194 21.8847... (sparkle)" /> <path d="M16.5 9.81794... (mask arc)" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconAiAutoMask`

### 43. `IconAiObjectSelection` (Canonical: `custom-aiobjectselection`)
- **Category**: AI & Smart Generation Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M7 22..." /> <path d="M7 16.9299..." /> <path d="M3.34 14... strokeDasharray="3 4" /> <path d="M5 18..." /> <path d="M18.3194 21.8847... (sparkle)" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconAiObjectSelection`

### 44. `IconAiRemove` (Canonical: `custom-airemove`)
- **Category**: AI & Smart Generation Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M18.3194 21.8847... (sparkle)" /> <path d="M12.0973 20.9995... (eraser body)" /> <path d="M4.0815 11.0901L9.5 16.5085 (divider)" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconAiRemove`

### 45. `IconHealAi` (Canonical: `custom-healai`)
- **Category**: AI & Smart Generation Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<g transform="scale(0.7)"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 6v12M18 6v12" /><path d="M10 10.01h.01M10 14.01h.01M14 10.01h.01M14 14.01h.01" /></g><g transform="translate(3.6 3.4) scale(0.8)"><path d="M18.3194 21.8847C18.4091 21.8101..." /></g>`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconHealAi`

### 46. `IconImageAi` (Canonical: `image-play`)
- **Category**: AI & Smart Generation Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z" /> <path d="M21 12.17V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" /> <path d="m6 21 5-5" /> <circle cx="9" cy="9" r="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/image-play.mjs`

### 47. `IconMagic` (Canonical: `alias -> IconAiAutoMask`)
- **Category**: AI & Smart Generation Tools
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconAiAutoMask`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconMagic = IconAiAutoMask`

### 48. `IconReversePrompt` (Canonical: `pencil-sparkles`)
- **Category**: AI & Smart Generation Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 3H8" /> <path d="m15.007 5.008 3.987 3.986" /> <path d="M20 15v4" /> <path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /> <path d="M22 17h-4" /> <path d="M4 5v4" /> <path d="M6 7H2" /> <path d="M9 2v2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pencil-sparkles.mjs`

### 49. `IconSparkle` (Canonical: `sparkles`)
- **Category**: AI & Smart Generation Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /> <path d="M20 2v4" /> <path d="M22 4h-4" /> <circle cx="4" cy="20" r="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkles.mjs`

### 50. `IconSparkles` (Canonical: `sparkles`)
- **Category**: AI & Smart Generation Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /> <path d="M20 2v4" /> <path d="M22 4h-4" /> <circle cx="4" cy="20" r="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sparkles.mjs`

### 51. `IconWand` (Canonical: `wand-sparkles`)
- **Category**: AI & Smart Generation Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /> <path d="m14 7 3 3" /> <path d="M5 6v4" /> <path d="M19 14v4" /> <path d="M10 2v2" /> <path d="M7 8H3" /> <path d="M21 16h-4" /> <path d="M11 3H9" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/wand-sparkles.mjs`

### 52. `IconAdd` (Canonical: `plus`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M5 12h14" /> <path d="M12 5v14" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/plus.mjs`

### 53. `IconAlign` (Canonical: `workflow`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="8" height="8" x="3" y="3" rx="2" /> <path d="M7 11v4a2 2 0 0 0 2 2h4" /> <rect width="8" height="8" x="13" y="13" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/workflow.mjs`

### 54. `IconAnnotate` (Canonical: `arrow-down-to-dot`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 2v14" /> <path d="m19 9-7 7-7-7" /> <circle cx="12" cy="21" r="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-down-to-dot.mjs`

### 55. `IconArrowDownToDot` (Canonical: `arrow-down-to-dot`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 2v14" /> <path d="m19 9-7 7-7-7" /> <circle cx="12" cy="21" r="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-down-to-dot.mjs`

### 56. `IconArrowSize` (Canonical: `move-horizontal`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m18 8 4 4-4 4" /> <path d="M2 12h20" /> <path d="m6 8-4 4 4 4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/move-horizontal.mjs`

### 57. `IconArrowUp` (Canonical: `arrow-up`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m5 12 7-7 7 7" /> <path d="M12 19V5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-up.mjs`

### 58. `IconArrowUpRight` (Canonical: `arrow-up-right`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M7 7h10v10" /> <path d="M7 17 17 7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-up-right.mjs`

### 59. `IconAt` (Canonical: `at-sign`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="4" /> <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/at-sign.mjs`

### 60. `IconBolt` (Canonical: `bolt`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /> <circle cx="12" cy="12" r="4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bolt.mjs`

### 61. `IconBookmark` (Canonical: `bookmark`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bookmark.mjs`

### 62. `IconCamera` (Canonical: `camera`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /> <circle cx="12" cy="13" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/camera.mjs`

### 63. `IconCheck` (Canonical: `check`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M20 6 9 17l-5-5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/check.mjs`

### 64. `IconChevronDown` (Canonical: `chevron-down`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m6 9 6 6 6-6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-down.mjs`

### 65. `IconChevronLeft` (Canonical: `chevron-left`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m15 18-6-6 6-6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-left.mjs`

### 66. `IconChevronRight` (Canonical: `chevron-right`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m9 18 6-6-6-6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-right.mjs`

### 67. `IconChevronUp` (Canonical: `chevron-up`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m18 15-6-6-6 6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/chevron-up.mjs`

### 68. `IconClose` (Canonical: `x`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M18 6 6 18" /> <path d="m6 6 12 12" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/x.mjs`

### 69. `IconCollapse` (Canonical: `minimize-2`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m14 10 7-7" /> <path d="M20 10h-6V4" /> <path d="m3 21 7-7" /> <path d="M4 14h6v6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/minimize-2.mjs`

### 70. `IconCone` (Canonical: `cone`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98" /> <ellipse cx="12" cy="19" rx="9" ry="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cone.mjs`

### 71. `IconCredit` (Canonical: `alias -> IconCredits`)
- **Category**: App Shell & UI Affordances
- **Type**: Named Export Alias
- **Authoritative Elements**: `Alias of IconCredits`
- **Discovered Via**: `src/canvas/icons.jsx:export { IconCredits as IconCredit }`

### 72. `IconDonut` (Canonical: `torus`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<ellipse cx="12" cy="11" rx="3" ry="2" /> <ellipse cx="12" cy="12.5" rx="10" ry="8.5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/torus.mjs`

### 73. `IconDraggable` (Canonical: `grip-vertical`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="9" cy="12" r="1" /> <circle cx="9" cy="5" r="1" /> <circle cx="9" cy="19" r="1" /> <circle cx="15" cy="12" r="1" /> <circle cx="15" cy="5" r="1" /> <circle cx="15" cy="19" r="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grip-vertical.mjs`

### 74. `IconDroplet` (Canonical: `droplet`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplet.mjs`

### 75. `IconDroplets` (Canonical: `droplets`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" /> <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/droplets.mjs`

### 76. `IconEdit` (Canonical: `pencil`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /> <path d="m15 5 4 4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pencil.mjs`

### 77. `IconExpand` (Canonical: `maximize-2`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15 3h6v6" /> <path d="m21 3-7 7" /> <path d="m3 21 7-7" /> <path d="M9 21H3v-6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/maximize-2.mjs`

### 78. `IconGalaxy` (Canonical: `galaxy`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M16.005 15.108a5.041 6.52 28.25 00-8.008-6.217 5.041 6.52 28.25 008.008 6.217A11.884 7.288-60.76 014.029 7.001" /> <path d="M17 21h.01" /> <path d="M7 3h.01" /> <path d="M7.997 8.891a11.885 7.288-60.756 0111.977 8.107" /> <circle cx="12" cy="12" r="1" fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/galaxy.mjs`

### 79. `IconGallery` (Canonical: `images`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16" /> <path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2" /> <circle cx="13" cy="7" r="1" fill="currentColor" /> <rect x="8" y="2" width="14" height="14" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/images.mjs`

### 80. `IconGamepad` (Canonical: `gamepad-2`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<line x1="6" x2="10" y1="11" y2="11" /> <line x1="8" x2="8" y1="9" y2="13" /> <line x1="15" x2="15.01" y1="12" y2="12" /> <line x1="18" x2="18.01" y1="10" y2="10" /> <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/gamepad-2.mjs`

### 81. `IconGlobe` (Canonical: `globe`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /> <path d="M2 12h20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/globe.mjs`

### 82. `IconGradient` (Canonical: `blend`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="15" cy="9" r="7" /> <circle cx="9" cy="15" r="7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/blend.mjs`

### 83. `IconHeart` (Canonical: `heart`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/heart.mjs`

### 84. `IconHelp` (Canonical: `custom-help`)
- **Category**: App Shell & UI Affordances
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <line x1="12" y1="17" x2="12.01" y2="17" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconHelp`

### 85. `IconHistory` (Canonical: `rotate-ccw-clock`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" /> <path d="M12 7v5l4 2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rotate-ccw-clock.mjs`

### 86. `IconInfo` (Canonical: `info`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/info.mjs`

### 87. `IconMagnet` (Canonical: `magnet`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m12 15 4 4" /> <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z" /> <path d="m5 8 4 4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/magnet.mjs`

### 88. `IconMarker` (Canonical: `map-pin`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /> <circle cx="12" cy="10" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/map-pin.mjs`

### 89. `IconMessagePlus` (Canonical: `message-square-plus`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /> <path d="M12 8v6" /> <path d="M9 11h6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/message-square-plus.mjs`

### 90. `IconMinus` (Canonical: `minus`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M5 12h14" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/minus.mjs`

### 91. `IconMoon` (Canonical: `moon`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/moon.mjs`

### 92. `IconMore` (Canonical: `ellipsis`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/ellipsis.mjs`

### 93. `IconPalette` (Canonical: `palette`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /> <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/palette.mjs`

### 94. `IconPalmtree` (Canonical: `tree-palm`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4" /> <path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3" /> <path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35" /> <path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/tree-palm.mjs`

### 95. `IconPin` (Canonical: `pin`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 17v5" /> <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pin.mjs`

### 96. `IconPresentation` (Canonical: `presentation`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M2 3h20" /> <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /> <path d="m7 21 5-5 5 5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/presentation.mjs`

### 97. `IconPuzzle` (Canonical: `puzzle`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/puzzle.mjs`

### 98. `IconRefresh` (Canonical: `refresh-cw`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" /> <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /> <path d="M8 16H3v5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/refresh-cw.mjs`

### 99. `IconRegion` (Canonical: `alias -> IconSelectionRect`)
- **Category**: App Shell & UI Affordances
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconSelectionRect`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconRegion = IconSelectionRect`

### 100. `IconRegionFree` (Canonical: `alias -> IconSelectionFree`)
- **Category**: App Shell & UI Affordances
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconSelectionFree`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconRegionFree = IconSelectionFree`

### 101. `IconRegionRect` (Canonical: `alias -> IconAiObjectSelection`)
- **Category**: App Shell & UI Affordances
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconAiObjectSelection`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconRegionRect = IconAiObjectSelection`

### 102. `IconRemove` (Canonical: `alias -> IconAiRemove`)
- **Category**: App Shell & UI Affordances
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconAiRemove`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconRemove = IconAiRemove`

### 103. `IconRestart` (Canonical: `rotate-ccw`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rotate-ccw.mjs`

### 104. `IconRippleDelete` (Canonical: `arrow-left-to-line`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 19V5" /> <path d="m13 6-6 6 6 6" /> <path d="M7 12h14" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/arrow-left-to-line.mjs`

### 105. `IconSearch` (Canonical: `search`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/search.mjs`

### 106. `IconSettings` (Canonical: `settings`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /> <circle cx="12" cy="12" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/settings.mjs`

### 107. `IconShuffle` (Canonical: `shuffle`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m18 14 4 4-4 4" /> <path d="m18 2 4 4-4 4" /> <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" /> <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /> <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/shuffle.mjs`

### 108. `IconSlash` (Canonical: `slash`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M22 2 2 22" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/slash.mjs`

### 109. `IconSliders` (Canonical: `sliders-horizontal`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 5H3" /> <path d="M12 19H3" /> <path d="M14 3v4" /> <path d="M16 17v4" /> <path d="M21 12h-9" /> <path d="M21 19h-5" /> <path d="M21 5h-7" /> <path d="M8 10v4" /> <path d="M8 12H3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sliders-horizontal.mjs`

### 110. `IconSmartphone` (Canonical: `smartphone`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="14" height="20" x="5" y="2" rx="2" ry="2" /> <path d="M12 18h.01" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/smartphone.mjs`

### 111. `IconSticker` (Canonical: `face-slightly-smiling-plus`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M13.267 2.08a10 10 0 108.653 8.653" /> <path d="M15 10V9" /> <path d="M16 5h6" /> <path d="M16.472 15a6 6 0 01-8.943 0" /> <path d="M19 2v6" /> <path d="M9 10V9" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/face-slightly-smiling-plus.mjs`

### 112. `IconStop` (Canonical: `square`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square.mjs`

### 113. `IconStore` (Canonical: `box`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /> <path d="m3.3 7 8.7 5 8.7-5" /> <path d="M12 22V12" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/box.mjs`

### 114. `IconSun` (Canonical: `sun`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="M12 20v2" /> <path d="m4.93 4.93 1.41 1.41" /> <path d="m17.66 17.66 1.41 1.41" /> <path d="M2 12h2" /> <path d="M20 12h2" /> <path d="m6.34 17.66-1.41 1.41" /> <path d="m19.07 4.93-1.41 1.41" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun.mjs`

### 115. `IconSunMedium` (Canonical: `sun-medium`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="4" /> <path d="M12 3v1" /> <path d="M12 20v1" /> <path d="M3 12h1" /> <path d="M20 12h1" /> <path d="m18.364 5.636-.707.707" /> <path d="m6.343 17.657-.707.707" /> <path d="m5.636 5.636.707.707" /> <path d="m17.657 17.657.707.707" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/sun-medium.mjs`

### 116. `IconUnlink` (Canonical: `unlink-2`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/unlink-2.mjs`

### 117. `IconUnlock` (Canonical: `lock-open`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 9.9-1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/lock-open.mjs`

### 118. `IconZoomIn` (Canonical: `zoom-in`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="11" cy="11" r="8" /> <line x1="21" x2="16.65" y1="21" y2="16.65" /> <line x1="11" x2="11" y1="8" y2="14" /> <line x1="8" x2="14" y1="11" y2="11" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/zoom-in.mjs`

### 119. `IconZoomOut` (Canonical: `zoom-out`)
- **Category**: App Shell & UI Affordances
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="11" cy="11" r="8" /> <line x1="21" x2="16.65" y1="21" y2="16.65" /> <line x1="8" x2="14" y1="11" y2="11" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/zoom-out.mjs`

### 120. `VooBrandLogo` (Canonical: `voo-mark`)
- **Category**: Brand Assets & Identity
- **Type**: Canonical VOO Brand Logo (Hexagon + Inscribed Triangle + Circle Cutout)
- **Authoritative Elements**: `<path d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016 16.5294 8.82703 16.5294 11.5C16.5294 14.173 14.2777 16.3398 11.5 16.3398C8.72233 16.3398 6.47059 14.173 6.47059 11.5C6.47059 8.82703 8.72233 6.66016 11.5 6.66016Z" fill="currentColor" />`
- **Discovered Via**: `public/voo-mark.svg`

### 121. `IconComponent` (Canonical: `component`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z" /> <path d="M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z" /> <path d="M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z" /> <path d="M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/component.mjs`

### 122. `IconFrame` (Canonical: `frame`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<line x1="22" x2="2" y1="6" y2="6" /> <line x1="22" x2="2" y1="18" y2="18" /> <line x1="6" x2="6" y1="2" y2="22" /> <line x1="18" x2="18" y1="2" y2="22" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/frame.mjs`

### 123. `IconGrid3x3` (Canonical: `grid-3x3`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 9h18" /> <path d="M3 15h18" /> <path d="M9 3v18" /> <path d="M15 3v18" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grid-3x3.mjs`

### 124. `IconGroup` (Canonical: `group`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 7V5c0-1.1.9-2 2-2h2" /> <path d="M17 3h2c1.1 0 2 .9 2 2v2" /> <path d="M21 17v2c0 1.1-.9 2-2 2h-2" /> <path d="M7 21H5c-1.1 0-2-.9-2-2v-2" /> <rect width="7" height="5" x="7" y="7" rx="1" /> <rect width="7" height="5" x="10" y="12" rx="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/group.mjs`

### 125. `IconLayout` (Canonical: `layout-template`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="7" x="3" y="3" rx="1" /> <rect width="9" height="7" x="3" y="14" rx="1" /> <rect width="5" height="7" x="16" y="14" rx="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layout-template.mjs`

### 126. `IconLayoutGrid` (Canonical: `layout-grid`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="7" height="7" x="3" y="3" rx="1" /> <rect width="7" height="7" x="14" y="3" rx="1" /> <rect width="7" height="7" x="14" y="14" rx="1" /> <rect width="7" height="7" x="3" y="14" rx="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layout-grid.mjs`

### 127. `IconLayoutRight` (Canonical: `panel-right`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M15 3v18" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/panel-right.mjs`

### 128. `IconLayoutTemplate` (Canonical: `layout-template`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="7" x="3" y="3" rx="1" /> <rect width="9" height="7" x="3" y="14" rx="1" /> <rect width="5" height="7" x="16" y="14" rx="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layout-template.mjs`

### 129. `IconMap` (Canonical: `map`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /> <path d="M15 5.764v15" /> <path d="M9 3.236v15" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/map.mjs`

### 130. `IconMove` (Canonical: `move`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 2v20" /> <path d="m15 19-3 3-3-3" /> <path d="m19 9 3 3-3 3" /> <path d="M2 12h20" /> <path d="m5 9-3 3 3 3" /> <path d="m9 5 3-3 3 3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/move.mjs`

### 131. `IconPanelLeft` (Canonical: `panel-left`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M9 3v18" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/panel-left.mjs`

### 132. `IconPanelRightClose` (Canonical: `panel-right-close`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M15 3v18" /> <path d="m8 9 3 3-3 3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/panel-right-close.mjs`

### 133. `IconSwap` (Canonical: `custom-swap`)
- **Category**: Canvas, Layout & Navigation Panels
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M3 8.75H21L17.6 4.75" /> <path d="M21 14.75H3L6.4 18.75" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconSwap`

### 134. `IconBranch` (Canonical: `git-branch`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15 6a9 9 0 0 0-9 9V3" /> <circle cx="18" cy="6" r="3" /> <circle cx="6" cy="18" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/git-branch.mjs`

### 135. `IconCopy` (Canonical: `copy`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /> <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/copy.mjs`

### 136. `IconDownload` (Canonical: `download`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 15V3" /> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <path d="m7 10 5 5 5-5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/download.mjs`

### 137. `IconFileAdd` (Canonical: `file-plus`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /> <path d="M14 2v5a1 1 0 0 0 1 1h5" /> <path d="M9 15h6" /> <path d="M12 18v-6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/file-plus.mjs`

### 138. `IconFolder` (Canonical: `folder`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder.mjs`

### 139. `IconFolderMinus` (Canonical: `folder-minus`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M9 13h6" /> <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder-minus.mjs`

### 140. `IconFolderOpen` (Canonical: `folder-open`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder-open.mjs`

### 141. `IconFolderPlus` (Canonical: `folder-plus`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 10v6" /> <path d="M9 13h6" /> <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/folder-plus.mjs`

### 142. `IconRedo` (Canonical: `redo-2`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m15 14 5-5-5-5" /> <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/redo-2.mjs`

### 143. `IconSave` (Canonical: `save`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /> <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /> <path d="M7 3v4a1 1 0 0 0 1 1h7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/save.mjs`

### 144. `IconShare` (Canonical: `share-2`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="18" cy="5" r="3" /> <circle cx="6" cy="12" r="3" /> <circle cx="18" cy="19" r="3" /> <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /> <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/share-2.mjs`

### 145. `IconTrash` (Canonical: `trash`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/trash.mjs`

### 146. `IconUndo` (Canonical: `undo-2`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M9 14 4 9l5-5" /> <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/undo-2.mjs`

### 147. `IconUpload` (Canonical: `upload`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 3v12" /> <path d="m17 8-5-5-5 5" /> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/upload.mjs`

### 148. `IconUsers` (Canonical: `users`)
- **Category**: Document & File Management
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d="M16 3.128a4 4 0 0 1 0 7.744" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <circle cx="9" cy="7" r="4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/users.mjs`

### 149. `IconBend` (Canonical: `spline`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="19" cy="5" r="2" /> <circle cx="5" cy="19" r="2" /> <path d="M5 17A12 12 0 0 1 17 5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/spline.mjs`

### 150. `IconBrush` (Canonical: `brush`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m11 10 3 3" /> <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" /> <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/brush.mjs`

### 151. `IconBrushHardness` (Canonical: `circle-dashed`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10.1 2.182a10 10 0 0 1 3.8 0" /> <path d="M13.9 21.818a10 10 0 0 1-3.8 0" /> <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" /> <path d="M2.182 13.9a10 10 0 0 1 0-3.8" /> <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" /> <path d="M21.818 10.1a10 10 0 0 1 0 3.8" /> <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" /> <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dashed.mjs`

### 152. `IconBrushOpacity` (Canonical: `circle-dot`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="1" /> <circle cx="12" cy="12" r="10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dot.mjs`

### 153. `IconBrushWidth` (Canonical: `brush`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m11 10 3 3" /> <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" /> <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/brush.mjs`

### 154. `IconBucket` (Canonical: `paint-bucket`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11 7 6 2" /> <path d="M18.992 12H2.041" /> <path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" /> <path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/paint-bucket.mjs`

### 155. `IconCut` (Canonical: `scissors`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <path d="M20 4 8.12 15.88" /> <circle cx="6" cy="18" r="3" /> <path d="M14.8 14.8 20 20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scissors.mjs`

### 156. `IconCutout` (Canonical: `scissors`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <path d="M20 4 8.12 15.88" /> <circle cx="6" cy="18" r="3" /> <path d="M14.8 14.8 20 20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scissors.mjs`

### 157. `IconEraser` (Canonical: `eraser`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" /> <path d="m5.082 11.09 8.828 8.828" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eraser.mjs`

### 158. `IconPaint` (Canonical: `paintbrush`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m14.622 17.897-10.68-2.913" /> <path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z" /> <path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/paintbrush.mjs`

### 159. `IconPen` (Canonical: `pen-tool`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m18 13-.654-4.736a4 4 0 00-2.756-3.266l-9.163-2.9a2 2 0 00-2.017.493l-.82.819a2 2 0 00-.492 2.017l2.9 9.163a4 4 0 003.266 2.756L13 18" /> <path d="M18.648 12.352a1.205 1.205 0 011.704 0l1.296 1.296a1.205 1.205 0 010 1.704l-6.296 6.296a1.205 1.205 0 01-1.704 0l-1.296-1.296a1.205 1.205 0 010-1.704z" /> <path d="m3 3 6.586 6.586" /> <circle cx="11" cy="11" r="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pen-tool.mjs`

### 160. `IconPentagon` (Canonical: `pentagon`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pentagon.mjs`

### 161. `IconPipette` (Canonical: `pipette`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" /> <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" /> <path d="m2 22 .414-.414" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pipette.mjs`

### 162. `IconScissors` (Canonical: `scissors`)
- **Category**: Drawing, Painting & Vector Path Editing
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <path d="M20 4 8.12 15.88" /> <circle cx="6" cy="18" r="3" /> <path d="M14.8 14.8 20 20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/scissors.mjs`

### 163. `IconHealClone` (Canonical: `stamp`)
- **Category**: Healing & Retouching Family
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" /> <path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z" /> <path d="M5 22h14" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/stamp.mjs`

### 164. `IconHealing` (Canonical: `bandage`)
- **Category**: Healing & Retouching Family
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 10.01h.01" /> <path d="M10 14.01h.01" /> <path d="M14 10.01h.01" /> <path d="M14 14.01h.01" /> <path d="M18 6v12" /> <path d="M6 6v12" /> <rect x="2" y="6" width="20" height="12" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bandage.mjs`

### 165. `IconHealPatch` (Canonical: `custom-healpatch`)
- **Category**: Healing & Retouching Family
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<rect x="2" y="2" width="11" height="11" rx="2.5" strokeDasharray="3 2.5" /> <rect x="11" y="11" width="11" height="11" rx="2.5" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconHealPatch`

### 166. `IconHealSpot` (Canonical: `bandage`)
- **Category**: Healing & Retouching Family
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 10.01h.01" /> <path d="M10 14.01h.01" /> <path d="M14 10.01h.01" /> <path d="M14 14.01h.01" /> <path d="M18 6v12" /> <path d="M6 6v12" /> <rect x="2" y="6" width="20" height="12" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bandage.mjs`

### 167. `IconPatch` (Canonical: `custom-patch`)
- **Category**: Healing & Retouching Family
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M4 14a8 8 0 0 1 16 0c0 4.418-3.582 7-8 7s-8-2.582-8-7z" strokeDasharray="3 3" /> <path d="M9 12l6 6M15 12l-6 6" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconPatch`

### 168. `IconStamp` (Canonical: `stamp`)
- **Category**: Healing & Retouching Family
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" /> <path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z" /> <path d="M5 22h14" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/stamp.mjs`

### 169. `IconClipMask` (Canonical: `corner-down-right`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m15 10 5 5-5 5" /> <path d="M4 4v7a4 4 0 0 0 4 4h12" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/corner-down-right.mjs`

### 170. `IconExternalLink` (Canonical: `external-link`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15 3h6v6" /> <path d="M10 14 21 3" /> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/external-link.mjs`

### 171. `IconEye` (Canonical: `eye`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /> <circle cx="12" cy="12" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eye.mjs`

### 172. `IconEyeOff` (Canonical: `eye-off`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /> <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /> <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /> <path d="m2 2 20 20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eye-off.mjs`

### 173. `IconLayerPrompt` (Canonical: `custom-layerprompt`)
- **Category**: Layers, Masking & Composition
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M21 11V5C21 4.46957 20.7893 3.96086 20.4142 3.58579C20.0391 3.21071 19.5304 3 19 3H5C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H11" /> <path d="M18.2555 21.9077C18.3273 21.8481 18.376 21.7653 18.3931 21.6735C18.531 20.8536 18.9211 20.097 19.509 19.509C20.097 18.9211 20.8536 18.531 21.6735 18.3931C21.7653 18.376 21.8481 18.3273 21.9077 18.2555C21.9674 18.1837 22 18.0933 22 18C22 17.9067 21.9674 17.8163 21.9077 17.7445C21.8481 17.6727 21.7653 17.624 21.6735 17.6069C20.8536 17.469 20.097 17.0789 19.509 16.491C18.9211 15.903 18.531 15.1464 18.3931 14.3265C18.376 14.2347 18.3273 14.1519 18.2555 14.0923C18.1837 14.0326 18.0933 14 18 14C17.9067 14 17.8163 14.0326 17.7445 14.0923C17.6727 14.1519 17.624 14.2347 17.6069 14.3265C17.469 15.1464 17.0789 15.903 16.491 16.491C15.903 17.0789 15.1464 17.469 14.3265 17.6069C14.2347 17.624 14.1519 17.6727 14.0923 17.7445C14.0326 17.8163 14 17.9067 14 18C14 18.0933 14.0326 18.1837 14.0923 18.2555C14.1519 18.3273 14.2347 18.376 14.3265 18.3931C15.1464 18.531 15.903 18.9211 16.491 19.509C17.0789 20.097 17.469 20.8536 17.6069 21.6735C17.624 21.7653 17.6727 21.8481 17.7445 21.9077C17.8163 21.9674 17.9067 22 18 22C18.0933 22 18.1837 21.9674 18.2555 21.9077Z" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconLayerPrompt`

### 174. `IconLayers` (Canonical: `layers`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /> <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /> <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layers.mjs`

### 175. `IconLayers2` (Canonical: `layers-2`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z" /> <path d="m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/layers-2.mjs`

### 176. `IconLink` (Canonical: `link-2`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M9 17H7A5 5 0 0 1 7 7h2" /> <path d="M15 7h2a5 5 0 1 1 0 10h-2" /> <line x1="8" x2="16" y1="12" y2="12" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/link-2.mjs`

### 177. `IconLock` (Canonical: `lock`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/lock.mjs`

### 178. `IconMask` (Canonical: `custom-mask`)
- **Category**: Layers, Masking & Composition
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<rect x="3" y="4" width="18" height="16" rx="3" ry="3" /> <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconMask`

### 179. `IconOpacity` (Canonical: `custom-opacity`)
- **Category**: Layers, Masking & Composition
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<circle cx="12" cy="12" r="8" stroke="currentColor" /> <path d="M12 4A8 8 0 0 0 12 20Z" fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconOpacity`

### 180. `IconTransparency` (Canonical: `grid-3x3`)
- **Category**: Layers, Masking & Composition
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 9h18" /> <path d="M3 15h18" /> <path d="M9 3v18" /> <path d="M15 3v18" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/grid-3x3.mjs`

### 181. `IconClapper` (Canonical: `clapperboard`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m12.296 3.464 3.02 3.956" /> <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" /> <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> <path d="m6.18 5.276 3.1 3.899" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/clapperboard.mjs`

### 182. `IconFilm` (Canonical: `film`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M7 3v18" /> <path d="M3 7.5h4" /> <path d="M3 12h18" /> <path d="M3 16.5h4" /> <path d="M17 3v18" /> <path d="M17 7.5h4" /> <path d="M17 16.5h4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/film.mjs`

### 183. `IconImage` (Canonical: `image`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/image.mjs`

### 184. `IconMotion` (Canonical: `custom-motion`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Handcrafted Filled Compound Path
- **Authoritative Elements**: `<path d="M15.5 2.00023C12.13 2.00023 9.34999 4.58023 9.02999 7.87023C7.98807 8.26242 7.09125 8.96429 6.46016 9.88142C5.82907 10.7986 5.49399 11.887 5.49999 13.0002V13.1202C3.49999 13.5702 1.98999 15.3602 1.98999 17.5002C1.98999 19.9802 4.00999 22.0002 6.48999 22.0002C8.62999 22.0002 10.42 20.5002 10.87 18.4902H10.99C13.31 18.4902 15.32 17.0702 16.12 14.9602C19.41 14.6402 21.99 11.8602 21.99 8.49023C21.99 4.91023 19.07 1.99023 15.49 1.99023L15.5 2.00023ZM6.49999 20.0002C5.83695 20.0002 5.20106 19.7368 4.73222 19.268C4.26338 18.7992 3.99999 18.1633 3.99999 17.5002C3.99999 16.3302 4.80999 15.3502 5.89999 15.0702C5.90999 15.1002 5.93999 15.1302 5.94999 15.1702C6.05999 15.4302 6.19999 15.6902 6.34999 15.9302C6.39999 16.0002 6.43999 16.0802 6.48999 16.1502C6.66999 16.4102 6.85999 16.6502 7.07999 16.8702L7.11999 16.9102C7.33999 17.1302 7.57999 17.3202 7.83999 17.5002C7.91999 17.5602 7.99999 17.6102 8.08999 17.6602C8.30999 17.8002 8.53999 17.9202 8.77999 18.0302C8.82999 18.0502 8.86999 18.0802 8.91999 18.1002C8.7842 18.6422 8.47146 19.1234 8.0313 19.4676C7.59114 19.8117 7.04873 19.9992 6.48999 20.0002H6.49999ZM10.22 16.4202C10.057 16.3804 9.89669 16.3303 9.73999 16.2702C9.07982 16.0185 8.51193 15.5717 8.1118 14.9894C7.71168 14.4071 7.49828 13.7168 7.49999 13.0102C7.49999 11.7502 8.14999 10.6302 9.17999 10.0202C9.17999 10.0402 9.18999 10.0602 9.19999 10.0902C9.25999 10.3302 9.32999 10.5602 9.41999 10.7902C9.43999 10.8502 9.46999 10.9202 9.48999 10.9802C9.58999 11.2302 9.69999 11.4702 9.82999 11.7002C9.82999 11.7102 9.84999 11.7302 9.84999 11.7402C9.96999 11.9602 10.11 12.1702 10.26 12.3702C10.3 12.4202 10.34 12.4802 10.38 12.5302C10.7 12.9502 11.08 13.3202 11.49 13.6402C11.54 13.6802 11.59 13.7202 11.65 13.7602C11.85 13.9102 12.06 14.0502 12.28 14.1702C12.29 14.1702 12.3 14.1802 12.31 14.1902C12.54 14.3202 12.78 14.4302 13.03 14.5302C13.09 14.5502 13.15 14.5802 13.22 14.6002C13.45 14.6902 13.69 14.7602 13.93 14.8202C13.95 14.8202 13.97 14.8302 13.99 14.8402C13.24 16.0802 11.74 16.7602 10.21 16.4302L10.22 16.4202Z" fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons_motion.jsx`

### 185. `IconMusic` (Canonical: `eighth-notes`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19" /> <circle cx="18" cy="16" r="3" /> <circle cx="6" cy="19" r="3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/eighth-notes.mjs`

### 186. `IconPause` (Canonical: `pause`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect x="14" y="3" width="5" height="18" rx="1" /> <rect x="5" y="3" width="5" height="18" rx="1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pause.mjs`

### 187. `IconPictureInPicture` (Canonical: `picture-in-picture-2`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4" /> <rect width="10" height="7" x="12" y="13" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/picture-in-picture-2.mjs`

### 188. `IconPlay` (Canonical: `play`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/play.mjs`

### 189. `IconRepeat` (Canonical: `repeat`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m17 2 4 4-4 4" /> <path d="M3 11v-1a4 4 0 0 1 4-4h14" /> <path d="m7 22-4-4 4-4" /> <path d="M21 13v1a4 4 0 0 1-4 4H3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/repeat.mjs`

### 190. `IconSkipBack` (Canonical: `skip-back`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" /> <path d="M3 20V4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/skip-back.mjs`

### 191. `IconSkipForward` (Canonical: `skip-forward`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 4v16" /> <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/skip-forward.mjs`

### 192. `IconSubtitles` (Canonical: `captions`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="14" x="3" y="5" rx="2" ry="2" /> <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/captions.mjs`

### 193. `IconTime` (Canonical: `clock-3`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="M12 6v6h4" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/clock-3.mjs`

### 194. `IconVideo` (Canonical: `video`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /> <rect x="2" y="6" width="14" height="12" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/video.mjs`

### 195. `IconVolume2` (Canonical: `volume-2`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /> <path d="M16 9a5 5 0 0 1 0 6" /> <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/volume-2.mjs`

### 196. `IconVolumeX` (Canonical: `volume-x`)
- **Category**: Media, Audio/Video & Animation
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z" /> <path d="m16.5 14.5 5-5" /> <path d="m16.5 9.5 5 5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/volume-x.mjs`

### 197. `IconCrop` (Canonical: `crop`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M6 2v14a2 2 0 0 0 2 2h14" /> <path d="M18 22V8a2 2 0 0 0-2-2H2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/crop.mjs`

### 198. `IconCursor` (Canonical: `mouse-pointer-2`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/mouse-pointer-2.mjs`

### 199. `IconLasso` (Canonical: `lasso`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" /> <path d="M7 22a5 5 0 0 1-2-3.994" /> <circle cx="5" cy="16" r="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/lasso.mjs`

### 200. `IconObjectSelection` (Canonical: `alias -> IconAiObjectSelection`)
- **Category**: Selection & Marquee Tools
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconAiObjectSelection`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconObjectSelection = IconAiObjectSelection`

### 201. `IconQuickSelection` (Canonical: `alias -> IconSelectionFree`)
- **Category**: Selection & Marquee Tools
- **Type**: Alias / Re-export of Custom Icon
- **Authoritative Elements**: `Alias of IconSelectionFree`
- **Discovered Via**: `src/canvas/icons.jsx:export const IconQuickSelection = IconSelectionFree`

### 202. `IconSelectionEllipse` (Canonical: `custom-selectionellipse`)
- **Category**: Selection & Marquee Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<circle cx="12" cy="12.5" r="9.5" strokeDasharray="3 4" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconSelectionEllipse`

### 203. `IconSelectionFree` (Canonical: `custom-selectionfree`)
- **Category**: Selection & Marquee Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M3.704 15.4671C2.3274 13.8314... strokeDasharray="3 4" /> <path d="M7 23.0001C6.3798 22.535... /> <path d="M5 19C6.1046 19 7 18.1046... fill=none" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconSelectionFree`

### 204. `IconSelectionIntersect` (Canonical: `squares-intersect`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 22a2 2 0 0 1-2-2" /> <path d="M14 2a2 2 0 0 1 2 2" /> <path d="M16 22h-2" /> <path d="M2 10V8" /> <path d="M2 4a2 2 0 0 1 2-2" /> <path d="M20 8a2 2 0 0 1 2 2" /> <path d="M22 14v2" /> <path d="M22 20a2 2 0 0 1-2 2" /> <path d="M4 16a2 2 0 0 1-2-2" /> <path d="M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1z" /> <path d="M8 2h2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/squares-intersect.mjs`

### 205. `IconSelectionPolygon` (Canonical: `custom-selectionpolygon`)
- **Category**: Selection & Marquee Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M12 3.5L21 9.5V18.5L12 24.5L3 18.5V9.5Z" strokeDasharray="3 4" /> <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconSelectionPolygon`

### 206. `IconSelectionRect` (Canonical: `custom-selectionrect`)
- **Category**: Selection & Marquee Tools
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M5 4C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6" /> <path d="M19 22C19.5304 22 20.0391 21.7893 20.4142 21.4142C20.7893 21.0391 21 20.5304 21 20" /> <path d="M19 4C19.5304 4 20.0391 4.21071 20.4142 4.58579C20.7893 4.96086 21 5.46957 21 6" /> <path d="M5 22C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20" /> <path d="M9 4H10" /> <path d="M15 22H14" /> <path d="M14 4H15" /> <path d="M10 22H9" /> <path d="M3 10V11" /> <path d="M21 16V15" /> <path d="M3 15V16" /> <path d="M21 11V10" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconSelectionRect`

### 207. `IconSelectionReplace` (Canonical: `square`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square.mjs`

### 208. `IconSelectionSubtract` (Canonical: `squares-subtract`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 22a2 2 0 0 1-2-2" /> <path d="M16 22h-2" /> <path d="M16 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-5a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z" /> <path d="M20 8a2 2 0 0 1 2 2" /> <path d="M22 14v2" /> <path d="M22 20a2 2 0 0 1-2 2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/squares-subtract.mjs`

### 209. `IconSelectionUnion` (Canonical: `squares-unite`)
- **Category**: Selection & Marquee Tools
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/squares-unite.mjs`

### 210. `IconAsterisk` (Canonical: `asterisk`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 5v14" /> <path d="m18.065 8.496-12.125 7" /> <path d="m5.94 8.504 12.125 7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/asterisk.mjs`

### 211. `IconAstroid` (Canonical: `astroid`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/astroid.mjs`

### 212. `IconBox3` (Canonical: `box`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /> <path d="m3.3 7 8.7 5 8.7-5" /> <path d="M12 22V12" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/box.mjs`

### 213. `IconCircle` (Canonical: `circle`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle.mjs`

### 214. `IconCornerRadius` (Canonical: `custom-cornerradius`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M4 20V16C4 9.37258 9.37258 4 16 4H20" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconCornerRadius`

### 215. `IconCreditAsterisk` (Canonical: `alias -> IconCredits`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Named Export Alias
- **Authoritative Elements**: `Alias of IconCredits`
- **Discovered Via**: `src/canvas/icons.jsx:export { IconCredits as IconCreditAsterisk }`

### 216. `IconCylinder` (Canonical: `cylinder`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<ellipse cx="12" cy="5" rx="9" ry="3" /> <path d="M3 5v14a9 3 0 0 0 18 0V5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/cylinder.mjs`

### 217. `IconDiamond` (Canonical: `diamond`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/diamond.mjs`

### 218. `IconDistort` (Canonical: `custom-distort`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4 21l3.39-.97C8.93 20.66 10.42 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z" /> <path d="M8 12c1.5-2 4.5-2 6 0s4.5 2 2 4-5 1-8-4z" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconDistort`

### 219. `IconDodecahedron` (Canonical: `custom-dodecahedron`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<polygon points="12 2 21 8.5 17.5 19 6.5 19 3 8.5" /> <polygon points="12 15 15.5 12.5 14 8.5 10 8.5 8.5 12.5" /> <line x1="12" y1="2" x2="12" y2="8.5" /> <line x1="21" y1="8.5" x2="15.5" y2="12.5" /> <line x1="17.5" y1="19" x2="12" y2="15" /> <line x1="6.5" y1="19" x2="8.5" y2="12.5" /> <line x1="3" y1="8.5" x2="10" y2="8.5" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconDodecahedron`

### 220. `IconFlipH` (Canonical: `triangles-centerline-dashed-horizontal`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10 12H8" /> <path d="M16 12h-2" /> <path d="M22 12h-2" /> <path d="M4 12H2" /> <path d="M7.298 20.288A1 1 0 008 22h8a1 1 0 00.703-1.712l-3.991-3.99a1 1 0 00-1.424-.001z" /> <path d="M7.298 3.712A1 1 0 018 2h8a1 1 0 01.703 1.712l-3.991 3.99a1 1 0 01-1.424.001z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/triangles-centerline-dashed-horizontal.mjs`

### 221. `IconFlipV` (Canonical: `triangles-centerline-dashed-vertical`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 14v2" /> <path d="M12 20v2" /> <path d="M12 2v2" /> <path d="M12 8v2" /> <path d="M20.288 16.703A1 1 0 0022 16V8a1 1 0 00-1.712-.703l-3.99 3.991a1 1 0 00-.001 1.424z" /> <path d="M3.712 16.703A1 1 0 012 16V8a1 1 0 011.712-.703l3.99 3.991a1 1 0 01.001 1.424z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/triangles-centerline-dashed-vertical.mjs`

### 222. `IconHelix` (Canonical: `custom-helix`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M7 4.5c5-2 10 0 10 2.5s-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconHelix`

### 223. `IconHelpCircle` (Canonical: `circle-question-mark`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="10" /> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <path d="M12 17h.01" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-question-mark.mjs`

### 224. `IconIcosahedron` (Canonical: `custom-icosahedron`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<polygon points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" /> <line x1="12" y1="2" x2="12" y2="22" /> <polyline points="3.5 7 12 12 20.5 7" /> <polyline points="3.5 17 12 12 20.5 17" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconIcosahedron`

### 225. `IconMeshWarp` (Canonical: `custom-meshwarp`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M4 6c4-2 12 2 16 0" /> <path d="M4 12c4-2 12 2 16 0" /> <path d="M4 18c4-2 12 2 16 0" /> <path d="M6 4c-2 4 2 12 0 16" /> <path d="M12 4c-2 4 2 12 0 16" /> <path d="M18 4c-2 4 2 12 0 16" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconMeshWarp`

### 226. `IconPerspective` (Canonical: `custom-perspective`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M5 19L8 5h8l3 14H5z" /> <path d="M7 12h10" /> <path d="M12 5v14" /> <path d="M6 15.5h12" /> <path d="M7.5 8.5h9" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconPerspective`

### 227. `IconPlayCircle` (Canonical: `circle-play`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z" /> <circle cx="12" cy="12" r="10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-play.mjs`

### 228. `IconPoint` (Canonical: `circle-dot`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<circle cx="12" cy="12" r="1" /> <circle cx="12" cy="12" r="10" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/circle-dot.mjs`

### 229. `IconPointer` (Canonical: `pointer`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M22 14a8 8 0 0 1-8 8" /> <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" /> <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" /> <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" /> <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pointer.mjs`

### 230. `IconPoints` (Canonical: `alias -> IconCredits`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Named Export Alias
- **Authoritative Elements**: `Alias of IconCredits`
- **Discovered Via**: `src/canvas/icons.jsx:export { IconCredits as IconPoints }`

### 231. `IconPolygon` (Canonical: `pentagon`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pentagon.mjs`

### 232. `IconPyramid` (Canonical: `pyramid`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M2.5 16.88a1 1 0 0 1-.32-1.43l9-13.02a1 1 0 0 1 1.64 0l9 13.01a1 1 0 0 1-.32 1.44l-8.51 4.86a2 2 0 0 1-1.98 0Z" /> <path d="M12 2v20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/pyramid.mjs`

### 233. `IconRotateCcw` (Canonical: `rotate-ccw`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/rotate-ccw.mjs`

### 234. `IconSphere` (Canonical: `custom-sphere`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<circle cx="12" cy="12" r="9" /> <ellipse cx="12" cy="12" rx="9" ry="3.5" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconSphere`

### 235. `IconSquare` (Canonical: `square`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="18" height="18" x="3" y="3" rx="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square.mjs`

### 236. `IconStar` (Canonical: `star`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/star.mjs`

### 237. `IconTorus` (Canonical: `torus`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<ellipse cx="12" cy="11" rx="3" ry="2" /> <ellipse cx="12" cy="12.5" rx="10" ry="8.5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/torus.mjs`

### 238. `IconTorusKnot` (Canonical: `custom-torusknot`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<circle cx="12" cy="12" r="8" /> <path d="M12 4a8 8 0 0 1 7 4M12 20a8 8 0 0 1-7-4" /> <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(30 12 12)" /> <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(-30 12 12)" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconTorusKnot`

### 239. `IconTriangle` (Canonical: `triangle`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/triangle.mjs`

### 240. `IconVectorSquare` (Canonical: `custom-vectorsquare`)
- **Category**: Shapes, Geometry & Transforms
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<rect x="5" y="5" width="14" height="14" stroke="currentColor" fill="none" /> <rect x="2" y="2" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" /> <rect x="17" y="2" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" /> <rect x="2" y="17" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" /> <rect x="17" y="17" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconVectorSquare`

### 241. `IconApi` (Canonical: `plug`)
- **Category**: Third-Party, Services & Identity
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 22v-5" /> <path d="M15 8V2" /> <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" /> <path d="M9 8V2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/plug.mjs`

### 242. `IconChrome` (Canonical: `custom-chrome`)
- **Category**: Third-Party, Services & Identity
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0z..." fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconChrome`

### 243. `IconCode` (Canonical: `braces`)
- **Category**: Third-Party, Services & Identity
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" /> <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/braces.mjs`

### 244. `IconCredits` (Canonical: `custom-credits`)
- **Category**: Third-Party, Services & Identity
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36l12.72-12.72" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconCredits`

### 245. `IconGithub` (Canonical: `custom-github`)
- **Category**: Third-Party, Services & Identity
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconGithub`

### 246. `IconGoogle` (Canonical: `custom-google`)
- **Category**: Third-Party, Services & Identity
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M20.5 12.2A8.5 8.5 0 1 1 18.2 6.3L15 9.5a4.5 4.5 0 1 0 1.9 2.7H12" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconGoogle`

### 247. `IconHd` (Canonical: `custom-hd`)
- **Category**: Third-Party, Services & Identity
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<rect x="2" y="4" width="20" height="16" rx="4" /> <path d="M6 8v8" /> <path d="M10 8v8" /> <path d="M6 12h4" /> <path d="M14 8v8h2.5a3.5 3.5 0 0 0 0-7H14z" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconHd`

### 248. `IconOpenCode` (Canonical: `custom-opencode`)
- **Category**: Third-Party, Services & Identity
- **Type**: Handcrafted 24×24 SVG Function Component
- **Authoritative Elements**: `<path d="M0 0h24v24H0z" fill="none" /> <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" fill="currentColor" />`
- **Discovered Via**: `src/canvas/icons.jsx:export function IconOpenCode`

### 249. `IconServer` (Canonical: `server`)
- **Category**: Third-Party, Services & Identity
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<rect width="20" height="8" x="2" y="2" rx="2" ry="2" /> <rect width="20" height="8" x="2" y="14" rx="2" ry="2" /> <line x1="6" x2="6.01" y1="6" y2="6" /> <line x1="6" x2="6.01" y1="18" y2="18" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/server.mjs`

### 250. `IconTerminal` (Canonical: `square-terminal`)
- **Category**: Third-Party, Services & Identity
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="m7 11 2-2-2-2" /> <path d="M11 13h4" /> <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/square-terminal.mjs`

### 251. `IconZap` (Canonical: `zap`)
- **Category**: Third-Party, Services & Identity
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/zap.mjs`

### 252. `IconAlignCenter` (Canonical: `text-align-center`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 5H3" /> <path d="M17 12H7" /> <path d="M19 19H5" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/text-align-center.mjs`

### 253. `IconAlignLeft` (Canonical: `text-align-start`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 5H3" /> <path d="M15 12H3" /> <path d="M17 19H3" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/text-align-start.mjs`

### 254. `IconAlignRight` (Canonical: `text-align-end`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M21 5H3" /> <path d="M21 12H9" /> <path d="M21 19H7" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/text-align-end.mjs`

### 255. `IconBold` (Canonical: `bold`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/bold.mjs`

### 256. `IconFileText` (Canonical: `file-text`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /> <path d="M14 2v5a1 1 0 0 0 1 1h5" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/file-text.mjs`

### 257. `IconItalic` (Canonical: `italic`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<line x1="19" x2="10" y1="4" y2="4" /> <line x1="14" x2="5" y1="20" y2="20" /> <line x1="15" x2="9" y1="4" y2="20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/italic.mjs`

### 258. `IconListOrdered` (Canonical: `list-ordered`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M11 5h10" /> <path d="M11 12h10" /> <path d="M11 19h10" /> <path d="M4 4h1v5" /> <path d="M4 9h2" /> <path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/list-ordered.mjs`

### 259. `IconListUnordered` (Canonical: `list`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M3 5h.01" /> <path d="M3 12h.01" /> <path d="M3 19h.01" /> <path d="M8 5h13" /> <path d="M8 12h13" /> <path d="M8 19h13" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/list.mjs`

### 260. `IconText` (Canonical: `type`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M12 4v16" /> <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /> <path d="M9 20h6" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/type.mjs`

### 261. `IconUnderline` (Canonical: `underline`)
- **Category**: Typography & Text Styling
- **Type**: Lucide 24×24 SVG Re-export
- **Authoritative Elements**: `<path d="M6 4v6a6 6 0 0 0 12 0V4" /> <line x1="4" x2="20" y1="20" y2="20" />`
- **Discovered Via**: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/underline.mjs`

