export interface Point2D {
    x: number;
    y: number;
}
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
export declare function pointInPolygon(px: number, py: number, poly: ReadonlyArray<readonly [number, number]>): boolean;
/**
 * Convenience overload that takes `{x, y}` objects instead of tuples.
 * Useful when callers already have `Point2D` arrays (mouse-event
 * waypoints, store-shaped coords) and don't want to map to tuples.
 */
export declare function pointInPolygonObj(point: Point2D, poly: ReadonlyArray<Point2D>): boolean;
//# sourceMappingURL=point-in-polygon.d.ts.map