import { AI_NODE_LAYOUT } from "../ai-node-layout.js";
/**
 * Single source of truth for the gallery / output node thumbnail grid.
 *
 * The Skia painter (`skia-scene-painter.drawGallery`) paints thumbnails from
 * these rects and the canvas host hit-tests pointer clicks against them, so
 * the two can never drift apart. All coordinates are node-local (origin at
 * the node's top-left corner), matching how the painter draws inside the
 * node bounds.
 */
/** Gallery cards show at most this many thumbnails (rest stay in the lightbox / strip). */
export const GALLERY_MAX_THUMBS = 6;
/** Gap between thumbnails in canvas units (was `gap-2` on the old DOM grid). */
export const GALLERY_THUMB_GAP = 8;
/**
 * Lay out `count` thumbnails inside a gallery card's content area (the node
 * bounds minus the AI-card content inset and footer). One image gets a
 * single column; two or more get two columns, filling row by row.
 */
export function layoutGalleryThumbs(bounds, count) {
    if (count <= 0)
        return [];
    const gap = GALLERY_THUMB_GAP;
    const left = AI_NODE_LAYOUT.contentInset;
    const top = AI_NODE_LAYOUT.contentInset;
    const columns = count === 1 ? 1 : 2;
    const rows = Math.ceil(count / columns);
    const width = Math.max(1, (bounds.width - left * 2 - gap * (columns - 1)) / columns);
    const height = Math.max(1, (bounds.height -
        top * 2 -
        AI_NODE_LAYOUT.footerHeight -
        gap * (rows - 1)) /
        rows);
    const rects = [];
    for (let index = 0; index < count; index += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        rects.push({
            index,
            x: left + column * (width + gap),
            y: top + row * (height + gap),
            width,
            height,
        });
    }
    return rects;
}
/**
 * Return the index of the thumbnail containing `point` (node-local coords),
 * or null when the point lands in a gap, the inset, the footer, or outside
 * the grid.
 */
export function hitTestGalleryThumb(bounds, count, point) {
    const hit = layoutGalleryThumbs(bounds, count).find((rect) => point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height);
    return hit ? hit.index : null;
}
//# sourceMappingURL=gallery-layout.js.map