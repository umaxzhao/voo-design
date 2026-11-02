export function layoutSkiaGalleryLightbox(viewport) {
    const maxWidth = Math.max(120, viewport.width * 0.84);
    const maxHeight = Math.max(120, viewport.height * 0.72);
    const image = {
        left: (viewport.width - maxWidth) / 2,
        top: (viewport.height - maxHeight) / 2 - 18,
        width: maxWidth,
        height: maxHeight,
    };
    const buttonTop = image.top + image.height + 12;
    return {
        image,
        download: {
            left: image.left + image.width - 156,
            top: buttonTop,
            width: 88,
            height: 32,
        },
        close: {
            left: image.left + image.width - 60,
            top: buttonTop,
            width: 60,
            height: 32,
        },
    };
}
export function hitTestSkiaGalleryLightbox(viewport, point) {
    const layout = layoutSkiaGalleryLightbox(viewport);
    for (const action of ["download", "close"]) {
        const bounds = layout[action];
        if (point.x >= bounds.left &&
            point.x < bounds.left + bounds.width &&
            point.y >= bounds.top &&
            point.y < bounds.top + bounds.height) {
            return action;
        }
    }
    if (point.x >= layout.image.left &&
        point.x < layout.image.left + layout.image.width &&
        point.y >= layout.image.top &&
        point.y < layout.image.top + layout.image.height) {
        return "content";
    }
    return "close";
}
//# sourceMappingURL=skia-gallery-lightbox.js.map