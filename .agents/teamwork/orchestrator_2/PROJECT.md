# Project: VOO Design — Smart Spacing & Gap Architecture

## Architecture
VOO Design's smart spacing and gap system spans three architectural layers:
1. **Snapping & Geometric Overlay Layer (`src/canvas/editor/`)**:
   - `scene_snapping.js`: Real-time geometric analysis during node dragging. Computes equidistant gaps (append right/left, append below/above, in-between insertion) between dragged nodes and adjacent stationary sibling bounding boxes (`nodeAABB`). Generates guide descriptors while preserving `{ type: 'v'|'h', pos }` for backward compatibility.
   - `chrome_stage_overlays.js`: Canvas2D rendering pipeline for overlay guides. Draws vibrant magenta (`#e056fd`) guide segments, 8px perpendicular tick marks at boundary edges, and measurement pill badges displaying numeric pixel values (e.g., `16px`).
   - `editor_pointer_move.js` & `editor_pointer.js`: Drag gesture handling, bypass triggers (`Cmd/Ctrl` held or global snap disabled), and instantaneous overlay cleanup on mouse release (`api.setGuides([])`).

2. **Alignment & Spacing Mathematical Transformation Engine (`src/canvas/editor/align_ops.js`)**:
   - Boundary-anchored distribution algorithm: Outermost layers ($minLayer$ and $maxLayer$) remain strictly fixed; internal layers are spaced evenly based on available free space:
     $$\text{freeSpace} = (pos_{max} - (pos_{min} + size_{min})) - \sum_{k \in \text{inner}} size_k, \quad \text{gap} = \frac{\text{freeSpace}}{N - 1}$$
   - Supports mixed-size elements, negative free space (equal overlap), container nodes, and degenerate selections ($N \le 2$).
   - Integration with `editor_engine_groups.js:layoutSelection` and atomic undo/redo contract `"editor.layout.selection"`.
   - Exposes `measureSpacing(nodes, axis)` and `distributeSpacingNodes(nodes, { axis, gap })` for custom interactive gap adjustment.

3. **Inspector Property Controls (`src/canvas/components/editor_properties/`)**:
   - `properties_panel_sections.jsx`: Threads `selectedNodes` down into `AlignSection`.
   - `align_section.jsx`: Renders dedicated distribute spacing buttons with i18n tooltips and Figma-standard shortcuts (`⌥⇧H`, `⌥⇧V`). When $k \ge 2$ layers are selected, renders an interactive Gap control row featuring dominant-axis toggle and a `ScrubField` numeric input.
   - Strictly conforms to `Design.md` design tokens (`rounded-xl`, `text-[10px]`, `neutral-800/900`, `#a7ffd4` mint focus ring, zero lint violations).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Equidistant Gap Detection & In-Between Snapping | Detects append right/left, append below/above, and centered in-between insertion gaps during layer dragging | M1 | Survey (Explorer 1) |
| 2 | Smart Spacing Overlay Rendering | Renders magenta `#e056fd` guide segments, boundary tick marks, and measurement pill badges with `${gap}px` labels | M1 | Survey (Explorer 1) |
| 3 | Snapping Bypass & Lifecycle Management | Bypasses snapping when `Cmd/Ctrl` is held or magnet is disabled; cleans guides on `pointerup` | M1 | Survey (Explorer 1) |
| 4 | Boundary-Anchored Distribute Spacing Algorithm | Evenly distributes edge-to-edge gaps while fixing outermost layers, handling mixed sizes and negative gaps | M2 | Survey (Explorer 2) |
| 5 | Gap Measurement & Setting API | Computes average/min/max gaps (`measureSpacing`) and sets custom fixed gaps (`setSpacingNodes` / `distributeSpacingNodes`) | M2 | Survey (Explorer 2) |
| 6 | Undo/Redo Transaction Integration | Commits layout transforms under atomic contract `"editor.layout.selection"` with clean history restoration | M2 | Survey (Explorer 2) |
| 7 | Multi-Selection Prop Threading | Forwards `selectedNodes` from `properties_panel_sections.jsx` into `AlignSection` | M3 | Survey (Explorer 3) |
| 8 | Distribute Spacing UI Buttons & i18n | Adds explicit Distribute Horizontal/Vertical Spacing buttons with Figma-parity tooltips and shortcuts | M3 | Survey (Explorer 3) |
| 9 | Interactive Gap Numeric Scrub Field | Renders interactive Gap input field displaying current average gap and enabling custom pixel gap adjustment | M3 | Survey (Explorer 3) |
| 10 | Design System Compliance | 100% adherence to `Design.md` dark-mode tokens, overlay shadow ladder, and 0 `lint:design` violations | M3 / M5 | Survey (Explorer 3) |
| 11 | Comprehensive 4-Tier Test Suite | Covers all features, boundaries, combinations, and real-world layout scenarios | M4 | Survey (E2E Track) |
| 12 | Automated Quality Verification & Production Deployment | `npm test` 100% pass, `npm run lint:design` clean, `npm run build` clean, auto-deploy to `la` server | M5 | Dispatch Briefing |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Smart Spacing Guides & Gap Snapping | `scene_snapping.js`, `chrome_stage_overlays.js`: in-between snap, paired gap descriptors, magenta overlays with tick marks & measurement pills | None | DONE (worker: ce2e87c0-35c2-4a9f-960f-1bdc12ba988a) |
| M2 | Distribute Spacing Engine & Math | `align_ops.js`: boundary-anchored equal-gap algorithm, mixed sizes, negative free space, `measureSpacing`, `distributeSpacingNodes` | None | DONE (worker: 210a489b-e1e5-4241-bf47-ddb5bb7a210e) |
| M3 | Properties Panel & Gap Controls | `properties_panel_sections.jsx`, `align_section.jsx`, `extended-en.js`, `extended-zh.js`: prop threading, distribute buttons, Gap `ScrubField` | M2 | IN_PROGRESS (worker: 1c924062-7544-418f-86de-0cc0fdc148e3) |
| M4 | Comprehensive Test Suite & Adversarial Testing | `tests/unit/smart_spacing_snapping.test.js`, `tests/unit/distribute_spacing.test.js`, `tests/unit/align_section.test.jsx`, `TEST_READY.md` | M1, M2, M3 | IN_PROGRESS (writer: 3c240670-3f6d-48bb-b8f3-818b8d2da194) |
| M5 | Quality Verification & Production Deployment | Full test pass (`npm test`), 0 design violations (`npm run lint:design`), clean build (`npm run build`), deploy to `la` (`VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`), HTTP 200 liveness check | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### 1. `scene_snapping.js` ↔ `chrome_stage_overlays.js` & `editor_pointer_move.js`
- `snapNodeBounds({ doc, activeIds, rect, zoom, options })`:
  Returns:
  ```typescript
  {
    x: number,
    y: number,
    guides: Array<
      | { type: "v", pos: number }
      | { type: "h", pos: number }
      | {
          type: "gap_h",
          x1: number,
          x2: number,
          y: number,
          gap: number,
          label: string,
          pos: number,
        }
      | {
          type: "gap_v",
          y1: number,
          y2: number,
          x: number,
          gap: number,
          label: string,
          pos: number,
        }
    >
  }
  ```

### 2. `align_ops.js` ↔ `editor_engine_groups.js` & `align_section.jsx`
- `distributeSpacingNodes(nodes: Node[], axisOrOptions: string | { axis: "horizontal"|"vertical", gap?: number }, canvasBounds?: Bounds): Patch[]`
  - Input: List of nodes, axis string or options object with target gap.
  - Output: Array of `{ id: string, patch: { x: number, y: number } }`.
- `measureSpacing(nodes: Node[], axis?: "horizontal"|"vertical")`:
  - Output: `{ avgGap: number, minGap: number, maxGap: number, isEquidistant: boolean } | null`.

### 3. `properties_panel_sections.jsx` ↔ `align_section.jsx`
- `<AlignSection count={number} onLayout={Function} selectedNodes={Node[]} />`
  - Consumes `selectedNodes` to measure current gaps via `measureSpacing`.
  - Dispatches updates via `onLayout((nodes) => distributeSpacingNodes(nodes, { axis, gap: targetGap }))`.

---

## Code Layout
```
src/
├── canvas/
│   ├── editor/
│   │   ├── scene_snapping.js           # [M1] In-between equidistant snapping, gap descriptors
│   │   ├── chrome_stage_overlays.js    # [M1] Magenta spacing guides, tick marks, pill badges
│   │   ├── align_ops.js                # [M2] Distribute spacing algorithm, measureSpacing
│   │   ├── editor_engine_groups.js     # [M2] layoutSelection dispatcher & bounds
│   │   ├── editor_undo_actions.js      # [M2] Atomic undo/redo contract
│   │   └── editor_pointer_move.js      # [M1] Snapping bypass and guide lifecycle
│   └── components/
│       └── editor_properties/
│           ├── align_section.jsx       # [M3] Distribute buttons & interactive Gap ScrubField
│           └── properties_panel_sections.jsx # [M3] Prop forwarding for selectedNodes
tests/
└── unit/
    ├── smart_spacing_snapping.test.js  # [M4] Snapping & overlay tests
    ├── distribute_spacing.test.js      # [M4] Distribution math & degenerate case tests
    └── align_section.test.jsx          # [M4] Properties panel gap input tests
```
