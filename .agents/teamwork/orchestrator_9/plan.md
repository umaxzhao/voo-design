# Milestone Plan: VOO Design UX Refinement, Tactile Feel Polish & Decluttering

## Phase 0: Survey & Codebase Exploration (COMPLETED)
- 3 parallel Explorers completed hard handoffs:
  * `explorer_canvas_perf` (`adb23b4c`): R1 Canvas 60fps & Tracking Loops
  * `explorer_interaction_tools` (`0998910e`): R2 Selection Precision, Snapping Feel & Tool Transitions
  * `explorer_ui_panels` (`8595813e`): R3 & R4 Side Panels IA, Visual Decluttering & Action Bars Streamlining

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Batch Node Updates | Implement `updateNodes` in `doc_ops_nodes.js` & `editor_engine_node_ops.js` | M1 | R1 (Perf) |
| 2 | Transient Gesture Fast-Path | Add `preview: true` to `setDoc` to bypass text measurement, font loading, auto-layout reflow & bump | M1 | R1 (Perf) |
| 3 | Batch Drag/Transform Loops | Refactor multi-node move, resize, and rotate in `editor_pointer_move.js` and `editor_pointer_transform.js` | M1 | R1 (Perf) |
| 4 | Decouple Camera Subscription | Remove `editorCamera` hook subscriptions from `ImageEditor` root; coalesce wheel/pan with rAF | M1 | R1 (Perf) |
| 5 | Cache Stage Dimensions | Prevent layout thrashing by caching clientWidth/clientHeight in `editor_engine_render.js` | M1 | R1 (Perf) |
| 6 | Screen-Space Hit Slop | Scale hit slop inversely with zoom in `doc_ops_nodes.js:nodeAtPoint` | M1 | R2 (Interaction) |
| 7 | Path Stroke Hit Testing | Test actual bezier stroke distance for unfilled paths rather than outer AABB | M1 | R2 (Interaction) |
| 8 | Empty Space Multi-Select Fix | Remove `combinedBounds` fallthrough in `editor_pointer_transform.js` to avoid dragging empty space | M1 | R2 (Interaction) |
| 9 | Pen Edit Precision | Fix ghost unrotated anchor hit-testing and prioritize anchor dot over zero-length handles in `editor_pen_edit.js` | M1 | R2 (Interaction) |
| 10 | Snapping Feel & Crisp Guides | Proximity filtering for candidate nodes, 2px hysteresis band in `scene_snapping.js`, bounded segments in `chrome_stage_overlays.js` | M1 | R2 (Interaction) |
| 11 | Tool Transition & Routing | Synchronize `workspaceTool`, eliminate null engine drops in `runTool`, add `TOOL.FRAME` and `KeyF` shortcut | M1 | R2 (Interaction) |
| 12 | Inspector Decluttering | Eliminate internal hairline borders, remove dashed empty boxes with copy bugs in fill/stroke, normalize heights to `h-7` | M2 | R3 (UI) |
| 13 | Typography Progressive Disclosure | Group advanced typography controls under collapsible disclosure in `text_section.jsx` | M2 | R3 (UI) |
| 14 | Design Token Compliance | Fix `#E5B2FF` focus rings in `auto_layout_section.jsx` to `#a7ffd4`, fix 3 `shadow-sm` in `editor_toolbar.jsx` | M2 | R3/R4 (UI) |
| 15 | Layer Tree Cleanup | Remove redundant Opacity/Blend Mode controls in left header, eliminate row locks hover jitter, normalize search input | M2 | R3 (UI) |
| 16 | Action Bars Streamlining | Elevated translucent active tool wash, fix snapping shortcut typo, smooth popover/modal entrance animations | M2 | R4 (UI) |
| 17 | Automated Verification & Deploy | Run vitest across core suites, check-design 0 violations, clean build, and deploy to server `la` with live HTTP 200 | M3 | All |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Canvas Core Engine 60fps & Tactile Interaction | Features 1–11: Batching, preview fast-path, camera decoupling, screen-space hit testing, crisp snapping, tool transitions | Phase 0 | IN_PROGRESS |
| M2 | Side Panels IA, Visual Decluttering & Action Bars | Features 12–16: Inspector decluttering, progressive disclosure, layer tree cleanup, design tokens, action bars | M1 | PLANNED |
| M3 | Full Verification, Build & Remote Deployment | Feature 17: Vitest 100%, check-design 0 violations, clean build, deploy to server `la`, live HTTP 200 verification | M2 | PLANNED |
