import { getLinearPathEndpoints } from "../linear-path-geometry.js";
import { findClosestPenSegment } from "../pen-path.js";
import { pointInPolygonObj } from "../point-in-polygon.js";
import { rotate } from "../vector.js";
import { rotatedAabb } from "./rotate-geometry.js";
export function elementSidePortGeometry(bounds, rotation, side, flipX = false) {
    const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
    };
    const direction = (side === "left" ? -1 : 1) * (flipX ? -1 : 1);
    const offset = rotate({ x: direction * (bounds.width / 2), y: 0 }, rotation);
    return {
        point: { x: center.x + offset.x, y: center.y + offset.y },
        outward: rotate({ x: direction, y: 0 }, rotation),
    };
}
export function includeMaskDependencies(visibleElements, allElements) {
    const visibleIds = new Set(visibleElements.map((element) => element.id));
    const maskIds = new Set(visibleElements.flatMap((element) => element.kind !== "connection" && element.maskId ? [element.maskId] : []));
    return [
        ...visibleElements,
        ...allElements.filter((element) => maskIds.has(element.id) && !visibleIds.has(element.id)),
    ];
}
export function screenToWorld(point, viewport) {
    return {
        x: (point.x - viewport.x) / viewport.zoom,
        y: (point.y - viewport.y) / viewport.zoom,
    };
}
export function viewportWorldBounds(viewport) {
    return {
        x: -viewport.x / viewport.zoom,
        y: -viewport.y / viewport.zoom,
        width: viewport.width / viewport.zoom,
        height: viewport.height / viewport.zoom,
    };
}
export function boundsIntersect(a, b) {
    return (a.x <= b.x + b.width &&
        a.x + a.width >= b.x &&
        a.y <= b.y + b.height &&
        a.y + a.height >= b.y);
}
export function elementWorldBounds(element) {
    // Rotated shapes: report the AABB of the rotated corners, not the raw
    // unrotated box — marquee selection and any other world-bounds consumer
    // would otherwise use a rectangle that doesn't contain the painted shape.
    const isLinear = element.kind === "node" &&
        (element.shape === "line" || element.shape === "arrow");
    if ((element.kind === "node" || element.kind === "frame") &&
        !isLinear &&
        element.rotation) {
        return rotatedAabb(element.bounds, element.rotation);
    }
    if (element.kind !== "node" ||
        (element.shape !== "line" && element.shape !== "arrow")) {
        return element.bounds;
    }
    const endpoints = getLinearPathEndpoints({
        x: element.bounds.x,
        y: element.bounds.y,
        w: element.bounds.width,
        h: element.bounds.height,
        rotation: element.rotation,
    });
    const padding = Math.max(0, element.stroke?.width ?? 0) / 2;
    const minX = Math.min(endpoints.start.x, endpoints.end.x) - padding;
    const minY = Math.min(endpoints.start.y, endpoints.end.y) - padding;
    const maxX = Math.max(endpoints.start.x, endpoints.end.x) + padding;
    const maxY = Math.max(endpoints.start.y, endpoints.end.y) + padding;
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
export function containsPoint(bounds, point) {
    return (point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height);
}
function cubicPoint(connection, t) {
    const oneMinusT = 1 - t;
    const a = oneMinusT * oneMinusT * oneMinusT;
    const b = 3 * oneMinusT * oneMinusT * t;
    const c = 3 * oneMinusT * t * t;
    const d = t * t * t;
    return {
        x: a * connection.start.x +
            b * connection.controlStart.x +
            c * connection.controlEnd.x +
            d * connection.end.x,
        y: a * connection.start.y +
            b * connection.controlStart.y +
            c * connection.controlEnd.y +
            d * connection.end.y,
    };
}
function pointSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0)
        return Math.hypot(point.x - start.x, point.y - start.y);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
function localPointForElement(element, point) {
    const centerX = element.bounds.x + element.bounds.width / 2;
    const centerY = element.bounds.y + element.bounds.height / 2;
    const unrotated = element.rotation
        ? rotate({ x: point.x - centerX, y: point.y - centerY }, -element.rotation)
        : { x: point.x - centerX, y: point.y - centerY };
    return {
        x: centerX + (element.flipX ? -unrotated.x : unrotated.x),
        y: centerY + (element.flipY ? -unrotated.y : unrotated.y),
    };
}
function angleWithinSweep(angle, start, sweep) {
    if (Math.abs(sweep) >= 359.999)
        return true;
    const normalize = (value) => ((value % 360) + 360) % 360;
    const distance = sweep >= 0 ? normalize(angle - start) : normalize(start - angle);
    return distance <= Math.abs(sweep);
}
function hitTestEllipse(element, point, tolerance) {
    const radiusX = element.bounds.width / 2;
    const radiusY = element.bounds.height / 2;
    if (radiusX <= 0 || radiusY <= 0)
        return false;
    const centerX = element.bounds.x + radiusX;
    const centerY = element.bounds.y + radiusY;
    const normalizedX = (point.x - centerX) / radiusX;
    const normalizedY = (point.y - centerY) / radiusY;
    const radius = Math.hypot(normalizedX, normalizedY);
    const normalizedTolerance = tolerance / Math.max(1, Math.min(radiusX, radiusY));
    const innerRadius = Math.max(0, Math.min(0.99, (element.ellipseInnerRadius ?? 0) / 100));
    if (radius > 1 + normalizedTolerance ||
        radius < innerRadius - normalizedTolerance) {
        return false;
    }
    const angle = (Math.atan2(normalizedX, -normalizedY) * 180) / Math.PI;
    return angleWithinSweep(angle, element.ellipseStartAngle ?? 0, Math.max(-360, Math.min(360, element.ellipseSweep ?? 360)));
}
function hitTestRegularPolygon(element, point, tolerance) {
    const sides = element.shape === "triangle" ? 3 : Math.max(3, element.polygonSides ?? 6);
    const radiusX = element.bounds.width / 2;
    const radiusY = element.bounds.height / 2;
    const center = {
        x: element.bounds.x + radiusX,
        y: element.bounds.y + radiusY,
    };
    const vertices = Array.from({ length: sides }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
        return {
            x: center.x + Math.cos(angle) * radiusX,
            y: center.y + Math.sin(angle) * radiusY,
        };
    });
    let inside = false;
    for (let index = 0, previous = sides - 1; index < sides; previous = index++) {
        const a = vertices[index];
        const b = vertices[previous];
        if (pointSegmentDistance(point, a, b) <= tolerance)
            return true;
        if (a.y > point.y !== b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}
function sampleClosedPenSubpaths(anchors, finalSubpathClosed) {
    if (anchors.length < 3)
        return [];
    const subpaths = [];
    const stepsPerSegment = 16;
    let startIndex = 0;
    const appendClosedSubpath = (endIndex, closed) => {
        if (!closed || endIndex - startIndex < 2)
            return;
        const samples = [];
        for (let index = startIndex; index <= endIndex; index += 1) {
            const from = anchors[index];
            const to = anchors[index === endIndex ? startIndex : index + 1];
            const controlOut = from.handleOut ?? from;
            const controlIn = to.handleIn ?? to;
            for (let step = 0; step < stepsPerSegment; step += 1) {
                const t = step / stepsPerSegment;
                const inverse = 1 - t;
                samples.push({
                    x: inverse * inverse * inverse * from.x +
                        3 * inverse * inverse * t * controlOut.x +
                        3 * inverse * t * t * controlIn.x +
                        t * t * t * to.x,
                    y: inverse * inverse * inverse * from.y +
                        3 * inverse * inverse * t * controlOut.y +
                        3 * inverse * t * t * controlIn.y +
                        t * t * t * to.y,
                });
            }
        }
        subpaths.push(samples);
    };
    for (let index = 1; index < anchors.length; index += 1) {
        if (!anchors[index].disconnect)
            continue;
        appendClosedSubpath(index - 1, anchors[index - 1].closeSubPath === true);
        startIndex = index;
    }
    const lastIndex = anchors.length - 1;
    appendClosedSubpath(lastIndex, anchors[lastIndex].closeSubPath === true || finalSubpathClosed);
    return subpaths;
}
export function hitTestElement(element, point, tolerance) {
    if (!element.visible)
        return false;
    if (element.kind === "overlay") {
        // Selection, marquee and snap-guide overlays are visual chrome, not
        // interaction surfaces. Treating their full bounds as hittable prevents
        // descendants inside a selected frame from ever becoming the next
        // selection.
        if (element.overlayType === "selection" ||
            element.overlayType === "marquee" ||
            element.overlayType === "snap-guide") {
            return false;
        }
        if (element.overlayType === "linear-selection") {
            const endpoints = getLinearPathEndpoints({
                x: element.bounds.x,
                y: element.bounds.y,
                w: element.bounds.width,
                h: element.bounds.height,
                rotation: element.rotation,
            });
            return (pointSegmentDistance(point, endpoints.start, endpoints.end) <= tolerance);
        }
    }
    if (element.kind === "node" &&
        (element.shape === "line" || element.shape === "arrow")) {
        const endpoints = getLinearPathEndpoints({
            x: element.bounds.x,
            y: element.bounds.y,
            w: element.bounds.width,
            h: element.bounds.height,
            rotation: element.rotation,
        });
        return (pointSegmentDistance(point, endpoints.start, endpoints.end) <= tolerance);
    }
    if (element.kind !== "connection") {
        // Rotation-aware hit test: transform the world point into the element's
        // local frame before testing its (unrotated) bounds. Plain containsPoint
        // misses clicks on the protruding parts of a rotated shape and false-hits
        // the empty corners of its axis-aligned box. Overlays keep the plain
        // test — their bounds are already world-space boxes (resize handles
        // carry the target's rotation only for drawing).
        if (element.kind !== "overlay") {
            const localPoint = localPointForElement(element, point);
            if (element.kind === "node" && element.shape === "ellipse") {
                return hitTestEllipse(element, localPoint, tolerance);
            }
            if (element.kind === "node" &&
                (element.shape === "triangle" || element.shape === "polygon")) {
                return hitTestRegularPolygon(element, localPoint, tolerance);
            }
            if (element.kind === "node" && element.shape === "path") {
                const anchors = element.pathAnchors;
                const fillIsVisible = Boolean(element.fill || element.fills?.length);
                if (anchors?.length) {
                    const localPathPoint = {
                        x: localPoint.x - element.bounds.x,
                        y: localPoint.y - element.bounds.y,
                    };
                    if (element.pathClosed && fillIsVisible) {
                        const sampledPaths = sampleClosedPenSubpaths(anchors, true);
                        if (sampledPaths.some((path) => pointInPolygonObj(localPathPoint, path))) {
                            return true;
                        }
                    }
                    const nearest = findClosestPenSegment(anchors, element.pathClosed === true, localPathPoint);
                    const strokeWidth = Math.max(element.stroke?.width ?? 0, ...(element.strokes?.map((stroke) => stroke.width) ?? [0]));
                    return (nearest !== null && nearest.distance <= tolerance + strokeWidth / 2);
                }
            }
            return containsPoint(element.bounds, localPoint);
        }
        return (point.x >= element.bounds.x - tolerance &&
            point.x <= element.bounds.x + element.bounds.width + tolerance &&
            point.y >= element.bounds.y - tolerance &&
            point.y <= element.bounds.y + element.bounds.height + tolerance);
    }
    let previous = element.start;
    for (let index = 1; index <= 16; index += 1) {
        const current = cubicPoint(element, index / 16);
        if (pointSegmentDistance(point, previous, current) <= tolerance)
            return true;
        previous = current;
    }
    return false;
}
//# sourceMappingURL=scene-geometry.js.map