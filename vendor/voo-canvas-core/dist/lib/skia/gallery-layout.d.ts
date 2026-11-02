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
export declare const GALLERY_MAX_THUMBS = 6;
/** Gap between thumbnails in canvas units (was `gap-2` on the old DOM grid). */
export declare const GALLERY_THUMB_GAP = 8;
export interface GalleryThumbRect {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * Lay out `count` thumbnails inside a gallery card's content area (the node
 * bounds minus the AI-card content inset and footer). One image gets a
 * single column; two or more get two columns, filling row by row.
 */
export declare function layoutGalleryThumbs(bounds: {
    width: number;
    height: number;
}, count: number): GalleryThumbRect[];
/**
 * Return the index of the thumbnail containing `point` (node-local coords),
 * or null when the point lands in a gap, the inset, the footer, or outside
 * the grid.
 */
export declare function hitTestGalleryThumb(bounds: {
    width: number;
    height: number;
}, count: number, point: {
    x: number;
    y: number;
}): number | null;
//# sourceMappingURL=gallery-layout.d.ts.map