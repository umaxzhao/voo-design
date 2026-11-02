/**
 * Keeps the empty-image glyph centered and inside the object at every size.
 * The painter owns colors; this helper owns only deterministic geometry.
 */
export function layoutImagePlaceholder(bounds) {
    const width = Number.isFinite(bounds.width) ? Math.max(1, bounds.width) : 1;
    const height = Number.isFinite(bounds.height)
        ? Math.max(1, bounds.height)
        : 1;
    const availableWidth = Math.max(1, width - 24);
    const availableHeight = Math.max(1, height - 24);
    const iconWidth = Math.min(48, availableWidth, availableHeight * 1.2);
    const iconHeight = iconWidth * 0.8;
    return {
        background: [0, 0, width, height],
        icon: {
            x: (width - iconWidth) / 2,
            y: (height - iconHeight) / 2,
            width: iconWidth,
            height: iconHeight,
            radius: Math.max(1, iconWidth * 0.1),
            strokeWidth: Math.max(1, Math.min(2, iconWidth / 20)),
        },
    };
}
//# sourceMappingURL=image-placeholder.js.map