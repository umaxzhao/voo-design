import { clampPercent } from "../before-after-slider.js";
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
export const COMPARE_HANDLE_RADIUS = 14;
/**
 * Pointer slop around the divider line. The strip runs the full node height,
 * so the divider is grabbable anywhere along its length, not just at the
 * handle circle.
 */
export const COMPARE_HIT_SLOP = 6;
/** Default divider position when the node has no persisted percent yet. */
export const COMPARE_DEFAULT_PERCENT = 50;
/** Divider X in node-local coordinates for a 0..100 percent. */
export function compareDividerX(width, percent) {
    return (clampPercent(percent) / 100) * Math.max(0, width);
}
/**
 * True when a node-local point falls inside the divider's hit strip:
 * ±COMPARE_HIT_SLOP around the divider line, full node height.
 */
export function hitTestCompareDivider(bounds, percent, point) {
    if (point.y < 0 || point.y > bounds.height)
        return false;
    const dividerX = compareDividerX(bounds.width, percent);
    return Math.abs(point.x - dividerX) <= COMPARE_HIT_SLOP;
}
/**
 * Convert a world-space pointer X into a clamped 0..100 divider percent for
 * a node at `bounds`. Zero-width nodes collapse to the default (defensive —
 * otherwise we'd divide by zero).
 */
export function comparePercentAtWorldX(bounds, worldX) {
    if (bounds.width <= 0)
        return COMPARE_DEFAULT_PERCENT;
    return clampPercent(((worldX - bounds.x) / bounds.width) * 100);
}
//# sourceMappingURL=compare-slider.js.map