export function hitTestSkiaCommentPins(state, viewport, point) {
    for (let index = state.pins.length - 1; index >= 0; index -= 1) {
        const pin = state.pins[index];
        if (!pin || pin.draft)
            continue;
        const screenX = viewport.x + pin.x * viewport.zoom;
        const screenY = viewport.y + pin.y * viewport.zoom;
        if (Math.hypot(point.x - screenX, point.y - screenY) <= 13)
            return pin;
    }
    return null;
}
//# sourceMappingURL=skia-comment-pins.js.map