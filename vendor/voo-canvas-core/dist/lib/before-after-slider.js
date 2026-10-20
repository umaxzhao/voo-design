// Pure math for the canvas image-node before/after slider.
// Lives outside the React component so the truth-table is vitest-pinned
// without RTL setup and so future placements (e.g. a side-by-side modal)
// can reuse the same edge / clamp behavior.
//
// Convention: percent is the divider position from the LEFT edge as a
// 0..100 value. Higher = "after" image revealed across more of the width.
/**
 * Clamp a percent value to [2, 98]. The 2 % buffer on each edge keeps the
 * grab-handle hit area reachable — at 0 % / 100 % it would sit on the
 * container edge with no interior surface to grab.
 *
 * Non-finite inputs (NaN, ±Infinity) collapse to 50 — a safe initial
 * state matching the component's default.
 */
export function clampPercent(value) {
    if (!Number.isFinite(value))
        return 50;
    if (value < 2)
        return 2;
    if (value > 98)
        return 98;
    return value;
}
/**
 * Convert a pointer event's viewport X into a percent inside the slider
 * container. Output is already clamped via {@link clampPercent}.
 *
 * Zero-width container → returns 50 (defensive; otherwise we'd divide by
 * zero and the divider would jump to ±Infinity).
 */
export function pointerToPercent(input) {
    const { pointerX, containerLeft, containerWidth } = input;
    if (containerWidth <= 0)
        return 50;
    const local = pointerX - containerLeft;
    return clampPercent((local / containerWidth) * 100);
}
//# sourceMappingURL=before-after-slider.js.map