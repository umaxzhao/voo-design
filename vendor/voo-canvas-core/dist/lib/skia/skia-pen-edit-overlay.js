import { findClosestPenSegment, } from "../pen-path.js";
const ANCHOR_HIT_RADIUS = 10;
const HANDLE_HIT_RADIUS = 8;
const PATH_HIT_DISTANCE = 12;
function toScreen(point, viewport) {
    return {
        x: viewport.x + point.x * viewport.zoom,
        y: viewport.y + point.y * viewport.zoom,
    };
}
function isNear(left, right, radius) {
    return Math.hypot(left.x - right.x, left.y - right.y) <= radius;
}
export function hitTestSkiaPenEditOverlay(overlay, point, viewport) {
    if (!overlay || overlay.anchors.length === 0)
        return null;
    const screenAnchors = overlay.anchors.map((anchor) => ({
        ...anchor,
        ...toScreen(anchor, viewport),
        handleIn: anchor.handleIn ? toScreen(anchor.handleIn, viewport) : undefined,
        handleOut: anchor.handleOut
            ? toScreen(anchor.handleOut, viewport)
            : undefined,
    }));
    for (let index = screenAnchors.length - 1; index >= 0; index -= 1) {
        const anchor = screenAnchors[index];
        if (!anchor.handlesVisible)
            continue;
        if (anchor.handleIn && isNear(point, anchor.handleIn, HANDLE_HIT_RADIUS)) {
            return { kind: "handle", anchorIndex: index, handleType: "in" };
        }
        if (anchor.handleOut &&
            isNear(point, anchor.handleOut, HANDLE_HIT_RADIUS)) {
            return { kind: "handle", anchorIndex: index, handleType: "out" };
        }
    }
    for (let index = screenAnchors.length - 1; index >= 0; index -= 1) {
        if (isNear(point, screenAnchors[index], ANCHOR_HIT_RADIUS)) {
            return { kind: "anchor", anchorIndex: index };
        }
    }
    const closest = findClosestPenSegment(screenAnchors, overlay.closed, point);
    if (!closest || closest.distance > PATH_HIT_DISTANCE)
        return null;
    return {
        kind: "path",
        fromIndex: closest.fromIndex,
        toIndex: closest.toIndex,
        t: closest.t,
        point: {
            x: (closest.point.x - viewport.x) / viewport.zoom,
            y: (closest.point.y - viewport.y) / viewport.zoom,
        },
    };
}
//# sourceMappingURL=skia-pen-edit-overlay.js.map