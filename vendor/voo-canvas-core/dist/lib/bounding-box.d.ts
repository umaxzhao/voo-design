export interface BBox {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Point2D {
    x: number;
    y: number;
}
export interface BBoxItem {
    x: number;
    y: number;
    w: number;
    h?: number | null;
}
export declare function computeBoundingBox(items: readonly BBoxItem[], defaultH?: number): BBox | null;
export declare function inflateBox(box: BBox, pad: number): BBox;
/**
 * Axis-aligned bounding-box intersection test. Returns true when the two
 * rectangles share any area (including a 1-pixel overlap).
 *
 * Touch-only edges (right edge of `a` exactly at left edge of `b`) are
 * **not** counted as overlap — the comparison is strict inequality on
 * both axes. This matches the typical "is any visible area shared"
 * intent: a frame whose right edge lines up with the viewport's left
 * edge isn't really visible.
 *
 * Use for:
 *   - "is any node visible in the current viewport" (useCanvasAutoFit
 *     pattern from voo-create — restore zoom-to-fit when saved viewport
 *     lands on empty space)
 *   - lasso selection bbox intersection
 *   - frame-overlap detection for layout heuristics
 *
 * The helper is symmetric: `rectsOverlap(a, b) === rectsOverlap(b, a)`.
 */
export declare function rectsOverlap(a: BBox, b: BBox): boolean;
/**
 * True when a box has no area (w or h is 0 or negative).
 *
 * Use as an **explicit gate before `rectsOverlap`** — the overlap
 * predicate uses strict inequalities, so a 0×0 rect positioned inside
 * a larger rect would still test as "overlapping" (every inequality
 * becomes `something < something_larger`). Most callers actually mean
 * "this collapsed selection covers nothing", which needs the empty
 * check up front:
 *
 *   if (rectIsEmpty(viewport)) return false;
 *   return items.some((it) => rectsOverlap(viewport, it));
 *
 * Defensive against NaN: a non-finite dimension is treated as empty.
 */
export declare function rectIsEmpty(rect: BBox): boolean;
/**
 * Derive the axis-aligned bounding box of an arbitrary list of 2-D
 * points (polygon vertices, freehand lasso path, etc.).
 *
 * `computeBoundingBox` takes `BBoxItem[]` (each entry HAS a w/h);
 * `bboxFromPoints` takes raw `Point2D[]` (no extent) — different
 * inputs, both ways to land on a `BBox`.
 *
 *   bboxFromPoints([{x:0,y:0},{x:5,y:3},{x:2,y:8}])
 *     → { x:0, y:0, w:5, h:8 }
 *
 *   bboxFromPoints([{x:3,y:7}])
 *     → { x:3, y:7, w:0, h:0 }       (single point — degenerate empty)
 *
 *   bboxFromPoints([])               → null
 *
 * Returns `null` for an empty list — callers should special-case that
 * (typically "nothing selected / no path yet"). NaN coordinates
 * propagate through min/max naturally and yield a non-finite box;
 * pair with `rectIsEmpty` if you want to gate.
 *
 * Use cases:
 *   - lasso freehand: compute the bbox of the stroke path so we can
 *     fast-reject items that fall outside it BEFORE running the
 *     expensive `pointInPolygon` test on each one
 *   - polygon / star shape: compute initial bbox after vertex edit
 *   - asset crop tool: bbox of selected corner-handle positions
 */
export declare function bboxFromPoints(pts: readonly Point2D[]): BBox | null;
/**
 * Center point of a BBox.
 *
 *   centerOf({x:0,y:0,w:10,h:20}) → {x:5, y:10}
 *
 * Use cases:
 *   - rotate gizmo anchor (rotate around frame center)
 *   - "fit to viewport" — compute viewport pan-to to centerOf(selection)
 *   - AI variation planet layout — radial positions around centerOf(source)
 *   - radial / pie menu center
 */
export declare function centerOf(rect: BBox): Point2D;
/**
 * Area of a BBox. Returns 0 when w or h is 0 (or negative — defensive
 * against malformed inputs from corrupt store state).
 *
 *   rectArea({x:0,y:0,w:10,h:20}) → 200
 *   rectArea({x:0,y:0,w:0,h:20})  → 0
 *
 * Use cases:
 *   - smart-align overlap volume (which sibling overlaps most?)
 *   - lasso bbox area vs selection — discard near-zero accidental clicks
 */
export declare function rectArea(rect: BBox): number;
/**
 * Intersection of two BBoxes, or `null` when disjoint.
 *
 * Returns `null` for zero-overlap (edge-touching counts as disjoint —
 * matches `rectsOverlap` strict-inequality semantics: a frame whose
 * right edge lines up with another's left edge has no shared area).
 *
 *   intersectRect({x:0,y:0,w:10,h:10}, {x:5,y:5,w:10,h:10})
 *     → {x:5,y:5,w:5,h:5}
 *   intersectRect({x:0,y:0,w:10,h:10}, {x:20,y:0,w:10,h:10})
 *     → null
 *
 * Use cases:
 *   - clip a node's draw region to the visible viewport
 *   - compute which portion of a lasso rect actually overlaps the
 *     selected items (for the "how much to scroll" calculation)
 *   - frame-in-frame layout: how much of the child remains visible
 *     when dragged outside the parent
 */
export declare function intersectRect(a: BBox, b: BBox): BBox | null;
/**
 * Shortest Euclidean distance between two BBoxes. Overlapping or
 * edge-touching rects return `0`.
 *
 *   distanceBetweenRects(a, b)
 *
 * Distinct from `vector.distance(p1, p2)` (point-to-point) — this one
 * is rect-to-rect, accounting for the case where the nearest edge
 * pair isn't the centers.
 *
 * Use cases:
 *   - Figma-style "Alt-hover" measure overlay between two objects
 *   - smart-snap proximity: snap when nearest edges are within N px
 *   - collab cursor proximity hints
 */
export declare function distanceBetweenRects(a: BBox, b: BBox): number;
/**
 * True when `outer` fully encloses `inner` — every point of `inner`
 * lies inside or on the boundary of `outer`.
 *
 * Boundary-inclusive on all four sides, matching Figma's "contain"
 * lasso mode where an item touching the selection edge still counts
 * as selected.
 *
 *   containsBBox({x:0,y:0,w:100,h:100}, {x:10,y:10,w:50,h:50})   → true
 *   containsBBox({x:0,y:0,w:100,h:100}, {x:10,y:10,w:100,h:100}) → false  (right edge outside)
 *   containsBBox({x:0,y:0,w:100,h:100}, {x:0,y:0,w:100,h:100})   → true   (identical edges count)
 *
 * Use cases:
 *   - lasso "contain" mode (default Figma behaviour: only objects
 *     FULLY inside the selection rectangle get selected, vs the
 *     "touch" mode which uses `rectsOverlap`)
 *   - frame-in-frame validation: don't allow a frame to be dragged
 *     inside a frame that's smaller than it
 *   - layer-tree drop validation: a parent must contain the dragged
 *     child for the drop to make geometric sense
 *
 * NOT symmetric — `containsBBox(a, b) !== containsBBox(b, a)` unless
 * both rects are identical.
 */
export declare function containsBBox(outer: BBox, inner: BBox): boolean;
//# sourceMappingURL=bounding-box.d.ts.map