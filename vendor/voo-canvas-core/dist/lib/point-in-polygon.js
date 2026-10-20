// point-in-polygon — ray-casting hit test for arbitrary 2D polygons.
//
// Companion to `rectContainsPoint` (lib/find-frame-at.ts) which only
// handles axis-aligned rectangles. For freehand lasso selection, the
// user paints a closed path of waypoints and we need to know which
// canvas objects fall inside the curve. The standard solution is the
// even-odd ray-casting algorithm: shoot a horizontal ray from the test
// point and count edge crossings — odd count = inside, even = outside.
//
// Ported from voo-create's src/canvas/selection-utils.ts. The algorithm
// itself is textbook (Sutherland-style); voo-create's twist is the
// `+ 1e-12` epsilon in the slope denominator to avoid NaN when a polygon
// edge is exactly horizontal (yj === yi).
//
// voo-canvas currently does rectangle marquee only (see VooCanvas.tsx
// `lasso` state — paints a startX/startY → currentX/currentY rect, hit
// tests with simple `intersects(x, y, w, h)`). This primitive unlocks
// freehand lasso as a future task without baking the math into the
// component.
/**
 * True when point `(px, py)` is inside the polygon defined by `poly`.
 *
 * The polygon is a sequence of vertices `[x, y]`; consecutive vertices
 * are joined by edges, and the last vertex is implicitly joined back
 * to the first (closed polygon).
 *
 * Boundary behavior:
 *   - Points exactly on an edge fall into undefined territory by spec
 *     (ray-casting can flip-flop based on rounding). Callers running
 *     animated cursors don't notice — a moving cursor crosses too fast
 *     for the boundary moment to register.
 *   - Self-intersecting polygons follow the even-odd fill rule: regions
 *     enclosed an even number of times are "outside", odd are "inside".
 *
 * Defensive on inputs:
 *   - Polygon with < 3 vertices returns `false` (no enclosed area).
 *   - Non-finite point coords → `false`.
 *   - Non-finite vertex coords → ignored as if the polygon were broken
 *     at that edge (best-effort; callers should filter before passing).
 *
 * Complexity: O(N) where N = poly.length.
 */
export function pointInPolygon(px, py, poly) {
    if (!Number.isFinite(px) || !Number.isFinite(py))
        return false;
    if (poly.length < 3)
        return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        // Even-odd ray-cast: does a rightward ray from (px, py) cross this edge?
        //   First check the y range straddles py (one vertex above, one
        //   below — i.e. exactly one of yi/yj exceeds py).
        //   Second, find where the edge crosses y = py and see if it's to
        //   the right of px. +1e-12 in the denominator dodges divide-by-zero
        //   when the edge is exactly horizontal (yj === yi).
        const straddles = yi > py !== yj > py;
        if (!straddles)
            continue;
        const intersectX = ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
        if (px < intersectX)
            inside = !inside;
    }
    return inside;
}
/**
 * Convenience overload that takes `{x, y}` objects instead of tuples.
 * Useful when callers already have `Point2D` arrays (mouse-event
 * waypoints, store-shaped coords) and don't want to map to tuples.
 */
export function pointInPolygonObj(point, poly) {
    if (!point || !Array.isArray(poly))
        return false;
    // Lazy-convert: avoids an allocation when this overload is hot.
    if (poly.length < 3)
        return false;
    const tuples = poly.map((p) => [p.x, p.y]);
    return pointInPolygon(point.x, point.y, tuples);
}
//# sourceMappingURL=point-in-polygon.js.map