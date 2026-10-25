/**
 * Height caps that keep the floating side panels clear of the round "Open VOO
 * Agent" button (App.jsx: `bottom-4 right-4 size-11`, bottom-right of the app).
 *
 * The panels are centred vertically (`top-1/2 -translate-y-1/2`) in the editor
 * stage, so a cap of `100% - 9rem` lifts the panel's bottom edge 4.5rem above
 * the stage bottom: 1rem button offset + 2.75rem button + 0.75rem gap. That
 * holds for either side (the panels can be swapped) and for any stage height.
 *
 * Tailwind scans for whole class names, so each cap is written out in full.
 */

/** Properties panel: the old 85vh cap, or the clearance cap if that is lower. */
export const PROPERTIES_PANEL_MAX_HEIGHT_CLASS = "max-h-[min(85vh,calc(100%-9rem))]";

/** Layers panel: the old 75% cap, or the clearance cap if that is lower. */
export const LAYERS_PANEL_MAX_HEIGHT_CLASS = "max-h-[min(75%,calc(100%-9rem))]";

/** Docked panels with no other cap (3D and Motion inspectors). */
export const DOCKED_PANEL_MAX_HEIGHT_CLASS = "max-h-[calc(100%-9rem)]";
