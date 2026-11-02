// Depth ("立体") is a solid extrusion: the object silhouette repeated along one
// direction. Both renderers — CanvasKit on the canvas and the CSS/JSX exports —
// consume the offsets computed here so the wall cannot drift between them.
//
// Layers keep the color's own alpha and every renderer composites them
// source-over, so a semi-transparent wall darkens toward its far end in the
// canvas and in the export alike. Matching beats one uniform-alpha canvas.
/** Beyond this the wall stops being a 2D effect and belongs to real 3D. */
export const DEPTH_MAX_DISTANCE = 24;
export const DEFAULT_DEPTH_DISTANCE = 8;
/** Down-right: the direction a flat object reads as lit from the top-left. */
export const DEFAULT_DEPTH_ANGLE = 45;
export const DEFAULT_DEPTH_COLOR = "#00000040";
function round(value) {
    return Math.round(value * 100) / 100;
}
/** 0° points right, 90° points down — the screen-space convention CSS uses. */
function depthDirection(angle) {
    const radians = (angle * Math.PI) / 180;
    return { x: round(Math.cos(radians)), y: round(Math.sin(radians)) };
}
/**
 * The silhouette offsets, farthest first. One layer per pixel of distance
 * keeps consecutive silhouettes ~1px apart; a coarser step leaves diagonal
 * seams at the corners.
 */
export function depthLayers(distance, angle) {
    const clamped = Math.min(DEPTH_MAX_DISTANCE, Math.max(0, distance));
    const count = Math.max(1, Math.round(clamped));
    const step = clamped / count;
    const direction = depthDirection(angle);
    return Array.from({ length: count }, (_, index) => {
        const along = step * (count - index);
        return {
            x: round(direction.x * along),
            y: round(direction.y * along),
        };
    });
}
export function resolveDepth(depth) {
    if (!depth || depth.enabled === false)
        return null;
    const distance = depth.distance ?? DEFAULT_DEPTH_DISTANCE;
    if (!(distance > 0))
        return null;
    const angle = depth.angle ?? DEFAULT_DEPTH_ANGLE;
    return {
        distance: Math.min(DEPTH_MAX_DISTANCE, distance),
        angle,
        color: depth.color || DEFAULT_DEPTH_COLOR,
        layers: depthLayers(distance, angle),
    };
}
/** Zero-blur box-shadow terms, ready to splice into an existing chain. */
export const composeDepthBoxShadow = (depth) => {
    const resolved = resolveDepth(depth);
    if (!resolved)
        return null;
    return resolved.layers
        .map((layer) => `${layer.x}px ${layer.y}px 0 0 ${resolved.color}`)
        .join(", ");
};
/**
 * `filter: drop-shadow()` has no spread and applies to whatever the previous
 * term produced, so repeating the single unit step accumulates the whole wall.
 */
export const composeDepthFilterDropShadow = (depth) => {
    const resolved = resolveDepth(depth);
    if (!resolved)
        return null;
    const step = resolved.layers[resolved.layers.length - 1];
    const term = `drop-shadow(${step.x}px ${step.y}px 0 ${resolved.color})`;
    return Array.from({ length: resolved.layers.length }, () => term).join(" ");
};
//# sourceMappingURL=depth-effect.js.map