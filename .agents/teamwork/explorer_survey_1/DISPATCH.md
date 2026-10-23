# DISPATCH — Explorer Survey 1 (R1: Viewport Culling & Layer Caching)

## Objective
Investigate the existing codebase for Requirement 1: Viewport Culling & Layer Caching.
Specifically explore:
1. `src/canvas/editor/viewport_culling.js`, `src/canvas/editor/spatial_index.js`, and the canvas rendering pipeline (e.g. `src/canvas/editor/`, Skia/WebGL/2D rendering loops).
2. Existing spatial index (R-Tree, BVH, quadtree, etc.) data structures and search interfaces.
3. How viewport bounds are calculated and how layers/nodes are filtered against the viewport during pan/zoom.
4. Handling of visual effects that exceed bounding boxes (blur, drop shadow, stroke widths, clipping masks).
5. Offscreen canvas/layer caching for static layers and unchanged groups during pan or single-layer edits.
6. Identify gaps between current implementation and R1 requirements.
7. Recommend concrete technical design, file boundaries, exports, and implementation steps.

## Reference Files & Documents
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST READ)
- `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/orchestrator_11/DISPATCH.md`
- `src/canvas/editor/viewport_culling.js`
- `src/canvas/editor/spatial_index.js`
- Other related files in `src/canvas/editor/`

## Deliverable
Write your findings to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1/handoff.md` with sections:
- Executive Summary
- Current Codebase Architecture & Code Analysis (with file paths and line numbers)
- Spatial Index & Viewport Culling Mechanics (current vs required)
- Layer Offscreen Caching Mechanics (current vs required)
- Concrete Recommendations & Implementation Roadmap for R1
Update `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1/progress.md` during execution.
Send completion message back to orchestrator.

## 2026-10-21T23:23:26Z
From parent:
You are explorer_survey_1.
Your working directory is /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1.
You MUST read:
1. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
2. /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1/DISPATCH.md

Your task is to explore and analyze the codebase for Requirement 1: Viewport Culling & Layer Caching.
Investigate `src/canvas/editor/viewport_culling.js`, `src/canvas/editor/spatial_index.js`, and the canvas rendering pipeline.
Write your detailed report to /Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_survey_1/handoff.md and update progress.md.
When finished, send a message to the orchestrator (caller) with a concise summary and path to your handoff.md.

