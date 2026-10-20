export const SKIA_IMAGE_TOOLBAR_HEIGHT = 36;
export const SKIA_IMAGE_TOOLBAR_ITEM_WIDTH = 40;
const TOOLBAR_GAP = 12;
const VIEWPORT_MARGIN = 8;
export function layoutSkiaImageToolbar(toolbar, viewport) {
    const width = toolbar.items.length * SKIA_IMAGE_TOOLBAR_ITEM_WIDTH + 8;
    const anchorCenterX = viewport.x +
        (toolbar.anchorBounds.x + toolbar.anchorBounds.width / 2) * viewport.zoom;
    const preferredLeft = anchorCenterX - width / 2;
    const preferredTop = viewport.y +
        (toolbar.anchorBounds.y + toolbar.anchorBounds.height) * viewport.zoom +
        TOOLBAR_GAP;
    return {
        left: Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, viewport.width - width - VIEWPORT_MARGIN)),
        top: Math.max(VIEWPORT_MARGIN, Math.min(preferredTop, viewport.height - SKIA_IMAGE_TOOLBAR_HEIGHT - VIEWPORT_MARGIN)),
        width,
        height: SKIA_IMAGE_TOOLBAR_HEIGHT,
    };
}
export function hitTestSkiaImageToolbar(toolbar, viewport, point) {
    const layout = layoutSkiaImageToolbar(toolbar, viewport);
    if (point.x < layout.left + 4 ||
        point.x >= layout.left + layout.width - 4 ||
        point.y < layout.top ||
        point.y >= layout.top + layout.height) {
        return null;
    }
    const index = Math.floor((point.x - layout.left - 4) / SKIA_IMAGE_TOOLBAR_ITEM_WIDTH);
    const item = toolbar.items[index];
    return item && !item.disabled ? item : null;
}
//# sourceMappingURL=skia-image-toolbar.js.map