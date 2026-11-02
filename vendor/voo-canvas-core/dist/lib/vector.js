// vector — pure 2-D vector math.
//
// THE PROBLEM: voo-canvas has scattered inline vector ops —
//   • `{x: a.x + b.x, y: a.y + b.y}` add patterns in 5+ files
//   • `Math.hypot(dx, dy)` repeated for distance / length
//   • drag-delta math, Pen tool, rotation overlay, snap-to-point each
//     reinvent vector subtraction
// Each site is correct individually but inconsistent (some normalise
// `-0`, some don't; some short-circuit zero vector for normalize).
//
// THE FIX: a small, well-documented vector toolkit. Distinct from
// existing lib modules:
//   • `lib/numeric.lerp(a, b, t)`     → SCALAR lerp
//   • `lib/polar`                     → polar↔cartesian, angle math
//   • `lib/vector` (this)             → direct {x, y} arithmetic
//
// SCOPE:
//   ✓ Construction: vec2 / ZERO / UNIT_X / UNIT_Y
//   ✓ Arithmetic: add / sub / scale / mul / neg
//   ✓ Products: dot / cross (scalar in 2-D)
//   ✓ Magnitude: length / lengthSquared / normalize / distance(Squared)
//   ✓ Interpolation: lerp (vector form, not the scalar one in numeric.ts)
//   ✓ Rotation: rotate (around origin) / angle / perpendicular
//
// Convention: y-down screen-space (matches CSS / Figma / voo-canvas).
// All functions return NEW vectors; no mutation.
//
// Ported faithfully from voo's apps/web/lib/vector.ts (Point import
// replaced with inline `Vec2` — multiple voo-canvas modules each
// declare their own `{x, y}`; vector.ts stays standalone).
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
/** Build a `Vec2`. Default args make `vec2()` the zero vector. */
export function vec2(x = 0, y = 0) {
    return { x, y };
}
export const ZERO = { x: 0, y: 0 };
export const UNIT_X = { x: 1, y: 0 };
export const UNIT_Y = { x: 0, y: 1 };
// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------
export function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}
export function scale(v, s) {
    return { x: v.x * s, y: v.y * s };
}
/**
 * Component-wise multiply. Useful for axis-independent scaling
 * (e.g. flipping along x: `mul(v, { x: -1, y: 1 })`).
 */
export function mul(a, b) {
    return { x: a.x * b.x, y: a.y * b.y };
}
export function neg(v) {
    return { x: -v.x, y: -v.y };
}
// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
/**
 * Dot product. `dot(a, b) === |a| · |b| · cos(angle)`. Zero when
 * perpendicular.
 */
export function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}
/**
 * 2-D cross product (scalar). Sign indicates orientation:
 *   positive → b is counter-clockwise from a (math convention)
 *   negative → b is clockwise from a
 *   zero     → parallel
 *
 * Magnitude = `|a| · |b| · sin(angle)`. Useful for "is point on
 * left/right of line" tests.
 */
export function cross(a, b) {
    return a.x * b.y - a.y * b.x;
}
// ---------------------------------------------------------------------------
// Magnitude
// ---------------------------------------------------------------------------
/**
 * `|v|` — vector magnitude. Uses `Math.hypot` for numerical stability
 * on very small or very large components.
 */
export function length(v) {
    return Math.hypot(v.x, v.y);
}
/**
 * `|v|²` — magnitude squared. Cheaper than `length` (no sqrt) — use
 * for comparisons ("which is closer?" without needing the actual
 * distance).
 */
export function lengthSquared(v) {
    return v.x * v.x + v.y * v.y;
}
/**
 * Unit vector pointing in the same direction. Returns the zero vector
 * for `length === 0` (no `NaN` propagation).
 */
export function normalize(v) {
    const len = length(v);
    if (len === 0)
        return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
}
/** Distance between two points. */
export function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
/** Distance squared — fast comparison without sqrt. */
export function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
// ---------------------------------------------------------------------------
// Interpolation + rotation
// ---------------------------------------------------------------------------
/**
 * Linear interpolation between two vectors. `t = 0 → a`, `t = 1 → b`.
 * `t` is NOT clamped — pass values outside `[0, 1]` for over/undershoot.
 *
 * (Distinct from `lib/numeric.lerp` which interpolates scalars.)
 */
export function lerp(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
    };
}
/**
 * Rotate `v` by `degrees` around the origin (screen-space clockwise,
 * since y-down).
 *
 *   rotate({ x: 10, y: 0 },  90) → { x: 0,  y: 10 }
 *   rotate({ x: 10, y: 0 }, 180) → { x:-10, y: 0  }
 */
export function rotate(v, degrees) {
    if (degrees === 0)
        return { x: v.x, y: v.y };
    const rad = degrees * DEG2RAD;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    };
}
/**
 * Angle of `v` in degrees, measured from `+X` axis. `vec2(1, 0)` → 0°,
 * `vec2(0, 1)` → 90°, `vec2(-1, 0)` → 180° (or -180°), `vec2(0, -1)`
 * → -90°. Returns 0 for the zero vector.
 */
export function angle(v) {
    if (v.x === 0 && v.y === 0)
        return 0;
    return Math.atan2(v.y, v.x) * RAD2DEG;
}
/**
 * Perpendicular vector (90° rotation counter-clockwise in standard
 * math; clockwise in screen-space). Equivalent to `rotate(v, 90)`
 * but faster.
 */
export function perpendicular(v) {
    // Normalise -0 → 0 so toEqual / strict comparisons stay clean.
    const x = v.y === 0 ? 0 : -v.y;
    return { x, y: v.x };
}
//# sourceMappingURL=vector.js.map