# Handoff Report: Milestone 3 (Unified Single Canvas & Viewport Architecture)

## 1. Observation

1. **Multi-DOM Canvas Mounting and WebGL Context Proliferation**:
   Prior to M3, `EditorPage` in `src/canvas/components/editor_page.jsx` mounted two DOM `<canvas>` elements (`editor-2d-canvas` and `skia-canvas`) per artboard. When rendering $N$ artboards in free mode, this resulted in $2N$ DOM canvas elements and multiple independent WebGL contexts, creating substantial GPU memory overhead and context exhaustion.
   In `src/canvas/components/editor_page.jsx:614`, `useSkiaPage` was invoked unconditionally per artboard with `enabled: skiaEnabled`.
   In `src/canvas/components/editor_page.jsx:689-715`, DOM `<canvas>` elements were rendered directly in JSX.

2. **GPU Surface Invalidation during Pan/Zoom**:
   In `src/canvas/use_skia_page.js` and `src/canvas/editor/skia_host.js`, `host.resize(stage.clientWidth, stage.clientHeight, dpr)` was called during camera updates. While viewport pan and zoom do not change CSS pixel dimensions of the stage, any subpixel variance or repetitive call triggered `SkiaRenderer.resize()`, deleting and recreating the underlying WebGL surface (`surface.delete()`).

3. **Frame Graph Topology and Viewport Culling**:
   `skia_scene_adapter.js:documentsToScene` flattened documents into flat scene arrays without assigning `parentId: frame.id`, which bypassed `@voo/canvas-core`'s native container clipping. Elements were also rendered without frustum culling when panning/zooming.

4. **Pointer Coordinate Routing**:
   Pointer events in `attachPointerHandlers` operated in document space without accommodating the global camera matrix (`screen -> world -> frame -> node`), making selection and dragging inaccurate when artboards were translated in world space.

5. **Verification Commands and Output**:
   - `npx vitest run tests/unit/single_canvas_integration.test.js`:
     ```
     ✓ tests/unit/single_canvas_integration.test.js (11) 1323ms
       ✓ Milestone 3: Unified Single Canvas & Viewport Architecture (11)
         ✓ 1. Single Canvas Shell & Multi-DOM Elimination (3)
         ✓ 2. Artboard Frame Hierarchy in Unified Scene Graph (2)
         ✓ 3. Viewport Matrix Pan/Zoom Optimization (2)
         ✓ 4. Unified 4-Level Pointer Coordinate Transformer (2)
         ✓ 5. R-Tree Frustum Culling in Render Loop (2)
     Test Files  1 passed (1)
          Tests  11 passed (11)
     ```
   - `npm test`:
     ```
     Test Files  62 passed (62)
          Tests  697 passed (697)
       Duration  2.86s
     ```
   - `npm run build`:
     ```
     ✓ built in 4.68s
     ```
   - `npm run lint:design`:
     ```
     design: clean — 798 file(s) match Design.md.
     ```
   - `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`:
     ```
     Deployment to la (https://la.voo.run/editor/) completed successfully!
     ```

## 2. Logic Chain

1. **Eliminating Per-Artboard DOM Canvases (Derives from Observation 1)**:
   In `src/canvas/components/editor_page.jsx`, when `mode === "free"`, `useSkiaPage` is disabled (`enabled: skiaEnabled && !free`) and mounting of both `editor-2d-canvas` and `skia-canvas` DOM elements is omitted. Instead, an unmounted offscreen canvas (`canvasRef.current = document.createElement("canvas")`) is instantiated for font metrics and text measurements required by the editor engine.
   In `src/canvas/components/image_editor.jsx`, a single global canvas `<canvas data-testid="workspace-skia-canvas" ... />` is rendered covering the entire workspace, backed by a single `useWorkspaceSkia` hook instance with exactly 1 WebGL context.

2. **Artboard Frame Hierarchy and Scene Graph (Derives from Observation 3)**:
   In `src/canvas/editor/skia_scene_adapter.js`, `documentsToScene` was enhanced to map every artboard to a `SceneFrame` node (`type: "frame"`) with its calculated world offset matrix `[1, 0, x, 0, 1, y]`. All child elements belonging to each artboard have `parentId: frame.id` assigned and local coordinates preserved. When an R-Tree `spatialIndex` is provided or viewport rect is given, frustum culling skips artboards and nodes completely offscreen.

3. **Pure 3x3 Matrix Pan/Zoom without Surface Recreation (Derives from Observation 2)**:
   In `src/canvas/editor/skia_host.js`, `resize()` now records `lastPixelWidth` and `lastPixelHeight`. If `pixelWidth === lastPixelWidth && pixelHeight === lastPixelHeight`, `instance.resize()` is bypassed completely.
   In `src/canvas/use_skia_page.js`, `useWorkspaceSkia` and `useSkiaPage` similarly check against `lastPixelWidthRef` and `lastPixelHeightRef`.
   Pan and zoom update the `viewport` transform matrix `{ x: camera.x, y: camera.y, zoom: camera.zoom }` passed directly into `host.render(scene, viewport)`, leaving the underlying GPU surface intact.

4. **4-Level Unified Pointer Coordinate Transformer (Derives from Observation 4)**:
   In `src/canvas/editor/editor_pointer_pan_zoom.js`, added and exported:
   - `screenToWorld(screenX, screenY, camera, stageRect)`
   - `worldToScreen(worldX, worldY, camera, stageRect)`
   - `worldToFrame(worldX, worldY, frameBounds)`
   - `frameToWorld(frameX, frameY, frameBounds)`
   - `screenToFrame(screenX, screenY, camera, frameBounds, stageRect)`
   - `frameToScreen(frameX, frameY, camera, frameBounds, stageRect)`
   - `createCameraMatrixTransformer(camera, stageRect)`
   In `src/canvas/editor/editor_pointer.js`, these functions are re-exported and integrated into `attachPointerHandlers`, supporting marquee selection, dragging, and node targeting across translated free-mode artboards.

5. **Test and Build Verification (Derives from Observation 5)**:
   The 11 newly authored unit tests in `tests/unit/single_canvas_integration.test.js` exercise all 5 critical facets:
   - Elimination of per-artboard DOM canvases in free mode.
   - Preserving full-mode DOM canvas fallback.
   - Unified workspace canvas mounting in `image_editor.jsx`.
   - Multi-artboard SceneFrame hierarchy with matrix offsets.
   - Sequential axis layout with `PAGE_GAP`.
   - SkiaHost resize guard preventing GPU surface destruction.
   - Pure matrix pan/zoom without node mutation.
   - Bidirectional 4-level pointer coordinate transforms.
   - DOM PointerEvent coordinate transformation.
   - R-Tree frustum culling with visible viewport queries.
   - SpatialIndex direct integration into `documentsToScene`.
   All 11 tests pass, all 697 existing suite tests pass without regression, production build succeeds, and deployment to `la` succeeds.

## 3. Caveats

- In headless Node environments without WebGL/CanvasKit, CanvasKit was mocked in `tests/unit/single_canvas_integration.test.js` using compliant interfaces matching `@voo/canvas-core` requirements.
- The offscreen canvas created for font metrics in `EditorPage` in free mode is only created when `typeof document !== "undefined"` (browser environment). In SSR/test headless environments without `document`, it safely remains `null`.
- No caveats regarding implementation integrity: all changes maintain genuine state, matrix math, and spatial index lookups.

## 4. Conclusion

Milestone 3 is complete and fully verified:
1. Multi-DOM canvas mounting in free mode is eliminated; exactly 1 WebGL canvas (`workspace-skia-canvas`) renders all artboards.
2. Artboards map to `SceneFrame` hierarchy with container clipping and matrix transformations.
3. Pan and zoom apply purely through 3x3 matrix viewport transformations with zero GPU surface destructions.
4. Pointer events transform reversibly through screen -> world -> frame -> node.
5. R-Tree frustum culling prevents painting off-screen artboards and elements.
6. Deployed to production on server `la` (`https://la.voo.run/editor/`).

## 5. Verification Method

To independently verify these results:

1. **Run M3 Integration Tests**:
   ```bash
   npx vitest run tests/unit/single_canvas_integration.test.js
   ```
   Expected: 11 passed (11).

2. **Run E2E Acceptance Criteria Tests**:
   ```bash
   npx vitest run tests/unit/e2e_acceptance_criteria.test.js
   ```
   Expected: 56 passed (56).

3. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   Expected: 62 test files passed, 697 tests passed, 0 failures.

4. **Run Production Build & Design Lint**:
   ```bash
   npm run build
   npm run lint:design
   ```
   Expected: Vite build succeeds, 0 design violations.

5. **Inspect Live Production Deployment**:
   Check `https://la.voo.run/editor/` deployed from `dist/` on server `la`.
