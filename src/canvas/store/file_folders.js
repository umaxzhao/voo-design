/**
 * Legacy browser-local folder membership, kept only to migrate older installs
 * into physical project subdirectories (or the sandbox `folder` field).
 *
 * New membership comes from the file's own `folder` property returned by
 * `workspaceStorage.scanFiles()` — the subdirectory it lives in.
 */

const STORAGE_KEY = "voo.workspace.fileFolders";

/** Session copy, used when browser storage is unavailable or refuses writes. */
let sessionMap = {};

function readMap() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return { ...sessionMap };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : { ...sessionMap };
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

/** @deprecated Prefer workspaceStorage.moveToFolder — kept for migration/tests. */
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

/** Snapshot of the legacy map, for one-shot migration. */
export function listLegacyFolderMembership() {
  return { ...readMap() };
}

/** Drops every legacy membership entry after a successful physical migrate. */
export function clearLegacyFolderMembership() {
  writeMap({});
}

/**
 * Moves files that only had a localStorage folder into the matching project
 * subdirectory (or sandbox folder field). Safe to call repeatedly: entries
 * that already live in a folder, or whose move fails, are left alone.
 *
 * @param {{
 *   scanFiles: (options?: object) => Promise<Array<{id: string, name?: string, folder?: string|null}>>,
 *   moveToFolder: (fileId: string, folderName: string|null) => Promise<{ok: boolean}>,
 * }} storage
 * @returns {Promise<number>} how many files were moved
 */
export async function migrateLegacyFolderMembership(storage) {
  const legacy = listLegacyFolderMembership();
  const entries = Object.entries(legacy);
  if (entries.length === 0) return 0;

  let files = [];
  try {
    files = (await storage.scanFiles({ includeTrashed: false })) || [];
  } catch {
    return 0;
  }

  const byId = new Map(files.map((file) => [file.id, file]));
  const byName = new Map();
  for (const file of files) {
    if (file.name && !byName.has(file.name)) byName.set(file.name, file);
  }

  let moved = 0;
  const remaining = { ...legacy };
  for (const [key, folderName] of entries) {
    if (!folderName) {
      delete remaining[key];
      continue;
    }
    const file = byId.get(key) || byName.get(key);
    if (!file) continue;
    if (file.folder === folderName) {
      delete remaining[key];
      delete remaining[file.id];
      continue;
    }
    // Only auto-migrate files that still sit at the root.
    if (file.folder) continue;
    try {
      const res = await storage.moveToFolder(file.id, folderName);
      if (res?.ok) {
        moved += 1;
        delete remaining[key];
        delete remaining[file.id];
      }
    } catch {
      // Leave the entry for a later attempt.
    }
  }
  writeMap(remaining);
  return moved;
}
