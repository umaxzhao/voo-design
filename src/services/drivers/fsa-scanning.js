import { guessCategory, workspaceRelativeId } from "../workspace_storage.js";
import { isFsaError } from "./fsa-diagnostics.js";

async function scanDirectoryFiles(handle, folder, meta, files, trashed = false) {
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file") continue;
    const match = name.toLowerCase().match(/\.(voo|fig|psd|svg)$/);
    if (!match) continue;
    let file;
    try { file = await entry.getFile(); }
    catch (error) {
      // A file can disappear between directory iteration and readback.
      if (isFsaError(error, "NotFoundError")) continue;
      throw error;
    }
    const id = workspaceRelativeId(name, folder);
    const metadata = meta[id] || meta[name] || {};
    files.push({
      id, name, path: null, folder, extension: match[1], size: file.size,
      updatedAt: file.lastModified, createdAt: file.lastModified,
      starred: Boolean(metadata.starred), trashed,
      trashedAt: trashed ? metadata.trashedAt || file.lastModified : null,
      category: metadata.category || guessCategory(name), preview: metadata.preview || null,
    });
  }
}

export async function scanFsaFiles(driver, options = {}) {
  if (!driver.dirHandle) return [];
  if (!(await driver._verifyPermission(driver.dirHandle, false))) {
    throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  }
  const meta = driver._loadMetadata();
  const files = [];
  await scanDirectoryFiles(driver.dirHandle, null, meta, files);
  for await (const [name, entry] of driver.dirHandle.entries()) {
    if (entry.kind !== "directory" || name.startsWith(".") || name.startsWith("__voo_")) continue;
    await scanDirectoryFiles(entry, name, meta, files);
  }
  if (options.includeTrashed || options.trashOnly) {
    const trash = await driver._getTrashDir(false);
    if (trash) await scanDirectoryFiles(trash, null, meta, files, true);
  }
  const { trashOnly = false, includeTrashed = false, starredOnly = false,
    category = null, search = "", sortBy = "updatedAt", sortOrder = "desc" } = options;
  const query = search.trim().toLowerCase();
  const filtered = files.filter(item => {
    if (trashOnly) return item.trashed;
    if (!includeTrashed && item.trashed) return false;
    if (starredOnly && !item.starred) return false;
    if (category && category !== "all" && item.category !== category) return false;
    return !query || item.name?.toLowerCase().includes(query) || item.category?.toLowerCase().includes(query);
  });
  return filtered.sort((a, b) => {
    if (sortBy === "name") {
      const left = (a.name || "").toLowerCase(), right = (b.name || "").toLowerCase();
      return sortOrder === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    }
    const left = a[sortBy] || 0, right = b[sortBy] || 0;
    return sortOrder === "asc" ? left - right : right - left;
  });
}
