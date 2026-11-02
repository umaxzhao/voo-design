import type { BBox } from "./bounding-box.js";
import { type Point2D } from "./point-in-polygon.js";
/**
 * Build a closed SVG path whose convex polygon corners consume a uniform
 * visual radius. The requested radius is clamped across every shared edge so
 * neighbouring corner tangents never overlap, including on narrow triangles.
 */
export declare function roundedPolygonPath(polygon: readonly Point2D[], radius: number): string;
/**
 * Axis-aligned bounding box of `polygon`. Returns `null` for empty
 * polygons. Single-point polygons return a zero-sized rect at that point.
 */
export declare function polygonBBox(polygon: readonly Point2D[]): BBox | null;
/**
 * **Signed** polygon area via the shoelace formula.
 *
 *   sum_{i=0..n-1} (x_i × y_{i+1} - x_{i+1} × y_i) / 2
 *
 * Sign indicates orientation. In screen-coords (y-down):
 *   - positive → clockwise vertex order (visually CW on screen)
 *   - negative → counter-clockwise
 *
 * Use `Math.abs` if you only want magnitude. Returns `0` for polygons
 * with fewer than 3 vertices.
 */
export declare function polygonArea(polygon: readonly Point2D[]): number;
/**
 * Is `polygon` wound counter-clockwise? In screen-coords (y-down),
 * this is `polygonArea(polygon) < 0` (negative signed area = visually
 * CCW).
 *
 * Returns `false` for degenerate polygons (< 3 vertices) and for any
 * polygon with exactly zero signed area (a degenerate line).
 */
export declare function isCCW(polygon: readonly Point2D[]): boolean;
/** Convenience: opposite of `isCCW`. */
export declare function isCW(polygon: readonly Point2D[]): boolean;
/**
 * Area-weighted centroid (true center of mass for a uniform-density
 * polygon). Falls back to the arithmetic mean of vertices when the
 * signed area is zero (degenerate — line or empty set).
 *
 * Returns `null` for empty input.
 */
export declare function polygonCentroid(polygon: readonly Point2D[]): Point2D | null;
/**
 * Sum of edge lengths around the polygon (including the closing edge
 * from last back to first). `0` for empty / single-point polygons.
 */
export declare function polygonPerimeter(polygon: readonly Point2D[]): number;
/**
 * Does `polygon` fully enclose `rect`? True iff all four rect corners
 * are inside the polygon AND no polygon edge crosses any rect edge.
 *
 * Useful for "is this item fully inside the lasso?" (strict-mode lasso).
 */
export declare function polygonContainsRect(polygon: readonly Point2D[], rect: BBox): boolean;
/**
 * Does `rect` overlap `polygon` at all? Returns true if any rect
 * corner is inside the polygon, any polygon vertex is inside the rect,
 * or any polygon edge crosses any rect edge.
 *
 * This is the "loose" lasso mode (Shift+lasso) — partial overlap is a
 * hit.
 *
 * Fast-path: bbox-vs-bbox early-out before any per-edge work.
 */
export declare function rectIntersectsPolygon(rect: BBox, polygon: readonly Point2D[]): boolean;
//# sourceMappingURL=polygon-ops.d.ts.map