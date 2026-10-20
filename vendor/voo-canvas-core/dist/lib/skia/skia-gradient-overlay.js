function worldToScreen(point, viewport) {
    return {
        x: viewport.x + point.x * viewport.zoom,
        y: viewport.y + point.y * viewport.zoom,
    };
}
function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0)
        return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}
export function hitTestSkiaGradientOverlay(overlay, viewport, point) {
    const start = worldToScreen(overlay.start, viewport);
    const end = worldToScreen(overlay.end, viewport);
    if (Math.hypot(point.x - start.x, point.y - start.y) <= 9)
        return "start";
    if (Math.hypot(point.x - end.x, point.y - end.y) <= 9)
        return "end";
    if (overlay.linear && distanceToSegment(point, start, end) <= 7) {
        return "center";
    }
    return null;
}
//# sourceMappingURL=skia-gradient-overlay.js.map