import type { ScenePoint } from "./scene-types.js";
/** Corner order: NW, NE, SE, SW — clockwise from top-left. */
export declare function rectCorners(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
}, rotationDeg?: number): ScenePoint[];
/** Axis-aligned bounding box of a rotated rect — the world-space extent
 *  consumers (marquee, zoom-to-fit, hit testing) should use instead of the
 *  raw unrotated bounds. Returns the input unchanged when rotation is 0. */
export declare function rotatedAabb(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
}, rotationDeg?: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
/**
 * Index of the corner whose rotate hot zone contains `point`, or null.
 * The zone is the ring [innerRadius, outerRadius] around each corner —
 * inside the resize handles' hit area nothing is returned so resize always
 * wins.
 */
export declare function rotateZoneCorner(point: ScenePoint, corners: readonly ScenePoint[], innerRadius: number, outerRadius: number): number | null;
/** Angle in degrees from `center` to `point` (screen/canvas y-down space). */
export declare function angleBetween(center: ScenePoint, point: ScenePoint): number;
/** Pointer-angle delta for a rotate gesture, optionally snapped to 15°. */
export declare function computeDeltaAngle(startPointerAngle: number, currentPointerAngle: number, snap?: boolean): number;
export interface RotatedItemGeometry {
    id: string;
    x: number;
    y: number;
    rotation: number;
}
/**
 * Multi-selection rotation (Figma): every selected element orbits the
 * selection's shared center by deltaDeg AND picks up deltaDeg on its own
 * rotation. Returns each item's new top-left + normalized rotation.
 */
export declare function rotateItemsAroundCenter(items: ReadonlyArray<{
    id: string;
    w: number;
    h: number;
    cx: number;
    cy: number;
    rotation: number;
}>, center: ScenePoint, deltaDeg: number): RotatedItemGeometry[];
export declare function computeDragRotation(args: {
    initialRotation: number;
    startPointerAngle: number;
    currentPointerAngle: number;
    /** Shift — snap to 15° increments. */
    snap?: boolean;
}): number;
//# sourceMappingURL=rotate-geometry.d.ts.map