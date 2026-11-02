/**
 * Master switch for the eyedropper's sampling-ring toggle.
 *
 * The switch is wired in the panel but nothing draws the ring yet — so a
 * toggle that flips and visibly does nothing is worse than no toggle (the user
 * would think they broke something, or that the feature is dead). Hide it until
 * the ring is actually painted; flip this back to reopen it in one line:
 *
 *   export const HIDE_SAMPLING_RING = false;
 */
export const HIDE_SAMPLING_RING = true;
