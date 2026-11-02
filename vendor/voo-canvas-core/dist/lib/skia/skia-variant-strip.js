const LABEL_WIDTH = 44;
const THUMB_SIZE = 48;
const THUMB_GAP = 6;
const STRIP_GAP = 12;
const VIEWPORT_MARGIN = 8;
export function layoutSkiaVariantStrip(strip, viewport) {
    const width = LABEL_WIDTH +
        strip.urls.length * THUMB_SIZE +
        Math.max(0, strip.urls.length - 1) * THUMB_GAP;
    const preferredLeft = viewport.x + strip.anchorBounds.x * viewport.zoom + 12;
    const preferredTop = viewport.y +
        (strip.anchorBounds.y + strip.anchorBounds.height) * viewport.zoom +
        STRIP_GAP;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, viewport.width - width - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(preferredTop, viewport.height - THUMB_SIZE - VIEWPORT_MARGIN));
    return {
        left,
        top,
        width,
        height: THUMB_SIZE,
        thumbs: strip.urls.map((_, index) => ({
            index,
            left: left + LABEL_WIDTH + index * (THUMB_SIZE + THUMB_GAP),
            top,
            size: THUMB_SIZE,
        })),
    };
}
export function hitTestSkiaVariantStrip(strip, viewport, point) {
    const thumb = layoutSkiaVariantStrip(strip, viewport).thumbs.find((candidate) => point.x >= candidate.left &&
        point.x < candidate.left + candidate.size &&
        point.y >= candidate.top &&
        point.y < candidate.top + candidate.size);
    if (!thumb)
        return null;
    if (point.y < thumb.top + 16 && point.x < thumb.left + 16) {
        return { action: "remove", index: thumb.index };
    }
    if (point.y < thumb.top + 16 && point.x >= thumb.left + thumb.size - 16) {
        return { action: "pin", index: thumb.index };
    }
    return { action: "select", index: thumb.index };
}
//# sourceMappingURL=skia-variant-strip.js.map