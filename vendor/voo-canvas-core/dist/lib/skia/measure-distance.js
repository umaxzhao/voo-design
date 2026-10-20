// measure-distance — Alt+hover measurement between two rects (Figma parity).
//
// With one layer selected, holding Alt and hovering another shows the gap
// (or overlap) between them on each axis, with red guide lines and px
// labels. This module is the pure math: per axis, whether the rects are
// separated (gap) or overlapping, plus the line segment + label anchor to
// render. DOM overlay consumes it; Skia stays out of the text business.
export function isContained(child, parent) {
    return (child.x >= parent.x - 1e-4 &&
        child.y >= parent.y - 1e-4 &&
        child.x + child.width <= parent.x + parent.width + 1e-4 &&
        child.y + child.height <= parent.y + parent.height + 1e-4);
}
export function measurePadding(childRect, parentRect) {
    const contained = isContained(childRect, parentRect);
    return {
        top: childRect.y - parentRect.y,
        right: parentRect.x + parentRect.width - (childRect.x + childRect.width),
        bottom: parentRect.y + parentRect.height - (childRect.y + childRect.height),
        left: childRect.x - parentRect.x,
        isContained: contained,
    };
}
function axisGap(aMin, aMax, bMin, bMax) {
    if (aMax < bMin)
        return { gap: bMin - aMax, overlap: 0, from: aMax, to: bMin };
    if (bMax < aMin)
        return { gap: aMin - bMax, overlap: 0, from: bMax, to: aMin };
    const from = Math.max(aMin, bMin);
    const to = Math.min(aMax, bMax);
    return { gap: 0, overlap: to - from, from, to };
}
export function measureBetween(a, b) {
    const xAxis = axisGap(a.x, a.x + a.width, b.x, b.x + b.width);
    const yAxis = axisGap(a.y, a.y + a.height, b.y, b.y + b.height);
    // Guide line position on the perpendicular axis: axisGap's from/to span
    // is the overlap region when the rects overlap there and the gap channel
    // when they're apart — its midpoint is the right placement in both cases.
    return {
        x: { ...xAxis, at: (yAxis.from + yAxis.to) / 2 },
        y: { ...yAxis, at: (xAxis.from + xAxis.to) / 2 },
    };
}
//# sourceMappingURL=measure-distance.js.map