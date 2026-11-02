import { isContained, measureBetween, measurePadding, } from "./measure-distance.js";
export function buildSkiaMeasureSegments(overlay, viewport) {
    const { source, target } = overlay;
    const toScreenX = (worldX) => viewport.x + worldX * viewport.zoom;
    const toScreenY = (worldY) => viewport.y + worldY * viewport.zoom;
    const sourceInTarget = isContained(source, target);
    const targetInSource = !sourceInTarget && isContained(target, source);
    if (sourceInTarget || targetInSource) {
        const child = sourceInTarget ? source : target;
        const parent = sourceInTarget ? target : source;
        const padding = measurePadding(child, parent);
        return [
            {
                id: "top",
                value: padding.top,
                horizontal: false,
                left: toScreenX(child.x + child.width / 2),
                top: toScreenY(parent.y),
                length: padding.top * viewport.zoom,
            },
            {
                id: "bottom",
                value: padding.bottom,
                horizontal: false,
                left: toScreenX(child.x + child.width / 2),
                top: toScreenY(child.y + child.height),
                length: padding.bottom * viewport.zoom,
            },
            {
                id: "left",
                value: padding.left,
                horizontal: true,
                left: toScreenX(parent.x),
                top: toScreenY(child.y + child.height / 2),
                length: padding.left * viewport.zoom,
            },
            {
                id: "right",
                value: padding.right,
                horizontal: true,
                left: toScreenX(child.x + child.width),
                top: toScreenY(child.y + child.height / 2),
                length: padding.right * viewport.zoom,
            },
        ].filter((segment) => segment.length >= 1);
    }
    const result = measureBetween(source, target);
    return [
        {
            id: "x",
            value: result.x.gap > 0 ? result.x.gap : result.x.overlap,
            horizontal: true,
            left: toScreenX(result.x.from),
            top: toScreenY(result.x.at),
            length: Math.abs(result.x.to - result.x.from) * viewport.zoom,
        },
        {
            id: "y",
            value: result.y.gap > 0 ? result.y.gap : result.y.overlap,
            horizontal: false,
            left: toScreenX(result.y.at),
            top: toScreenY(result.y.from),
            length: Math.abs(result.y.to - result.y.from) * viewport.zoom,
        },
    ].filter((segment) => segment.length >= 1);
}
//# sourceMappingURL=skia-measure-overlay.js.map