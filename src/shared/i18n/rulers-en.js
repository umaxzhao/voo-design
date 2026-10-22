/**
 * Rulers, guides and snapping copy.
 *
 * Shipped as its own module (like presentation-en.js) so the string table can
 * be wired into `en.js` by the Lead without either worker editing the shared
 * dictionary. Values are flat app keys: `editor.rulers.*`, `editor.guides.*`,
 * `editor.snapping.*`.
 */
export default {
  "editor.rulers.toggle": "Show/hide rulers",
  "editor.rulers.show": "Show rulers",
  "editor.rulers.hide": "Hide rulers",
  "editor.rulers.corner": "Ruler origin",
  "editor.rulers.horizontal": "Horizontal ruler",
  "editor.rulers.vertical": "Vertical ruler",

  "editor.guides.toggle": "Show/hide guides",
  "editor.guides.show": "Show guides",
  "editor.guides.hide": "Hide guides",
  "editor.guides.label": "Guide",
  "editor.guides.create": "Drag out of a ruler to add a guide",
  "editor.guides.clear": "Clear guides",
  "editor.guides.clearAll": "Clear all guides",

  "editor.snapping.toGrid": "Snap to grid",
  "editor.snapping.toGridOn": "Snap to grid (on)",
  "editor.snapping.toGridOff": "Snap to grid (off)",
  "editor.snapping.toGuides": "Snap to guides",

  "editor.history.entry.guides": "Guides",
};
