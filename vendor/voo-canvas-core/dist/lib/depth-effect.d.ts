import type { DepthEffect } from "./external-types.js";
/** Beyond this the wall stops being a 2D effect and belongs to real 3D. */
export declare const DEPTH_MAX_DISTANCE = 24;
export declare const DEFAULT_DEPTH_DISTANCE = 8;
/** Down-right: the direction a flat object reads as lit from the top-left. */
export declare const DEFAULT_DEPTH_ANGLE = 45;
export declare const DEFAULT_DEPTH_COLOR = "#00000040";
export interface DepthOffset {
    x: number;
    y: number;
}
export interface ResolvedDepth {
    distance: number;
    angle: number;
    color: string;
    /** One entry per step, ordered from the far end toward the object. */
    layers: readonly DepthOffset[];
}
/**
 * The silhouette offsets, farthest first. One layer per pixel of distance
 * keeps consecutive silhouettes ~1px apart; a coarser step leaves diagonal
 * seams at the corners.
 */
export declare function depthLayers(distance: number, angle: number): DepthOffset[];
export declare function resolveDepth(depth: DepthEffect | undefined): ResolvedDepth | null;
/** Zero-blur box-shadow terms, ready to splice into an existing chain. */
export declare const composeDepthBoxShadow: (depth: DepthEffect | undefined) => string | null;
/**
 * `filter: drop-shadow()` has no spread and applies to whatever the previous
 * term produced, so repeating the single unit step accumulates the whole wall.
 */
export declare const composeDepthFilterDropShadow: (depth: DepthEffect | undefined) => string | null;
//# sourceMappingURL=depth-effect.d.ts.map