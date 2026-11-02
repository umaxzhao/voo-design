// rotate-geometry — math for the canvas rotate interaction (Figma parity).
//
// The rotate affordance is an invisible hot zone in a ring just outside the
// selection's corners (outside the resize handles, close enough to grab).
// Dragging rotates the element around its center; Shift snaps to 15°.
/** Corner order: NW, NE, SE, SW — clockwise from top-left. */
export function rectCorners(bounds, rotationDeg = 0) {
    const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
    ];
    if (!rotationDeg)
        return corners;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return corners.map((point) => ({
        x: cx + (point.x - cx) * cos - (point.y - cy) * sin,
        y: cy + (point.x - cx) * sin + (point.y - cy) * cos,
    }));
}
/** Axis-aligned bounding box of a rotated rect — the world-space extent
 *  consumers (marquee, zoom-to-fit, hit testing) should use instead of the
 *  raw unrotated bounds. Returns the input unchanged when rotation is 0. */
export function rotatedAabb(bounds, rotationDeg = 0) {
    if (!rotationDeg)
        return bounds;
    const corners = rectCorners(bounds, rotationDeg);
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
        x: minX,
        y: minY,
        width: Math.max(...xs) - minX,
        height: Math.max(...ys) - minY,
    };
}
/**
 * Index of the corner whose rotate hot zone contains `point`, or null.
 * The zone is the ring [innerRadius, outerRadius] around each corner —
 * inside the resize handles' hit area nothing is returned so resize always
 * wins.
 */
export function rotateZoneCorner(point, corners, innerRadius, outerRadius) {
    let bestIndex = null;
    let bestDist = Infinity;
    corners.forEach((corner, index) => {
        const dist = Math.hypot(point.x - corner.x, point.y - corner.y);
        if (dist >= innerRadius && dist <= outerRadius && dist < bestDist) {
            bestIndex = index;
            bestDist = dist;
        }
    });
    return bestIndex;
}
/** Angle in degrees from `center` to `point` (screen/canvas y-down space). */
export function angleBetween(center, point) {
    return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}
/** Pointer-angle delta for a rotate gesture, optionally snapped to 15°. */
export function computeDeltaAngle(startPointerAngle, currentPointerAngle, snap = false) {
    const delta = currentPointerAngle - startPointerAngle;
    return snap ? Math.round(delta / 15) * 15 : delta;
}
/**
 * Multi-selection rotation (Figma): every selected element orbits the
 * selection's shared center by deltaDeg AND picks up deltaDeg on its own
 * rotation. Returns each item's new top-left + normalized rotation.
 */
export function rotateItemsAroundCenter(items, center, deltaDeg) {
    const rad = (deltaDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return items.map((item) => {
        const dx = item.cx - center.x;
        const dy = item.cy - center.y;
        const cx = center.x + dx * cos - dy * sin;
        const cy = center.y + dx * sin + dy * cos;
        return {
            id: item.id,
            x: cx - item.w / 2,
            y: cy - item.h / 2,
            rotation: (((item.rotation + deltaDeg) % 360) + 360) % 360,
        };
    });
}
export function computeDragRotation(args) {
    const { initialRotation, startPointerAngle, currentPointerAngle, snap } = args;
    let next = initialRotation + (currentPointerAngle - startPointerAngle);
    if (snap)
        next = Math.round(next / 15) * 15;
    // Normalize to [0, 360) — the Inspector's rotation field wraps at 360.
    return ((next % 360) + 360) % 360;
}
//# sourceMappingURL=rotate-geometry.js.map