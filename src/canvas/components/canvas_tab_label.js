/** File names stay as the user saved them, so they are shown as they are. */
export const FALLBACK_NAME = "Untitled";

/** The live file name of the active document wins over the tab's stored name. */
export function documentLabel(document, active, currentFileName) {
  const name = active ? currentFileName : document.fileName;
  return name?.replace(/\.voo$/i, "") || FALLBACK_NAME;
}
