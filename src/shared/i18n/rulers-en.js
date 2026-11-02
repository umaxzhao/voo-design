/**
 * Rulers, guides and snapping copy.
 *
 * Shipped as its own module (like presentation-en.js) so the string table can
 * be wired into `en.js` by the Lead without either worker editing the shared
 * dictionary. Values are flat app keys: `editor.rulers.*`, `editor.guides.*`,
 * `editor.snapping.*`.
 */
export default {
  "settings.appearance.title": "Appearance",
  "settings.appearance.hint": "How the editor chrome looks.",
  "settings.appearance.autoSaveDrafts": "Auto-save edit drafts",
  "settings.appearance.autoSaveDraftsHint": "Keep an additional local recovery copy while editing, so you can restore changes after a crash.",
  "settings.appearance.lightTheme": "Light interface",
  "settings.appearance.lightThemeHint": "Switch the panels and chrome to a light theme. The canvas keeps its own colors.",
  "settings.canvas.title": "Canvas",
  "settings.canvas.showRulers": "Show rulers",
  "settings.canvas.rulersHint": "Hidden by default. You can also toggle rulers with Shift+R (⇧R).",
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

  "editor.grid.sizeLabel": "{size} px",
  "editor.grid.options": "Grid options",
  "editor.grid.size": "Grid size",
  "editor.zoomFit.label": "Zoom to fit",
  "editor.zoomFit.shortcut": "Shift+1",
  "editor.menu.groupZoom": "Zoom",
  "editor.menu.groupGrid": "Grid",
  "editor.snapping.toGrid": "Snap to grid",
  "editor.snapping.toGridOn": "Snap to grid (on)",
  "editor.snapping.toGridOff": "Snap to grid (off)",
  "editor.snapping.toGuides": "Snap to guides",

  "editor.history.entry.guides": "Guides",
};
