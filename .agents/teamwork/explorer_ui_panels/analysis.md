# Technical Analysis: Side Panels Information Architecture & Action Bars Navigation Streamlining

**Date**: 2026-10-21  
**Investigator**: explorer_ui_panels  
**Scope**: 
- **R3**: Side Panels Information Architecture & Visual Decluttering (Right Inspector & Left Layer Tree)
- **R4**: Action Bars & Navigation Streamlining (Top Toolbar, Bottom Contextual Island / Taskbars, Tooltips, Modals & Navigation)
**Target Environment**: VOO Design Web & Desktop Workbench (`scripts/deploy-editor.sh` target: `la` (`103.114.160.86`))  
**Design Standard**: `Design.md`, `scripts/check-design.mjs`, `design/tokens.cjs`

---

## Executive Summary

This investigation analyzed the entire visual language, component structure, layout hierarchy, and micro-interactions across VOO Design's side panels (Right Inspector and Left Layer Tree) and action bars (Top Toolbar, Contextual Taskbar Island, Tooltips, Modals).

### Key Diagnostic Findings:
1. **Right Inspector Panel (`src/canvas/components/editor_properties/`)**:
   - **Redundant Borders & Visual Striping**: Within individual sections (notably `TransformSection`), multiple internal borders (`border-t border-white/[0.06] pt-2`) slice the panel into disjointed stripes. `ColourFillSection` and `ColourStrokeSection` duplicate outer top borders rather than relying on uniform section rhythm.
   - **Empty Placeholder Inefficiency & Copy Bug**: When no fill, stroke, or effects are applied, large dashed boxes (`border border-dashed border-white/[0.08] p-2.5 text-center`) occupy 35–50px of vertical space. Furthermore, both `colour_fill_section.jsx:166` and `colour_stroke_section.jsx:82` erroneously display `t("editor.layers.noEffects")` ("No effects applied") when no fill or stroke exists.
   - **Lack of Progressive Disclosure in Typography (`TextSection`)**: Eight rows of controls (font family, font size/weight/italic/underline, 3 separate segment pills for auto-width, direction, and text alignment, line height/letter spacing/baseline shift, and text-on-path) are dumped onto the screen simultaneously, creating visual overwhelm.
   - **Control Sizing & Accent Inconsistencies**:
     - `PropertiesPanelHeader`: Inconsistent button sizes (`rounded-full p-1` vs `h-8 w-8 rounded-lg`).
     - `TransformRadiusControls`: Unlink button is `h-8 w-8` while adjacent `ScrubField` is `h-7`.
     - `AutoLayoutSection`: Uses hardcoded `bg-[#222222]` and incorrect focus ring `focus-visible:ring-[#E5B2FF]/40` (purple AI accent) instead of the design token `focus-visible:ring-[#a7ffd4]/40` (mint system/focus token).
     - `AnchorPointGrid`: Uses hardcoded `bg-[#222222]` and `#b2ffd6` instead of `#a7ffd4`.

2. **Left Layer Tree (`src/canvas/components/editor_layers.jsx`)**:
   - **Duplicated Properties**: Directly under the search bar, lines 942–969 render full Opacity (`ScrubField`) and Blend Mode (`FlatSelect`) in a 2-column grid. This consumes 36px of prime vertical space for controls already prominent in the Right Inspector.
   - **Row-Level Clutter & Hover Jitter**: Each layer row contains up to 4 lock toggles (`lockTransparency`, `lockImagePixels`, `lockPosition`, and master `lock`). Hovering the lock cluster expands 3 hidden buttons (`group-hover/locks:block`), inducing severe horizontal layout jitter in a narrow 256px panel.
   - **Search Input Inconsistency**: Uses arbitrary classes instead of standard input styling.

3. **Action Bars & Navigation (`editor_toolbar.jsx`, `editor_contextual_taskbar.jsx`)**:
   - **Top Toolbar Contrast**: Active tools use `bg-white text-black font-medium` (`editor_toolbar.jsx:47`), creating a blinding white circle on an ultra-dark canvas. Modern dark design requires subtle surface elevation (`bg-white/[0.14] text-white shadow-xs` or `bg-neutral-800 text-white ring-1 ring-white/10`).
   - **Snapping Shortcut Typo**: Tooltip in `editor_toolbar.jsx:407` has `shortcut="⇧⌘;'"` with an extraneous single quote.
   - **Contextual Island Multi-Level Friction**: The bottom taskbar island implements Pen-style AI actions well (AI in purple `#E5B2FF`, non-AI in monochrome), but the "More" dropdown mixes image AI actions, geometric flips, copy SVG, and lock states without clear visual clustering or smooth entrance transitions.

---

## Detailed Investigation & Architectural Refinement

### 1. Right Inspector Panel Information Architecture (R3)

#### 1.1 Shell & Header Normalization
- **File**: `src/canvas/components/editor_properties/properties_panel_header.jsx`
- **Issue**:
  - Line 44: Mask button has `className="rounded-full p-1 ..."`.
  - Line 66: Motion button has `className="flex h-8 w-8 items-center justify-center rounded-lg ..."`.
  - Line 82: Swap side button has `className="rounded-full p-1 ..."`.
- **Solution**: Unify all header buttons to a standard `h-7 w-7` rounded-lg tactile button:
  ```jsx
  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
  ```
  For the active motion button:
  ```jsx
  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E5B2FF]/10 text-[#E5B2FF] hover:bg-[#E5B2FF]/20 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
  ```

#### 1.2 Eliminating Redundant Borders in Transform Section
- **File**: `src/canvas/components/editor_properties/transform_section.jsx`
- **Observations**:
  - Line 247: `<div className="grid grid-cols-2 gap-2 items-center border-t border-white/[0.06] pt-2">`
  - Line 288: `<div className="pt-2 border-t border-white/[0.06]">`
- **Reasoning**:
  `TransformSection` is already enclosed within `<StaticSection title={t("editor.props.transform")}>` which has its own top separator. Inserting internal `border-t` hairlines breaks visual unity and creates visual noise.
- **Solution**: Replace internal hairline borders with unified vertical spacing (`gap-2` or `pt-1`), allowing lightness hierarchy (`bg-neutral-800` controls resting on `bg-black/95` panel) to establish structure.

#### 1.3 Corner Radius Control Ergonomics
- **File**: `src/canvas/components/editor_properties/transform_radius_controls.jsx`
- **Observations**:
  - Line 97: Unlink button has `className="flex h-8 w-8 items-center justify-center rounded-lg ..."` while the scrub field is `h-7`.
  - Line 99: Active unlink button has `bg-white/10 text-white`.
- **Solution**:
  - Match height to `h-7 w-7`.
  - When unlinked (active), use `bg-white/[0.12] text-[#a7ffd4]` matching `TransformDimensionBar`'s link button.

#### 1.4 Token Compliance in Anchor Grid & Auto Layout
- **Files**:
  - `src/canvas/components/editor_properties/transform_anchor_grid.jsx:18`:
    `bg-[#222222]` → `bg-neutral-800` (`#262626`).
    Line 37: `bg-[#b2ffd6]` → `bg-[#a7ffd4]`.
  - `src/canvas/components/editor_properties/auto_layout_section.jsx:25`:
    `FIELD_CLASS`: `bg-[#222222]` → `bg-neutral-800`, `focus-visible:ring-[#E5B2FF]/40` → `focus-visible:ring-[#a7ffd4]/40`.
    Auto-layout is core geometry/layout, so it must use mint (`#a7ffd4`), reserving purple (`#E5B2FF`) strictly for AI operations.

#### 1.5 Progressive Disclosure in Typography (`TextSection`)
- **File**: `src/canvas/components/editor_properties/text_section.jsx`
- **Observations**:
  - Lines 164–220: Three separate segment pills (`<div className="flex gap-1 rounded-xl bg-neutral-900 p-1">`) are stacked sequentially:
    1. Auto width vs Fixed wrap
    2. Direction (Horizontal vs Vertical)
    3. Alignment (Left, Center, Right)
  - Followed immediately by Line Height, Letter Spacing, Baseline Shift, and Text-on-Path.
- **Solution**:
  - **Tier 1 (Always Visible Primary)**:
    1. Font Family (`CustomFontPicker`)
    2. Font Size (`ScrubField`) + Font Weight + Italic + Underline
    3. Alignment (`IconAlignLeft`, `IconAlignCenter`, `IconAlignRight`)
    4. Line Height + Letter Spacing
  - **Tier 2 (Progressive Disclosure - Collapsible/More Options)**:
    - Add an expandable "More Typography Options" toggle (or secondary disclosure chevron):
      - Auto Width / Fixed Wrap mode
      - Direction (Horizontal / Vertical)
      - Baseline Shift
      - Text on Path options
  - This preserves 100% of the capability while reducing default vertical height by ~110px.

#### 1.6 Eliminating False "No Effects" Placeholders in Fill & Stroke
- **Files**:
  - `src/canvas/components/editor_properties/colour_fill_section.jsx:160-168`
  - `src/canvas/components/editor_properties/colour_stroke_section.jsx:71-84`
- **Bug & Noise Observation**:
  - When a layer has no fill or stroke, both sections render a dashed border box with the text `t("editor.layers.noEffects")` ("No effects applied").
  - This confuses users (why does Fill/Stroke say "No effects"?) and wastes 40px of vertical space.
- **Solution**:
  - In `colour_fill_section.jsx`, when `none`, render a clean compact row with `+ Add Fill` or keep the header with `＋` and omit the redundant dashed box.
  - In `colour_stroke_section.jsx`, when `none`, omit the dashed box and let the header `＋` afford adding a stroke, or render a compact button with `+ Add Stroke`.
  - In `layer_effects_section.jsx:156`: When `configuredAdjustments.length === 0 && configuredEffects.length === 0`, default the section to collapsed or render a quiet single-line placeholder rather than an oversized dashed box.

---

### 2. Left Layer Tree Information Architecture (R3)

#### 2.1 Deduplicating Opacity & Blend Mode Header Controls
- **File**: `src/canvas/components/editor_layers.jsx:942-969`
- **Observation**:
  - The Layer Tree renders:
    ```jsx
    <div className="grid grid-cols-2 gap-1.5 mb-2">
      <ScrubField prefix={<IconOpacity size={12} />} suffix="%" ... />
      <FlatSelect value={activeObject?.blendMode} ... />
    </div>
    ```
  - Both properties are already permanently present in the Right Inspector's Transform section (`TransformSection:247-274`).
- **Solution**:
  - Condense or streamline this into a subtle single-row bar, or hide when Right Inspector is active, giving maximum viewport height to the layer tree hierarchy.

#### 2.2 Eliminating Lock Cluster Hover Jitter
- **File**: `src/canvas/components/editor_layers.jsx:1403-1542`
- **Observation**:
  - In each layer row, hovering over `group/locks` suddenly unhides 3 lock buttons:
    `hidden group-hover/locks:block text-neutral-400 hover:text-white`
  - This pushes the row content and layer name to the left by ~48px, causing visual popping and accidental misclicks.
- **Solution**:
  - Keep the primary Master Lock (`IconLock` / `IconUnlock`) visible on layer hover or when active.
  - Advanced granular locks (Transparency, Image Pixels, Position) should be accessible via right-click Context Menu (`editor_context_menu.jsx`) or stay fixed-width without popping unannounced.
  - If granular locks are enabled, render small non-disruptive indicator dots or retain fixed slot allocation without layout reflow.

#### 2.3 Search Input Styling
- **File**: `src/canvas/components/editor_layers.jsx:938`
- **Observation**:
  `className="mb-2 w-full rounded-xl border border-transparent bg-neutral-900 px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none transition-colors hover:bg-neutral-800 focus:border-[#a7ffd4]/40"`
- **Solution**:
  Align with `fieldClass` from `property_section.jsx`:
  ```jsx
  className="mb-2 h-7 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] font-mono text-neutral-100 placeholder:text-neutral-500 outline-none transition-colors hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40"
  ```

---

### 3. Action Bars & Navigation Streamlining (R4)

#### 3.1 Top Toolbar Active Contrast & Visual Balance
- **File**: `src/canvas/components/editor_toolbar.jsx:44-49`
- **Observation**:
  ```javascript
  export const toolButtonClass = (active) =>
    `rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
      active
        ? "bg-white text-black font-medium"
        : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
    }`;
  ```
  Pure solid white `bg-white text-black` creates an excessively high-contrast blob against the `#000000` / `#171717` dark canvas.
- **Solution**:
  Refine the active tool state to:
  ```javascript
  export const toolButtonClass = (active) =>
    `rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
      active
        ? "bg-white/[0.16] text-white font-medium ring-1 ring-white/20 shadow-pop"
        : "text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-100"
    }`;
  ```
- **File**: `src/canvas/components/editor_toolbar.jsx:407`
  - Fix typo: `shortcut="⇧⌘;'"` → `shortcut="⇧⌘;"`.

#### 3.2 Bottom Contextual Taskbar Island Refinements
- **File**: `src/canvas/components/editor_contextual_taskbar.jsx`
- **Color Coding**:
  - AI Actions: Stays strictly `#E5B2FF` purple (`ICON_BTN_AI`: `bg-[#E5B2FF]/10 text-[#E5B2FF] hover:bg-[#E5B2FF]/20 hover:text-[#eed0ff]`).
  - Non-AI Actions: Stays strictly neutral monochrome (`ICON_BTN_DEFAULT`: `text-neutral-300 hover:bg-white/10 hover:text-white`).
  - Selection Apply check button (Line 313): Replace `bg-white text-black` with `bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 ring-1 ring-emerald-500/40`.
- **Streamlining "More" Popover**:
  - Line 867: Add smooth micro-transition `animate-in fade-in zoom-in-95 duration-100 ease-out`.
  - Maintain clean divider lines (`bg-white/[0.08]`) separating transform/duplicate from AI actions.

#### 3.3 Modal Transitions & Micro-Interactions
- **Files**:
  - `src/canvas/components/shortcut_reference_modal.jsx:29-30`:
    - Replace hardcoded `bg-[#181818]` with `bg-neutral-900/95`.
    - Add `animate-in fade-in duration-150` to overlay and `zoom-in-95 duration-150` to dialog panel.
  - `src/canvas/components/top-bar-menu-popover.jsx:112`:
    - Add `animate-in fade-in zoom-in-95 duration-100 ease-out`.
  - `src/canvas/components/page_switcher.jsx:39`:
    - Add `animate-in fade-in zoom-in-95 duration-100 ease-out`.

---

## Automated Verification Matrix

| Test Suite / Script | Verification Target | Expected Result |
| :--- | :--- | :--- |
| `npx vitest run tests/unit/contextual_island.test.jsx` | Verifies bottom taskbar island, node context extraction, AI tool dispatch, and action button test IDs. | 100% Pass (20/20) |
| `npx vitest run tests/unit/pen_hybrid_agent.test.jsx` | Verifies Pen App hybrid agent integration, contextual island triggers, and canvas agent panel. | 100% Pass (5/5) |
| `npx vitest run tests/unit/editor_upscale_taskbar.test.jsx` | Verifies upscale and AI actions on contextual taskbar. | 100% Pass (5/5) |
| `npx vitest run tests/unit/align_section.test.jsx` | Verifies alignment controls, distribute axes, tidy up, and gap rows. | 100% Pass (10/10) |
| `npx vitest run tests/unit/gap_property_controls.test.jsx` | Verifies ScrubField interaction, measurement, and gap input. | 100% Pass (14/14) |
| `npx vitest run tests/unit/editor_canvas_tree_row.test.js` | Verifies layer tree row icons for frames and components. | 100% Pass (4/4) |
| `node scripts/check-design.mjs` | Verifies Design.md tokens (monochrome hierarchy, shadow ladder, border washes, font scale). | 0 violations (clean) |
| `npm run build` | Verifies production bundling with Vite/React. | Clean build, 0 errors |

---

## Proposed Changes Summary & File Reference

| File Path | Lines | Target Modification |
| :--- | :--- | :--- |
| `src/canvas/components/editor_properties/properties_panel_header.jsx` | 44, 66, 82 | Unify header buttons to uniform `h-7 w-7 rounded-lg text-neutral-400 hover:bg-white/[0.08]` tactile buttons. |
| `src/canvas/components/editor_properties/transform_section.jsx` | 247, 288 | Remove internal `border-t border-white/[0.06] pt-2` hairlines; rely on spatial spacing. |
| `src/canvas/components/editor_properties/transform_radius_controls.jsx` | 97-103 | Normalize unlink button height from `h-8 w-8` to `h-7 w-7`; change active state to `bg-white/[0.12] text-[#a7ffd4]`. |
| `src/canvas/components/editor_properties/transform_anchor_grid.jsx` | 18, 37 | Fix token violations: `bg-[#222222]` → `bg-neutral-800`, dot `#b2ffd6` → `#a7ffd4`. |
| `src/canvas/components/editor_properties/auto_layout_section.jsx` | 25-27 | Fix token violations: `bg-[#222222]` → `bg-neutral-800`, focus ring `#E5B2FF` → `#a7ffd4`. |
| `src/canvas/components/editor_properties/text_section.jsx` | 164-220 | Group secondary typography controls into progressive disclosure collapsible section. |
| `src/canvas/components/editor_properties/colour_fill_section.jsx` | 160-168 | Remove incorrect `t("editor.layers.noEffects")` dashed box when fill is none; render compact affordance. |
| `src/canvas/components/editor_properties/colour_stroke_section.jsx` | 71-84, 228 | Remove incorrect `t("editor.layers.noEffects")` dashed box; refine more settings button from `bg-white text-black` to `bg-white/[0.12] text-white`. |
| `src/canvas/components/editor_properties/layer_effects_section.jsx` | 155-161 | Make empty state compact or default to collapsed when no effects are configured. |
| `src/canvas/components/editor_layers.jsx` | 938, 1403-1542 | Align search input to `fieldClass`; suppress hover-induced layout jitter in granular lock cluster. |
| `src/canvas/components/editor_toolbar.jsx` | 47, 407 | Refine active tool from blinding `bg-white text-black` to elevated dark wash `bg-white/[0.16] text-white ring-1 ring-white/20`; fix shortcut typo. |
| `src/canvas/components/editor_contextual_taskbar.jsx` | 313, 867 | Refine selection check button; add smooth entrance transition `animate-in fade-in zoom-in-95 duration-100` to More popover. |
| `src/canvas/components/shortcut_reference_modal.jsx` | 29-30 | Replace `bg-[#181818]` with `bg-neutral-900/95`; add entry transitions. |
| `src/canvas/components/top-bar-menu-popover.jsx` | 112 | Add `animate-in fade-in zoom-in-95 duration-100 ease-out`. |
| `src/canvas/components/page_switcher.jsx` | 39 | Add `animate-in fade-in zoom-in-95 duration-100 ease-out`. |

---
**Status**: Ready for handoff and implementation by the team.
