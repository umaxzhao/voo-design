/**
 * Native File > Export entries share the editor's one export dialog. Keeping
 * the mapping here lets the menu and the dialog agree on the format id without
 * duplicating a switch in the renderer.
 */
export const EXPORT_MENU_FORMATS = Object.freeze({
  "export:png": "png",
  "export:svg": "svg",
  "export:psd": "psd",
});

/** Export format requested by a native menu action, or null for other actions. */
export function exportFormatForMenuAction(action) {
  return Object.hasOwn(EXPORT_MENU_FORMATS, action)
    ? EXPORT_MENU_FORMATS[action]
    : null;
}
