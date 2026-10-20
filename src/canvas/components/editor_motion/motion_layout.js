// Timeline bottom-4 (16px), zoom bottom-3 (12px), and one gap-2 (8px).
const TIMELINE_BOTTOM = 16;
const ZOOM_BOTTOM = 12;
const CONTROL_GAP = 8;

export function zoomShiftForTimeline(height) {
  if (!Number.isFinite(height) || height <= 0) return 0;
  return height + TIMELINE_BOTTOM + CONTROL_GAP - ZOOM_BOTTOM;
}
