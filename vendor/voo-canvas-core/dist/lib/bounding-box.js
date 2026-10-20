// Axis-aligned bounding box helpers. Used by alignment, group/ungroup, and
// fit-frame-to-children operations — three places that previously did the
// same minX/minY/maxX/maxY scan with slight syntactic variations.
// Returns null for an empty input — callers should special-case that
// (typically "nothing to align / group"). Never returns Infinity-bounded
// boxes, which was the silent failure mode of the old inline code.
export function computeBoundingBox(items, defaultH = 40) {
    if (items.length === 0)
        return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of items) {
        const h = it.h ?? defaultH;
        if (it.x < minX)
            minX = it.x;
        if (it.y < minY)
            minY = it.y;
        if (it.x + it.w > maxX)
            maxX = it.x + it.w;
        if (it.y + h > maxY)
            maxY = it.y + h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
// Expand a box outward by `pad` pixels on every side. Used to give grouped
// frames a visible margin between the frame border and the wrapped nodes.
export function inflateBox(box, pad) {
    return {
        x: box.x - pad,
        y: box.y - pad,
        w: box.w + pad * 2,
        h: box.h + pad * 2,
    };
}
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
export function rectsOverlap(a, b) {
    return (a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y);
}
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
export function rectIsEmpty(rect) {
    if (!Number.isFinite(rect.w) || !Number.isFinite(rect.h))
        return true;
    return rect.w <= 0 || rect.h <= 0;
}
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
export function bboxFromPoints(pts) {
    if (pts.length === 0)
        return null;
    let minX = pts[0].x;
    let minY = pts[0].y;
    let maxX = pts[0].x;
    let maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
        const { x, y } = pts[i];
        if (x < minX)
            minX = x;
        if (y < minY)
            minY = y;
        if (x > maxX)
            maxX = x;
        if (y > maxY)
            maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
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
export function centerOf(rect) {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
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
export function rectArea(rect) {
    return Math.max(0, rect.w) * Math.max(0, rect.h);
}
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
export function intersectRect(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.w, b.x + b.w);
    const bottom = Math.min(a.y + a.h, b.y + b.h);
    if (right <= x || bottom <= y)
        return null;
    return { x, y, w: right - x, h: bottom - y };
}
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
export function distanceBetweenRects(a, b) {
    // Horizontal & vertical gap between the rects' nearest edges.
    // `Math.max(0, ...)` collapses negative (overlap) to 0.
    const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    if (dx === 0 && dy === 0)
        return 0; // overlap or touch
    // hypot is numerically robust at extreme magnitudes — matches the
    // formula used in vector.ts / polar.ts for consistency.
    return Math.hypot(dx, dy);
}
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
export function containsBBox(outer, inner) {
    return (inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.w <= outer.x + outer.w &&
        inner.y + inner.h <= outer.y + outer.h);
}
//# sourceMappingURL=bounding-box.js.map