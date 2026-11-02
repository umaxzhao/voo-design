/**
 * Clamp a percent value to [2, 98]. The 2 % buffer on each edge keeps the
 * grab-handle hit area reachable — at 0 % / 100 % it would sit on the
 * container edge with no interior surface to grab.
 *
 * Non-finite inputs (NaN, ±Infinity) collapse to 50 — a safe initial
 * state matching the component's default.
 */
export declare function clampPercent(value: number): number;
export interface PointerToPercentInput {
    /** Pointer X coordinate from the event, viewport-relative (e.g. `e.clientX`). */
    pointerX: number;
    /** `getBoundingClientRect().left` of the slider container, viewport-relative. */
    containerLeft: number;
    /** `getBoundingClientRect().width` of the slider container. */
    containerWidth: number;
}
/**
 * Convert a pointer event's viewport X into a percent inside the slider
 * container. Output is already clamped via {@link clampPercent}.
 *
 * Zero-width container → returns 50 (defensive; otherwise we'd divide by
 * zero and the divider would jump to ±Infinity).
 */
export declare function pointerToPercent(input: PointerToPercentInput): number;
//# sourceMappingURL=before-after-slider.d.ts.map