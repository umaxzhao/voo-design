export interface Vec2 {
    x: number;
    y: number;
}
/** Build a `Vec2`. Default args make `vec2()` the zero vector. */
export declare function vec2(x?: number, y?: number): Vec2;
export declare const ZERO: Vec2;
export declare const UNIT_X: Vec2;
export declare const UNIT_Y: Vec2;
export declare function add(a: Vec2, b: Vec2): Vec2;
export declare function sub(a: Vec2, b: Vec2): Vec2;
export declare function scale(v: Vec2, s: number): Vec2;
/**
 * Component-wise multiply. Useful for axis-independent scaling
 * (e.g. flipping along x: `mul(v, { x: -1, y: 1 })`).
 */
export declare function mul(a: Vec2, b: Vec2): Vec2;
export declare function neg(v: Vec2): Vec2;
/**
 * Dot product. `dot(a, b) === |a| · |b| · cos(angle)`. Zero when
 * perpendicular.
 */
export declare function dot(a: Vec2, b: Vec2): number;
/**
 * 2-D cross product (scalar). Sign indicates orientation:
 *   positive → b is counter-clockwise from a (math convention)
 *   negative → b is clockwise from a
 *   zero     → parallel
 *
 * Magnitude = `|a| · |b| · sin(angle)`. Useful for "is point on
 * left/right of line" tests.
 */
export declare function cross(a: Vec2, b: Vec2): number;
/**
 * `|v|` — vector magnitude. Uses `Math.hypot` for numerical stability
 * on very small or very large components.
 */
export declare function length(v: Vec2): number;
/**
 * `|v|²` — magnitude squared. Cheaper than `length` (no sqrt) — use
 * for comparisons ("which is closer?" without needing the actual
 * distance).
 */
export declare function lengthSquared(v: Vec2): number;
/**
 * Unit vector pointing in the same direction. Returns the zero vector
 * for `length === 0` (no `NaN` propagation).
 */
export declare function normalize(v: Vec2): Vec2;
/** Distance between two points. */
export declare function distance(a: Vec2, b: Vec2): number;
/** Distance squared — fast comparison without sqrt. */
export declare function distanceSquared(a: Vec2, b: Vec2): number;
/**
 * Linear interpolation between two vectors. `t = 0 → a`, `t = 1 → b`.
 * `t` is NOT clamped — pass values outside `[0, 1]` for over/undershoot.
 *
 * (Distinct from `lib/numeric.lerp` which interpolates scalars.)
 */
export declare function lerp(a: Vec2, b: Vec2, t: number): Vec2;
/**
 * Rotate `v` by `degrees` around the origin (screen-space clockwise,
 * since y-down).
 *
 *   rotate({ x: 10, y: 0 },  90) → { x: 0,  y: 10 }
 *   rotate({ x: 10, y: 0 }, 180) → { x:-10, y: 0  }
 */
export declare function rotate(v: Vec2, degrees: number): Vec2;
/**
 * Angle of `v` in degrees, measured from `+X` axis. `vec2(1, 0)` → 0°,
 * `vec2(0, 1)` → 90°, `vec2(-1, 0)` → 180° (or -180°), `vec2(0, -1)`
 * → -90°. Returns 0 for the zero vector.
 */
export declare function angle(v: Vec2): number;
/**
 * Perpendicular vector (90° rotation counter-clockwise in standard
 * math; clockwise in screen-space). Equivalent to `rotate(v, 90)`
 * but faster.
 */
export declare function perpendicular(v: Vec2): Vec2;
//# sourceMappingURL=vector.d.ts.map