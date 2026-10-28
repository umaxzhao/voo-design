import { getRecentFiles } from "./recent_files.js";

/** Finds the recent entry of an unsaved document; unsaved entries are unique by name. */
export function findDraftEntry(fileName) {
  if (!fileName) return null;
  return getRecentFiles().find((item) => !item.path && item.name === fileName) || null;
}

