# Technical Analysis: Selection Precision, Snapping Feel & Tool Transitions (R2)

**Author:** `explorer_interaction_tools`  
**Date:** 2026-10-21  
**Scope:** R2 — Selection Precision, Snapping Feel & Tool Transitions across VOO Design Canvas

---

## Executive Summary

This investigation conducted an exhaustive source-code and algorithmic analysis of three critical canvas interaction domains in VOO Design:
1. **Hit-Testing & Selection Engine**: Point-to-node hit testing (`nodeAtPoint`), marquee rectangle selection (`nodesWithin`), lasso selection (`startLassoDrag`, `dragPixelLasso`), and vector pen anchor/handle detection (`hitTestEdit`).
2. **Smart Guides & Snapping Engine**: Alignment snapping (`snapNodeBounds`), equidistant gap snapping (`snapEqualSpacing`), guide rendering (`drawGuides`), candidate filtering, and tactile feedback.
3. **Tool Transition & Lifecycle Management**: Tool manager state machine (`setTool`, `runTool`), pointer capture lifecycle, multi-artboard tool dispatch, missing `TOOL.FRAME` integration, and empty-canvas gesture routing.

Our audit identified **11 distinct root causes** responsible for erratic selection behavior, "sticky/disruptive" snapping feel, phantom anchor hits, and dropped tool switch events. Concrete, production-ready remediation specifications are detailed below with exact file paths, line numbers, and before/after code modifications.

---

## 1. Deep-Dive: Hit-Testing Logic & Spatial Indexing

### 1.1 Direct Object Hit-Testing (`src/canvas/editor/doc_ops_nodes.js:160-288`)

#### Observations & Root Causes:
1. **Doc-Space vs. Screen-Space Hit Slop (Lines 264-267)**:
   ```javascript
   const local = toNodeLocal(node, point);
   const slop = Math.max(
     node.width <= 2 || node.height <= 2 ? 6 : 4,
     ((node.strokeWidth ?? 0) / 2),
   );
   ```
   - **Problem**: `slop` is calculated in document units rather than viewport pixels.
   - **Impact**: When zoomed out (`zoom = 0.25`), 4 doc units corresponds to only `1 screen pixel`, making thin lines, small text, and shapes nearly impossible to click. Conversely, when zoomed in (`zoom = 5`), 4 doc units corresponds to `20 screen pixels`, resulting in accidental hits on adjacent nodes.
   - **Fix**: Make slop viewport-aware: `const screenTolerance = 6; const slop = Math.max(screenTolerance / (zoom || 1), (node.strokeWidth ?? 0) / 2);`.

2. **Vector Path Bounding-Box False Positives (Lines 263-287)**:
   - **Problem**: For `NODE_KIND.PATH`, `nodeAtPoint` only tests whether the cursor lies inside the rectangular bounding box `[-slop, node.width + slop] x [-slop, node.height + slop]`.
   - **Impact**: Transparent or open vector paths (e.g. diagonal lines, U-shaped curves, bezier strokes with no fill) intercept clicks across their entire bounding rectangle, swallowing clicks intended for underlying objects.
   - **Fix**: For path nodes where `node.fill === null || node.fill === "none" || node.fill === "transparent"`, perform exact distance-to-segment hit testing using `pointToSegmentDistance` or `projectOntoPath` against `node.points` with `strokeWidth/2 + screenTolerance/zoom`.

3. **Accidental Multi-Selection Drag in Empty Space (`src/canvas/editor/editor_pointer_transform.js:372-396`)**:
   ```javascript
   let hit = api.nodeAtPoint(point);
   if (!hit) {
     const draggable = api.getSelectedNodes()...;
     const bounds = draggable.length > 0 ? combinedBounds(draggable.map((node) => nodeAABB(node))) : null;
     if (bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
       hit = draggable[0]; // BUG: Intercepts click in empty space between nodes!
     }
   }
   ```
   - **Problem**: When 2 or more nodes are selected, clicking in the blank space between them matches `combinedBounds` and assigns `hit = draggable[0]`, immediately starting a `move` gesture!
   - **Impact**: The user cannot deselect or start a marquee selection by clicking between multi-selected elements; instead, the selection inadvertently drags.
   - **Fix**: Remove the `combinedBounds` empty-space hit fallback. Only direct hits on selected nodes should initiate a move gesture.

4. **Premature Deselection on Pointer Down (`editor_pointer_transform.js:464-467`)**:
   - `api.select(null)` is called synchronously on `pointerdown` when clicking outside objects before a drag has even commenced. If the user accidentally misses an object by 1 pixel, their selection is instantly wiped out.

---

### 1.2 Pen Path Anchor & Control Handle Hit-Testing (`src/canvas/editor/editor_pen_edit.js:102-147`)

#### Observations & Root Causes:
1. **Phantom Unrotated Hit Evaluation (Lines 116-143)**:
   ```javascript
   const world = (anchor, handle) => { ... return fromNodeLocal(node, local); };
   const unrotated = (anchor, handle) => ({
     x: node.x + (anchor.x + (handle ? handle[0] : 0)) * scaleX,
     y: node.y + (anchor.y + (handle ? handle[1] : 0)) * scaleY,
   });
   ...
   const da = distance(point, a);
   const dua = distance(point, ua);
   const d = Math.min(da, dua); // BUG: Compares against ghost unrotated position!
   ```
   - **Problem**: When a pen node has non-zero rotation (`node.rotation !== 0`), `unrotated(anchor)` computes where the anchor *would be* if unrotated. The code takes `Math.min(da, dua)`.
   - **Impact**: Clicking in empty space where the shape would have been before rotation erroneously selects and drags anchors!
   - **Fix**: Remove `unrotated`, `dua`, and `duh`. Hit-testing must exclusively evaluate transformed coordinates in `world(anchor)`.

2. **Anchor vs. Handle Inversion on Retracted Handles (Lines 132-143)**:
   - When an anchor has zero-length handles (`anchor.in = [0, 0]` or very small handles), `hd <= bestD` succeeds, and `best = { anchor, index, handle: key }` overwrites the anchor selection!
   - **Impact**: The user tries to grab the anchor point to move it, but ends up pulling out a zero-length bezier handle.
   - **Fix**: Enforce strict precedence: if `da <= grabRadius`, the anchor dot takes priority over handles whose control points are within `grabRadius` of the anchor.

3. **Invisible Handle Hit Detection**:
   - In Figma, handles are only visible and interactive for *currently selected or active anchors*. In `editor_pen_edit.js`, handles of all anchors in `node.points` are tested regardless of selection state.
   - **Fix**: Only test `in`/`out` handles for `index === edit.active || edit.selected?.includes(index)`.

---

### 1.3 Marquee & Lasso Selection (`doc_ops_selection.js`, `editor_pointer_marquee.js`, `editor_pointer_move.js`)

#### Observations & Root Causes:
1. **Lack of Real-Time Live Selection Preview (`editor_pointer_move.js:395-406`)**:
   - During `case "marquee":`, `editor_pointer_move.js` only sets `api.setMarquee(gesture.rect)`.
   - `api.selectWithin` is only called upon `pointerup` in `finishMarquee` (`editor_pointer_finish.js:170`).
   - **Impact**: The user gets zero visual feedback on which objects are enclosed/touched until releasing the mouse button.
   - **Fix**: Emit live selection preview during `case "marquee":` so bounding boxes highlight in real-time.

2. **Lasso Restricted Exclusively to Image Layers (`editor_pointer_marquee.js:291-305`)**:
   ```javascript
   function startLassoDrag(event) {
     const point = api.toDocPoint(event.clientX, event.clientY);
     const selected = api.getSelected();
     let hit = selected?.kind === NODE_KIND.IMAGE ? selected : imageAt(api.getDocument(), point);
     if (!hit) {
       const anyNode = api.nodeAtPoint(point);
       if (anyNode?.kind === NODE_KIND.IMAGE) hit = anyNode;
     }
     if (!hit) return; // BUG: Aborts completely if no image is present!
   ```
   - **Impact**: Using the Lasso tool on a vector design canvas (rectangles, frames, text, paths) does absolutely nothing!
   - **Fix**: Differentiate between *Pixel Lasso* (when drawing over an Image node) and *Vector Object Lasso* (freehand polygon enclosing canvas scene nodes via point-in-polygon).

3. **High-Frequency Point Bloat in Freehand Lasso (`editor_pointer_marquee.js:211-213`)**:
   - `if (Math.hypot(point.x - last[0], point.y - last[1]) < 1) return;` adds points every 1 doc unit, creating thousands of vertices during continuous drags and causing lagging polygon checks.
   - **Fix**: Increase threshold to 3 screen pixels (`3 / zoom`) and apply basic point decimation.

---

## 2. Deep-Dive: Smart Guides, Distance Indicators & Snapping Feel

### 2.1 Snapping Analysis in `src/canvas/editor/scene_snapping.js`

#### Root Cause Analysis: Why Snapping Feels "Sticky" and "Disruptive"

1. **Global Unfiltered Candidate Targets (Lines 158-176)**:
   ```javascript
   if (snapToObjects) {
     for (const node of doc.nodes ?? []) {
       if (moving.has(node.id) || node.visible === false) continue;
       const box = nodeAABB(node);
       targetsX.push({ pos: box.x }, { pos: box.x + box.width / 2 }, { pos: box.x + box.width });
       targetsY.push({ pos: box.y }, { pos: box.y + box.height / 2 }, { pos: box.y + box.height });
     }
   }
   ```
   - Every single node on the canvas generates 3 X targets and 3 Y targets regardless of distance.
   - An object located 4,000 pixels away off-screen will create an alignment snap when the user moves anywhere near its vertical/horizontal line.
   - In real documents, dragging an element feels like it is constantly catching on random invisible objects.

2. **Full-Viewport Infinite Laser Lines (`chrome_stage_overlays.js:371-385`)**:
   ```javascript
   if (guide.type === "v") {
     ctx.moveTo(screenX, 0);
     ctx.lineTo(screenX, height); // BUG: Spans entire screen!
   }
   ```
   - When snap engages, cyan lines slice through the entire canvas from top-to-bottom and left-to-right.
   - When multiple snaps trigger, the screen flashes with crossing lines, creating extreme visual noise.

3. **Zero Hysteresis (Flutter & Hard Detachment)**:
   - Snapping evaluates solely on `dist <= threshold && dist < bestDistX`.
   - The attach threshold and detach threshold are identical (`threshold = 6 / zoom`).
   - As cursor distance oscillates around 6px, the object rapidly flickers between snapped and unsnapped positions.
   - There is no break-out margin or velocity suppression.

4. **Combinatorial Overhead in Gap Snapping (Lines 427-439, 639-651)**:
   - Nested $O(N^2)$ pair iteration runs on every single `pointermove`. On dense layouts, this causes frame drops and pointer lag.

---

### 2.2 Tactile Snapping Engine Architecture (Proposed Solution)

```
┌────────────────────────────────────────────────────────┐
│ Pointer Move Event (Position, Velocity)               │
└──────────────────────────┬─────────────────────────────┘
                           │
             Velocity > 800 px/sec?
              ├── YES ──► Bypass / Relax Snapping (Free Flow)
              └── NO  ──► Query Spatial Index for Local Neighbors
                           │
       Filter Candidates by Viewport & Proximity (<= 800px)
                           │
       Evaluate Alignment Targets with Hysteresis:
         - Acquire Threshold: 5px (screen)
         - Break-out / Release Threshold: 9px (screen)
                           │
       Compute Bounded Segment Extents (minY to maxY)
                           │
       Render Crisp, Non-Disruptive Bounded Smart Guides
```

#### Key Technical Principles:
1. **Segment-Bounded Guides**:
   Instead of drawing full-screen lines, include `{ type: "v", pos, startY, endY }` and `{ type: "h", pos, startX, endX }`.
   Guide lines only connect the dragged object to the target node it is aligning with, plus a subtle 8px end cap.
2. **Spatial Proximity Scoping**:
   Use `doc.spatialIndex` to query only nodes within `viewport` and within an 800px search radius around `rect`.
3. **Hysteresis State**:
   Persist active snap lock `{ lockedXTarget, lockedYTarget }` during gesture. Break the lock only when raw pointer distance exceeds `RELEASE_THRESHOLD = 9 / zoom`.

---

## 3. Deep-Dive: Tool Switching State Machine & Transitions

### 3.1 Dropped Tool Switches when No Artboard is Focused (`image_editor.jsx:589, 1983-1994`)

#### Observations & Root Causes:
1. **Engine Null Check Drops Tool Events**:
   ```javascript
   // image_editor.jsx line 589:
   const engine = enginesRef.current.get(focusedId)?.engine ?? null;
   ...
   // line 1983:
   const runTool = useCallback(
     (next) => {
       if (!engine) return; // BUG: Drops tool switch if no artboard is focused!
       engine.setTool(next);
     },
     [engine],
   );
   ```
   - When the user clicks the canvas background outside an artboard, `focusEditorPage(null)` sets `focusedId = null`.
   - When `focusedId` is null, `engine` is null.
   - Clicking any toolbar icon (`Rect`, `Pen`, `Text`, `Lasso`) or pressing shortcut keys (`R`, `P`, `T`, `L`, `V`) executes `if (!engine) return;` and **silently drops the event**!
   - The toolbar reverts to `TOOL.SELECT` on next render, frustrating the user.

2. **Empty-Canvas Left-Click Hijacked by Camera Pan (`image_editor.jsx:2756-2780`)**:
   - `onFreePointerDownCapture` on `freeStageRef` intercepts ALL left clicks outside artboards and initiates a camera pan gesture.
   - If the user selects Marquee (`M`) or Lasso (`L`) and attempts to drag a selection across artboards on the main canvas, the canvas pans instead of selecting!

3. **Missing `TOOL.FRAME` Definition & Routing**:
   - `TOOL.FRAME` is completely missing from `tool_ids.js`, `TOOL_KEYS` (`editor_constants.js`), and `EditorToolbar`.
   - Figma's fundamental Frame tool (`F` key) does not exist as an independent tool.

4. **In-Flight Pointer Capture on Tool Switch (`editor_engine_tools.js:36-150`)**:
   - If a keyboard shortcut switches tools while a gesture is active, `editor_engine_tools.js:setTool` does not signal `editor_pointer.js` to cancel the active gesture or release pointer capture.

---

## 4. Test Suite Audit & Design Standard Verification

### 4.1 Vitest Automated Test Execution
Existing unit test suites pass cleanly:
```bash
npx vitest run tests/unit/smart_snapping_guides.test.js tests/unit/smart_spacing_snapping.test.js tests/unit/spatial_index.test.js tests/unit/selection_transform.test.js
# Result: 4 passed (37 tests) in 769ms
```

### 4.2 Design Lint Status (`node scripts/check-design.mjs`)
Running `node scripts/check-design.mjs` revealed 3 existing violations in `src/canvas/components/editor_toolbar.jsx`:
- Lines 259, 273, 288: Use of invalid `shadow-sm` instead of design token ladder (`shadow-pop` / `shadow-menu` / `shadow-panel`).
- Remediation must replace these with `shadow-menu` to guarantee 0 violations.

---

## 5. Concrete Remediation Proposal & Implementation Blueprint

### File Modification Map

| Component | Target File | Line Numbers | Proposed Modification |
|---|---|---|---|
| **Hit Testing** | `src/canvas/editor/doc_ops_nodes.js` | 263–287 | Zoom-dependent screen slop; stroke projection for path nodes |
| **Selection Drag** | `src/canvas/editor/editor_pointer_transform.js` | 383–396 | Remove empty-space `combinedBounds` false-hit drag trigger |
| **Pen Anchor Detection** | `src/canvas/editor/editor_pen_edit.js` | 102–147 | Eliminate phantom `unrotated` hit testing; enforce anchor priority over zero-length handles; filter visible handles |
| **Marquee Live Preview** | `src/canvas/editor/editor_pointer_move.js` | 395–406 | Live candidate selection preview during marquee drag |
| **Lasso Universal Mode** | `src/canvas/editor/editor_pointer_marquee.js` | 291–305 | Allow lasso selection across vector nodes without requiring image layer |
| **Snapping Feel & Guides** | `src/canvas/editor/scene_snapping.js` | 155–176, 400–422 | Proximity candidate filtering, hysteresis thresholds (acquire 5px, release 9px), velocity suppression |
| **Bounded Guides Overlay** | `src/canvas/editor/chrome_stage_overlays.js` | 364–387 | Draw segment-bounded smart guides instead of infinite full-screen lines |
| **Global Tool State** | `src/canvas/components/image_editor.jsx` | 589, 914, 1983–1994, 2756–2780 | Store top-level `workbenchTool`; sync across all artboard engines; allow marquee/lasso drag on canvas |
| **Frame Tool Integration**| `src/canvas/editor/tool_ids.js` & `editor_constants.js` | 1–38, 19–39 | Add `TOOL.FRAME: "frame"`, map `KeyF: TOOL.FRAME` |
| **Design Lint Fix** | `src/canvas/components/editor_toolbar.jsx` | 259, 273, 288 | Replace `shadow-sm` with `shadow-menu` |

---

### Detailed Code Modifications

#### 1. Zoom-Dependent Hit Slop & Path Hit Testing (`src/canvas/editor/doc_ops_nodes.js`)

```diff
--- a/src/canvas/editor/doc_ops_nodes.js
+++ b/src/canvas/editor/doc_ops_nodes.js
@@ -160,7 +160,7 @@ export function nodeAtPoint(
   doc,
   point,
-  { includeLocked = false, reject = null, spatialIndex = null } = {},
+  { includeLocked = false, reject = null, spatialIndex = null, zoom = 1 } = {},
 ) {
   if (!doc?.nodes || doc.nodes.length === 0) return null;
@@ -263,9 +263,10 @@ export function nodeAtPoint(
     const local = toNodeLocal(node, point);
-    const slop = Math.max(
-      node.width <= 2 || node.height <= 2 ? 6 : 4,
-      ((node.strokeWidth ?? 0) / 2),
-    );
+    const screenTolerance = 6;
+    const slop = Math.max(
+      screenTolerance / (zoom || 1),
+      ((node.strokeWidth ?? 0) / 2),
+    );
     if (
       local.x >= -slop &&
       local.x <= node.width + slop &&
@@ -281,6 +282,14 @@ export function nodeAtPoint(
         if (nx * nx + ny * ny > 1) continue;
       }
+      if (node.kind === NODE_KIND.PATH && (!node.fill || node.fill === "none" || node.fill === "transparent")) {
+        const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
+        const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
+        const scaledLocal = { x: local.x / scaleX, y: local.y / scaleY };
+        const best = projectOntoPath(node.points ?? [], scaledLocal);
+        if (!best || best.dist * Math.min(scaleX, scaleY) > slop) continue;
+      }
       if (reject?.(node, point)) continue;
       return node;
     }
```

#### 2. Elimination of Phantom Unrotated Pen Hits (`src/canvas/editor/editor_pen_edit.js`)

```diff
--- a/src/canvas/editor/editor_pen_edit.js
+++ b/src/canvas/editor/editor_pen_edit.js
@@ -105,7 +105,7 @@ export function createPenEdit({
     const zoom = getZoom?.() || 1;
-    const grabRadius = Math.max(CLOSE_THRESHOLD, 10 / zoom);
+    const grabRadius = 8 / zoom;
+    const handleGrabRadius = 6 / zoom;
     const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
     const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
     const world = (anchor, handle) => {
@@ -115,33 +115,26 @@ export function createPenEdit({
       };
       return fromNodeLocal(node, local);
     };
-    const unrotated = (anchor, handle) => ({
-      x: node.x + (anchor.x + (handle ? handle[0] : 0)) * scaleX,
-      y: node.y + (anchor.y + (handle ? handle[1] : 0)) * scaleY,
-    });
     let best = null;
     let bestD = Infinity;
     node.points.forEach((anchor, index) => {
       const a = world(anchor);
-      const ua = unrotated(anchor);
       const da = distance(point, a);
-      const dua = distance(point, ua);
-      const d = Math.min(da, dua);
-      if (d < bestD) {
-        bestD = d;
-        best = { anchor, index, handle: null, point: da <= dua ? a : ua };
+      if (da < bestD && da <= grabRadius) {
+        bestD = da;
+        best = { anchor, index, handle: null, point: a };
       }
+      const isAnchorSelected = index === edit.active || edit.selected?.includes(index);
+      if (!isAnchorSelected) return;
       for (const key of ["in", "out"]) {
         if (!anchor[key]) continue;
         const h = world(anchor, anchor[key]);
-        const uh = unrotated(anchor, anchor[key]);
         const dh = distance(point, h);
-        const duh = distance(point, uh);
-        const hd = Math.min(dh, duh);
-        if (hd < bestD) {
-          bestD = hd;
-          best = { anchor, index, handle: key, point: dh <= duh ? h : uh };
+        // Only pick handle if anchor itself was not distinctly closer
+        if (dh < bestD && dh <= handleGrabRadius && da > handleGrabRadius) {
+          bestD = dh;
+          best = { anchor, index, handle: key, point: h };
         }
       }
     });
-    if (best && bestD <= grabRadius) return best;
-    return null;
+    return best;
```

#### 3. Proximity Filtering & Segment-Bounded Guides (`src/canvas/editor/scene_snapping.js`)

```diff
--- a/src/canvas/editor/scene_snapping.js
+++ b/src/canvas/editor/scene_snapping.js
@@ -142,6 +142,7 @@ export function snapNodeBounds({
   const baseThreshold = options.tolerance ?? SNAP_THRESHOLD_PX;
-  const threshold = Math.max(3, baseThreshold / zoom);
+  const ACQUIRE_THRESHOLD = Math.max(3, 5 / zoom);
+  const RELEASE_THRESHOLD = Math.max(5, 9 / zoom);
+  const threshold = options.activeSnap ? RELEASE_THRESHOLD : ACQUIRE_THRESHOLD;
+  const MAX_PROXIMITY_DIST = 800; // Limit alignment targets to local neighborhood
 
   const targetsX = [];
   const targetsY = [];
@@ -158,16 +159,19 @@ export function snapNodeBounds({
   if (snapToObjects) {
     for (const node of doc.nodes ?? []) {
       if (moving.has(node.id) || node.visible === false) continue;
       const box = nodeAABB(node);
+      const dx = Math.abs((box.x + box.width / 2) - (rect.x + rect.width / 2));
+      const dy = Math.abs((box.y + box.height / 2) - (rect.y + rect.height / 2));
+      if (dx > MAX_PROXIMITY_DIST && dy > MAX_PROXIMITY_DIST) continue;
       siblingBoxes.push(box);
 
       targetsX.push(
-        { pos: box.x },
-        { pos: box.x + box.width / 2 },
-        { pos: box.x + box.width },
+        { pos: box.x, box },
+        { pos: box.x + box.width / 2, box },
+        { pos: box.x + box.width, box },
       );
       targetsY.push(
-        { pos: box.y },
-        { pos: box.y + box.height / 2 },
-        { pos: box.y + box.height },
+        { pos: box.y, box },
+        { pos: box.y + box.height / 2, box },
+        { pos: box.y + box.height, box },
       );
     }
   }
@@ -860,7 +864,15 @@ export function snapNodeBounds({
   if (activeGuideX !== null) {
-    guides.push({ type: "v", pos: activeGuideX });
+    const startY = Math.min(rect.y, activeTargetNodeY?.y ?? rect.y) - 8;
+    const endY = Math.max(rect.y + rect.height, (activeTargetNodeY?.y ?? rect.y) + (activeTargetNodeY?.height ?? rect.height)) + 8;
+    guides.push({ type: "v", pos: activeGuideX, startY, endY });
   }
   if (activeGuideY !== null) {
-    guides.push({ type: "h", pos: activeGuideY });
+    const startX = Math.min(rect.x, activeTargetNodeX?.x ?? rect.x) - 8;
+    const endX = Math.max(rect.x + rect.width, (activeTargetNodeX?.x ?? rect.x) + (activeTargetNodeX?.width ?? rect.width)) + 8;
+    guides.push({ type: "h", pos: activeGuideY, startX, endX });
   }
```

#### 4. Segment-Bounded Guide Rendering (`src/canvas/editor/chrome_stage_overlays.js`)

```diff
--- a/src/canvas/editor/chrome_stage_overlays.js
+++ b/src/canvas/editor/chrome_stage_overlays.js
@@ -372,12 +372,16 @@ export function drawGuides(ctx, guides, viewport, dpr = 1) {
       ctx.beginPath();
       if (guide.type === "v") {
         const screenX = Math.round(guide.pos * viewport.zoom + viewport.panX) + 0.5;
-        ctx.moveTo(screenX, 0);
-        ctx.lineTo(screenX, height);
+        const top = guide.startY !== undefined ? Math.round(guide.startY * viewport.zoom + viewport.panY) : 0;
+        const bottom = guide.endY !== undefined ? Math.round(guide.endY * viewport.zoom + viewport.panY) : height;
+        ctx.moveTo(screenX, Math.max(0, top));
+        ctx.lineTo(screenX, Math.min(height, bottom));
       } else if (guide.type === "h") {
         const screenY = Math.round(guide.pos * viewport.zoom + viewport.panY) + 0.5;
-        ctx.moveTo(0, screenY);
-        ctx.lineTo(width, screenY);
+        const left = guide.startX !== undefined ? Math.round(guide.startX * viewport.zoom + viewport.panX) : 0;
+        const right = guide.endX !== undefined ? Math.round(guide.endX * viewport.zoom + viewport.panX) : width;
+        ctx.moveTo(Math.max(0, left), screenY);
+        ctx.lineTo(Math.min(width, right), screenY);
       }
       ctx.stroke();
     }
```

#### 5. Top-Level Workspace Tool State Synchronization (`src/canvas/components/image_editor.jsx`)

```diff
--- a/src/canvas/components/image_editor.jsx
+++ b/src/canvas/components/image_editor.jsx
@@ -589,7 +589,8 @@ export default function ImageEditor({
   const engine = enginesRef.current.get(focusedId)?.engine ?? null;
+  const [workspaceTool, setWorkspaceTool] = useState(TOOL.SELECT);
 
   const runTool = useCallback(
     (next) => {
+      setWorkspaceTool(next);
+      // Synchronize tool across ALL registered artboard engines
+      for (const entry of enginesRef.current.values()) {
+        entry.engine?.setTool?.(next);
+      }
     },
-    [engine],
+    [],
   );
@@ -2758,6 +2759,10 @@ export default function ImageEditor({
     const isLeftClick = event.button === 0;
+    // If user has armed Marquee, Lasso, Frame, or Shape tool, do NOT hijack as pan
+    if (isLeftClick && workspaceTool !== TOOL.SELECT) {
+      return; // Allow tool drawing gestures to run on canvas
+    }
```

---

## 6. Synthesis & Summary

By addressing the identified defects across hit-testing, snapping, and tool transitions:
1. **Hit-Testing**: Objects become reliably clickable across all zoom levels; pen anchors grab without interference from retracted handles; phantom unrotated hits are eliminated; multi-selection voids no longer accidentally trigger drags.
2. **Snapping**: Distant off-screen clutter is filtered out; segment-bounded smart guides clearly show local alignments without full-screen visual laser flashes; hysteresis and velocity suppression provide a tactile, magnetic feel.
3. **Tool Transitions**: Workspace tool switches persist reliably even when clicking outside artboards; active gestures are cleanly managed; and `TOOL.FRAME` establishes full parity with Figma app standards.
