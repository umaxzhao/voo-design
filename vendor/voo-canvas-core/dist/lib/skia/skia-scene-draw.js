import { clipCanConstrain } from "./clip-elision.js";
/** Deepest ancestor chain walked before assuming the parent links loop. */
const MAX_ANCESTOR_DEPTH = 256;
const NO_CONTAINERS = [];
/**
 * The clipping ancestors that actually constrain `element`, outermost first.
 *
 * Runs for every layer on every frame, so it stays allocation-free for the
 * common case of a layer with no constraining ancestor: the result list is
 * only created once a container survives, and a depth cap replaces the
 * visited set that guarded against looped parent links.
 */
function clippingContainerAncestors(element, elementsById) {
    let containers = null;
    let parentId = element.parentId;
    for (let depth = 0; parentId && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
        const parent = elementsById.get(parentId);
        if (!parent)
            break;
        if ((parent.kind === "frame" || parent.kind === "node") &&
            parent.clipContent &&
            clipCanConstrain(parent, element)) {
            (containers ?? (containers = [])).push(parent);
        }
        if (parent.kind === "connection")
            break;
        parentId = parent.parentId;
    }
    return containers ?? NO_CONTAINERS;
}
export function drawSceneElements(canvas, elements, painter, clipOperation) {
    // Built with a plain loop rather than `new Map(elements.map(...))`, which
    // allocates a throwaway pair array for every layer on every frame.
    const elementsById = new Map();
    for (const element of elements)
        elementsById.set(element.id, element);
    for (const element of elements) {
        if (!element.visible || ("isMask" in element && element.isMask))
            continue;
        if (element.kind === "connection" || element.kind === "overlay") {
            painter.drawElement(canvas, element);
            continue;
        }
        const clippingContainers = clippingContainerAncestors(element, elementsById);
        const mask = element.maskId ? elementsById.get(element.maskId) : undefined;
        const shouldClip = clippingContainers.length > 0 || Boolean(mask);
        if (!shouldClip) {
            painter.drawElement(canvas, element);
            continue;
        }
        // An alpha-matte mask is a per-pixel composite, not a geometric clip: the
        // mask element's image alpha is multiplied into this element by the painter
        // (via a layer), so it is applied AFTER drawing the element rather than as
        // a preceding clip. The default (absent `maskType`) stays geometric.
        const maskImageUrl = mask !== undefined && mask.kind !== "connection"
            ? mask.imageUrl
            : undefined;
        const alphaMask = mask !== undefined &&
            mask.kind !== "connection" &&
            element.maskType === "alpha" &&
            Boolean(maskImageUrl);
        canvas.save();
        for (const container of clippingContainers) {
            painter.clipElement(canvas, container, clipOperation);
        }
        if (mask && mask.kind !== "connection") {
            if (alphaMask) {
                painter.drawAlphaMaskedElement(canvas, element, mask);
            }
            else {
                painter.clipElement(canvas, mask, clipOperation);
                painter.drawElement(canvas, element);
            }
        }
        else {
            painter.drawElement(canvas, element);
        }
        canvas.restore();
    }
}
//# sourceMappingURL=skia-scene-draw.js.map