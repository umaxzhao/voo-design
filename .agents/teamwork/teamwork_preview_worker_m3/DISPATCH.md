# Dispatch for Worker M3 (Unified Single Canvas & Viewport Architecture)

## Mission
Implement Milestone 3 (M3) of the VOO Design single-canvas and streaming import project.
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m3`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Mandatory Reading
1. Authoritative user request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. Explorer 2 handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_explorer_survey_2/handoff.md`
4. Worker M1 handoff: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m1/handoff.md`
5. E2E Test Suite Ready: `/Users/tt/teamwork_projects/voo_design/TEST_READY.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership
You exclusively own and may modify or create the following files:
- `src/canvas/components/image_editor.jsx`
- `src/canvas/components/editor_page.jsx`
- `src/canvas/editor/skia_host.js`
- `src/canvas/editor/skia_scene_adapter.js`
- `src/canvas/use_skia_page.js`
- `src/canvas/editor/editor_pointer.js`
- `src/canvas/editor/editor_pointer_pan_zoom.js`
- `tests/unit/single_canvas_integration.test.js`

Do NOT edit any files outside this list.

## Implementation Details
1. **Single Canvas Shell & Multi-DOM Elimination (`image_editor.jsx`, `editor_page.jsx`)**:
   - In `image_editor.jsx`, render a single global workspace `<canvas data-testid="workspace-skia-canvas">` covering the entire viewport backed by `@voo/canvas-core` (`SkiaRenderer`), allocating exactly 1 WebGL context for the workspace.
   - For multi-artboard free mode, eliminate the mounting of multiple DOM `<canvas>` elements across `$N$` artboards.
2. **Artboard Frame Hierarchy in Unified Scene (`skia_scene_adapter.js`)**:
   - Leverage `documentsToScene(docs, { ... })` to map all artboards into top-level `kind: "frame"` elements (`SceneFrame`) with their world-space offsets and dimensions (`doc.width`, `doc.height`, `clipContent: true`).
3. **Viewport Matrix Pan/Zoom Optimization (`skia_host.js`, `use_skia_page.js`)**:
   - Apply workspace pan and zoom directly to the Skia viewport matrix (`viewport: { panX, panY, zoom }`).
   - Do NOT call `resize()` or `recreateSurface()` during camera pan/zoom; only resize the Skia surface when the browser window / viewport container dimensions change.
4. **Unified Pointer Coordinate Transformer (`editor_pointer.js`, `editor_pointer_pan_zoom.js`)**:
   - Map pointer events from single canvas screen coordinates -> camera viewport:
     `worldX = (screenX - panX) / zoom; worldY = (screenY - panY) / zoom`.
   - Forward events seamlessly to active artboards, selection handles, marquee selection, and dragging gizmos.
5. **Frustum Culling in Render Loop**:
   - Query the spatial index (`SpatialIndex`) with `visibleWorldRect` so that Skia `drawSceneElements` only paints visible frames and elements.
6. **Interaction Regression Protection**:
   - Maintain 100% functionality for element selection, multi-selection, drag/transform, properties inspector editing, and artboard switching.
7. **Verification**:
   - Write integration tests in `tests/unit/single_canvas_integration.test.js`.
   - Run `npm test` and ensure all test suites pass.
   - Run `npm run build` and ensure production build succeeds.

## Output
Write your handoff report to:
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m3/handoff.md`
Report back via `send_message` when done.


## 2026-10-20T22:24:08Z
You are Worker M3 (Unified Single Canvas & Viewport Architecture).
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m3
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY FIRST STEP:
Read the authoritative user request at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
Also read your complete dispatch at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_m3/DISPATCH.md
And read the project blueprint:
/Users/tt/teamwork_projects/voo_design/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
Implement Milestone 3 (M3):
1. In src/canvas/components/image_editor.jsx and editor_page.jsx, eliminate the mounting of multiple DOM <canvas> elements per artboard in free mode, rendering a single unified workspace canvas backed by @voo/canvas-core with 1 WebGL context.
2. In src/canvas/editor/skia_scene_adapter.js and use_skia_page.js, map all artboards to top-level SceneFrame elements with matrix transforms and viewport clipping.
3. Drive camera pan/zoom purely through 3x3 matrix transforms in Skia viewport without recreating GPU surfaces.
4. Route pointer events through the camera matrix transformer (screen -> world -> frame -> node) so selection, marquee, dragging, and inspector editing remain fully functional.
5. Connect R-Tree frustum culling so Skia only paints elements intersecting the visible viewport.
6. Write integration tests in tests/unit/single_canvas_integration.test.js.
7. Run `npm test` and `npm run build` to verify all tests pass and production build succeeds.
8. Write handoff.md and send message back to orchestrator.


## 2026-10-21T00:16:14Z
**Context**: Token quota has recovered and system is reconnected.
**Content**: Please resume execution of Milestone 3 (Unified Single Canvas & Viewport Architecture).
**Action**: Implement single canvas host, frame hierarchy, viewport matrix transforms, and pointer routing. Verify with `npm test` and `npm run build`, write handoff.md, and report back when complete.
