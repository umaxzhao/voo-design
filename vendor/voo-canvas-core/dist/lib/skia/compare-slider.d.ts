/**
 * Single source of truth for the image-node before/after compare slider.
 *
 * The Skia painter (`skia-scene-painter.drawImage`) paints the divider, grab
 * handle and labels from these helpers and SkiaCanvasHost hit-tests pointer
 * drags against them, so the two can never drift apart. All coordinates are
 * node-local (origin at the node's top-left corner), matching how the painter
 * draws inside the node bounds.
 *
 * Side semantics (ported from the removed DOM compare overlay): the BEFORE
 * image fills the whole node; the AFTER image is clipped to everything RIGHT
 * of the divider. Dragging the divider left reveals more before.
 */
/** Grab-handle radius in canvas units (was `w-7 h-7` on the DOM handle). */
export declare const COMPARE_HANDLE_RADIUS = 14;
/**
 * Pointer slop around the divider line. The strip runs the full node height,
 * so the divider is grabbable anywhere along its length, not just at the
 * handle circle.
 */
export declare const COMPARE_HIT_SLOP = 6;
/** Default divider position when the node has no persisted percent yet. */
export declare const COMPARE_DEFAULT_PERCENT = 50;
/** Divider X in node-local coordinates for a 0..100 percent. */
export declare function compareDividerX(width: number, percent: number): number;
/**
 * True when a node-local point falls inside the divider's hit strip:
 * ±COMPARE_HIT_SLOP around the divider line, full node height.
 */
export declare function hitTestCompareDivider(bounds: {
    width: number;
    height: number;
}, percent: number, point: {
    x: number;
    y: number;
}): boolean;
/**
 * Convert a world-space pointer X into a clamped 0..100 divider percent for
 * a node at `bounds`. Zero-width nodes collapse to the default (defensive —
 * otherwise we'd divide by zero).
 */
export declare function comparePercentAtWorldX(bounds: {
    x: number;
    width: number;
}, worldX: number): number;
//# sourceMappingURL=compare-slider.d.ts.map