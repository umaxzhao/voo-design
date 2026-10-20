// polygon-ops — 2-D polygon math beyond point-in-polygon.
//
// THE PROBLEM: voo-canvas has `lib/point-in-polygon.ts` (lasso hit
// test), but for the broader lasso / freehand-selection roadmap we
// need more polygon-math primitives:
//   • bbox of a freehand stroke (camera fit-to-selection)
//   • signed area (orientation: was the stroke drawn CW or CCW?)
//   • area-weighted centroid (where to anchor a "selection rotate" gizmo)
//   • perimeter (display "selected boundary: 482 px")
//   • rect ↔ polygon overlap tests (loose vs strict lasso modes)
// Each of these is a one-off textbook formula but easy to get wrong
// (shoelace sign convention, centroid degenerate case, segment-segment
// intersection edge cases).
//
// THE FIX: a dedicated module that COMPLEMENTS `lib/point-in-polygon`
// without duplicating its ray-cast logic. We delegate to
// `pointInPolygonObj` whenever we need an inside test.
//
// SCOPE:
//   ✓ polygonBBox → axis-aligned bbox of the vertices
//   ✓ polygonArea → SIGNED area via shoelace (orientation cue)
//   ✓ polygonCentroid → area-weighted center of mass
//   ✓ polygonPerimeter → sum of edge lengths
//   ✓ isCW / isCCW → orientation predicates
//   ✓ polygonContainsRect → strict lasso (all rect corners + no edge cross)
//   ✓ rectIntersectsPolygon → loose lasso (Shift modifier)
//
// CONVENTION: screen-down Y axis (canvas standard). This FLIPS the
// shoelace sign vs. math convention — so `isCW` means "positive signed
// area" here (= visually clockwise on screen).
//
// Ported faithfully from voo's apps/web/lib/polygon.ts.
import { pointInPolygonObj } from "./point-in-polygon.js";
function svgNumber(value) {
    const rounded = Math.round(value * 10000) / 10000;
    return String(Object.is(rounded, -0) ? 0 : rounded);
}
function sharpPolygonPath(polygon) {
    if (polygon.length === 0)
        return "";
    const [first, ...rest] = polygon;
    return [
        `M ${svgNumber(first.x)} ${svgNumber(first.y)}`,
        ...rest.map((point) => `L ${svgNumber(point.x)} ${svgNumber(point.y)}`),
        "Z",
    ].join(" ");
}
/**
 * Build a closed SVG path whose convex polygon corners consume a uniform
 * visual radius. The requested radius is clamped across every shared edge so
 * neighbouring corner tangents never overlap, including on narrow triangles.
 */
export function roundedPolygonPath(polygon, radius) {
    if (polygon.length < 3 || !Number.isFinite(radius) || radius <= 0) {
        return sharpPolygonPath(polygon);
    }
    const tangentFactors = [];
    for (let index = 0; index < polygon.length; index += 1) {
        const previous = polygon[(index - 1 + polygon.length) % polygon.length];
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        const previousLength = Math.hypot(previous.x - current.x, previous.y - current.y);
        const nextLength = Math.hypot(next.x - current.x, next.y - current.y);
        if (previousLength === 0 || nextLength === 0)
            return sharpPolygonPath(polygon);
        const dot = ((previous.x - current.x) * (next.x - current.x) +
            (previous.y - current.y) * (next.y - current.y)) /
            (previousLength * nextLength);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        const halfAngleTangent = Math.tan(angle / 2);
        if (!Number.isFinite(halfAngleTangent) || halfAngleTangent <= 0) {
            return sharpPolygonPath(polygon);
        }
        tangentFactors.push(1 / halfAngleTangent);
    }
    let effectiveRadius = radius;
    for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        const edgeLength = Math.hypot(next.x - current.x, next.y - current.y);
        const factorSum = tangentFactors[index] + tangentFactors[(index + 1) % polygon.length];
        effectiveRadius = Math.min(effectiveRadius, edgeLength / factorSum);
    }
    const corners = polygon.map((current, index) => {
        const previous = polygon[(index - 1 + polygon.length) % polygon.length];
        const next = polygon[(index + 1) % polygon.length];
        const previousLength = Math.hypot(previous.x - current.x, previous.y - current.y);
        const nextLength = Math.hypot(next.x - current.x, next.y - current.y);
        const tangentDistance = effectiveRadius * tangentFactors[index];
        return {
            vertex: current,
            start: {
                x: current.x +
                    ((previous.x - current.x) / previousLength) * tangentDistance,
                y: current.y +
                    ((previous.y - current.y) / previousLength) * tangentDistance,
            },
            end: {
                x: current.x + ((next.x - current.x) / nextLength) * tangentDistance,
                y: current.y + ((next.y - current.y) / nextLength) * tangentDistance,
            },
        };
    });
    const first = corners[0];
    const commands = [
        `M ${svgNumber(first.start.x)} ${svgNumber(first.start.y)}`,
    ];
    for (let index = 0; index < corners.length; index += 1) {
        const corner = corners[index];
        if (index > 0) {
            commands.push(`L ${svgNumber(corner.start.x)} ${svgNumber(corner.start.y)}`);
        }
        commands.push(`Q ${svgNumber(corner.vertex.x)} ${svgNumber(corner.vertex.y)} ${svgNumber(corner.end.x)} ${svgNumber(corner.end.y)}`);
    }
    commands.push("Z");
    return commands.join(" ");
}
// ---------------------------------------------------------------------------
// BBox
// ---------------------------------------------------------------------------
/**
 * Axis-aligned bounding box of `polygon`. Returns `null` for empty
 * polygons. Single-point polygons return a zero-sized rect at that point.
 */
export function polygonBBox(polygon) {
    if (polygon.length === 0)
        return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of polygon) {
        if (p.x < minX)
            minX = p.x;
        if (p.y < minY)
            minY = p.y;
        if (p.x > maxX)
            maxX = p.x;
        if (p.y > maxY)
            maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
// ---------------------------------------------------------------------------
// Area / centroid / orientation
// ---------------------------------------------------------------------------
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
export function polygonArea(polygon) {
    const n = polygon.length;
    if (n < 3)
        return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
}
/**
 * Is `polygon` wound counter-clockwise? In screen-coords (y-down),
 * this is `polygonArea(polygon) < 0` (negative signed area = visually
 * CCW).
 *
 * Returns `false` for degenerate polygons (< 3 vertices) and for any
 * polygon with exactly zero signed area (a degenerate line).
 */
export function isCCW(polygon) {
    return polygonArea(polygon) < 0;
}
/** Convenience: opposite of `isCCW`. */
export function isCW(polygon) {
    return polygonArea(polygon) > 0;
}
/**
 * Area-weighted centroid (true center of mass for a uniform-density
 * polygon). Falls back to the arithmetic mean of vertices when the
 * signed area is zero (degenerate — line or empty set).
 *
 * Returns `null` for empty input.
 */
export function polygonCentroid(polygon) {
    const n = polygon.length;
    if (n === 0)
        return null;
    if (n === 1)
        return { x: polygon[0].x, y: polygon[0].y };
    let cx = 0;
    let cy = 0;
    let signedArea = 0;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        const cross = a.x * b.y - b.x * a.y;
        signedArea += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }
    if (signedArea === 0) {
        // Degenerate — average vertices.
        let sx = 0;
        let sy = 0;
        for (const p of polygon) {
            sx += p.x;
            sy += p.y;
        }
        return { x: sx / n, y: sy / n };
    }
    // The 6 comes from the centroid formula: (1 / 6A) × Σ (x_i + x_{i+1}) × cross.
    return { x: cx / (3 * signedArea), y: cy / (3 * signedArea) };
}
// ---------------------------------------------------------------------------
// Perimeter
// ---------------------------------------------------------------------------
/**
 * Sum of edge lengths around the polygon (including the closing edge
 * from last back to first). `0` for empty / single-point polygons.
 */
export function polygonPerimeter(polygon) {
    const n = polygon.length;
    if (n < 2)
        return 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
}
// ---------------------------------------------------------------------------
// Polygon ↔ Rect intersection
// ---------------------------------------------------------------------------
/**
 * Does `polygon` fully enclose `rect`? True iff all four rect corners
 * are inside the polygon AND no polygon edge crosses any rect edge.
 *
 * Useful for "is this item fully inside the lasso?" (strict-mode lasso).
 */
export function polygonContainsRect(polygon, rect) {
    if (polygon.length < 3)
        return false;
    const corners = rectCorners(rect);
    for (const c of corners) {
        if (!pointInPolygonObj(c, polygon))
            return false;
    }
    // Catch the case of a polygon shaped like a doughnut where corners
    // are inside but an edge of the polygon dips into the rect interior.
    if (anyEdgeCrossesRect(polygon, rect))
        return false;
    return true;
}
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
export function rectIntersectsPolygon(rect, polygon) {
    if (polygon.length === 0)
        return false;
    // BBox early-out.
    const pb = polygonBBox(polygon);
    if (rect.x + rect.w < pb.x ||
        pb.x + pb.w < rect.x ||
        rect.y + rect.h < pb.y ||
        pb.y + pb.h < rect.y) {
        return false;
    }
    if (polygon.length < 3) {
        // Degenerate polygon — fall back to "any vertex in rect".
        for (const p of polygon)
            if (rectContainsPoint(rect, p))
                return true;
        return false;
    }
    // Any corner of rect inside polygon?
    for (const c of rectCorners(rect)) {
        if (pointInPolygonObj(c, polygon))
            return true;
    }
    // Any polygon vertex inside rect?
    for (const p of polygon) {
        if (rectContainsPoint(rect, p))
            return true;
    }
    // Any polygon edge crosses any rect edge?
    return anyEdgeCrossesRect(polygon, rect);
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function rectCorners(r) {
    return [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
    ];
}
function rectContainsPoint(r, p) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
function anyEdgeCrossesRect(polygon, rect) {
    const corners = rectCorners(rect);
    const rectEdges = [
        [corners[0], corners[1]],
        [corners[1], corners[2]],
        [corners[2], corners[3]],
        [corners[3], corners[0]],
    ];
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        for (const [c, d] of rectEdges) {
            if (segmentsIntersect(a, b, c, d))
                return true;
        }
    }
    return false;
}
/**
 * Do segments (a→b) and (c→d) intersect (not just touch at endpoints)?
 * Uses signed-area orientation tests — strict crossing only; collinear
 * overlap returns false.
 */
function segmentsIntersect(a, b, c, d) {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 !== o2 && o3 !== o4;
}
/**
 * Orientation sign of the triangle (a, b, c).
 *   +1  → c is to the left of a→b (CCW in y-up math; CW on screen)
 *   -1  → to the right
 *    0  → collinear
 */
function orient(a, b, c) {
    const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (v > 0)
        return 1;
    if (v < 0)
        return -1;
    return 0;
}
//# sourceMappingURL=polygon-ops.js.map