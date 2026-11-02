import { elementWorldBounds } from "./scene-geometry.js";
/**
 * How far an element's ink can spill outside its own bounds.
 *
 * Strokes straddle the edge, layer blur bleeds roughly two radii, and a drop
 * shadow travels by its offset and then spreads. A clip would cut all of it,
 * so the reach is what decides whether the clip has anything to do.
 * Overestimating only means keeping a clip that was not strictly needed;
 * underestimating would silently stop clipping ink that should be cut, so
 * every term is rounded up.
 */
function inkOverflow(element) {
    let strokeReach = element.stroke?.width ?? 0;
    if (element.strokes) {
        for (const stroke of element.strokes) {
            strokeReach = Math.max(strokeReach, stroke.width);
        }
    }
    let shadowReach = 0;
    if (element.shadows) {
        for (const shadow of element.shadows) {
            if (shadow.inset)
                continue;
            shadowReach = Math.max(shadowReach, Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY)) +
                shadow.blur * 2 +
                shadow.spread);
        }
    }
    return strokeReach + (element.layerBlur ?? 0) * 2 + shadowReach;
}
/** True when the container's clip region is exactly its bounds rectangle. */
function clipsToPlainRect(container) {
    if (container.rotation)
        return false;
    if ((container.cornerRadius ?? 0) > 0)
        return false;
    const radii = container.cornerRadii;
    if (radii &&
        (radii.topLeft > 0 ||
            radii.topRight > 0 ||
            radii.bottomRight > 0 ||
            radii.bottomLeft > 0)) {
        return false;
    }
    if (container.kind !== "node")
        return true;
    // Mirrors the shapes clipEffectGeometry sends to clipBoxGeometry: every
    // other shape clips to curved or arbitrary geometry that its bounding box
    // would overstate.
    switch (container.shape) {
        case "ellipse":
        case "boolean":
        case "triangle":
        case "polygon":
            return false;
        case "path":
            return !container.pathData;
        default:
            return true;
    }
}
function containsBounds(outer, inner) {
    return (inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height);
}
/**
 * True when clipping `element` to `container` could remove any ink.
 *
 * Imported design files mark almost every wrapper frame as clipping — a
 * 16×16 icon frame around a 16×16 icon — and setting up a clip costs far more
 * than the draw it guards. A clip whose region already contains everything
 * the element can paint is dropped instead of being handed to Skia.
 */
export function clipCanConstrain(container, element) {
    if (!clipsToPlainRect(container))
        return true;
    const overflow = inkOverflow(element);
    const bounds = elementWorldBounds(element);
    return !containsBounds(container.bounds, {
        x: bounds.x - overflow,
        y: bounds.y - overflow,
        width: bounds.width + overflow * 2,
        height: bounds.height + overflow * 2,
    });
}
//# sourceMappingURL=clip-elision.js.map