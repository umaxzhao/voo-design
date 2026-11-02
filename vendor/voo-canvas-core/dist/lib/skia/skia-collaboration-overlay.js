export const REMOTE_CURSOR_LEAVE_FADE_MS = 300;
export const REMOTE_CURSOR_GHOST_TTL_MS = REMOTE_CURSOR_LEAVE_FADE_MS + 50;
const REMOTE_CURSOR_LERP_ALPHA = 0.25;
const REMOTE_CURSOR_SNAP_DISTANCE = 0.5;
/**
 * Advance one network cursor sample toward its target. Keeping the math in
 * the Skia model makes cursor motion deterministic and independently tested;
 * React only schedules frames and publishes the resulting positions.
 */
export function advanceRemoteCursor(current, target, reducedMotion) {
    if (!current || reducedMotion) {
        return { position: target, settled: true };
    }
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (Math.abs(dx) < REMOTE_CURSOR_SNAP_DISTANCE &&
        Math.abs(dy) < REMOTE_CURSOR_SNAP_DISTANCE) {
        return { position: target, settled: true };
    }
    return {
        position: {
            x: current.x + dx * REMOTE_CURSOR_LERP_ALPHA,
            y: current.y + dy * REMOTE_CURSOR_LERP_ALPHA,
        },
        settled: false,
    };
}
export function remoteCursorOpacity(leavingAt, timestampMs) {
    if (leavingAt === undefined)
        return 1;
    return Math.max(0, 1 - (timestampMs - leavingAt) / REMOTE_CURSOR_LEAVE_FADE_MS);
}
//# sourceMappingURL=skia-collaboration-overlay.js.map