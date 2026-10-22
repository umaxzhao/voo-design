/**
 * Which project folder each workspace file belongs to. Membership is metadata
 * kept beside the file list, keyed by the file's id, so it works the same for
 * the desktop, File System Access and sandbox workspaces.
 */

const STORAGE_KEY = "voo.workspace.fileFolders";

/** Session copy, used when browser storage is unavailable or refuses writes. */
let sessionMap = {};

function readMap() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return { ...sessionMap };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { ...sessionMap };
  } catch {
    return { ...sessionMap };
  }
}

function writeMap(map) {
  sessionMap = { ...map };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable (private windows); the session copy still holds it.
  }
}

/** The folder a file is in, or null when it sits at the workspace root. */
export function folderOfFile(fileId) {
  return readMap()[fileId] ?? null;
}

/** Moves a file into a folder; a null folder returns it to the root. */
export function setFileFolder(fileId, folderName) {
  const map = readMap();
  if (folderName) map[fileId] = folderName;
  else delete map[fileId];
  writeMap(map);
}

/** Forgets a folder's membership once the folder itself is removed. */
export function clearFolderMembership(folderName) {
  const map = readMap();
  for (const [fileId, name] of Object.entries(map)) {
    if (name === folderName) delete map[fileId];
  }
  writeMap(map);
}
