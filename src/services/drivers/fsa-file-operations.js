import { guessCategory, parseWorkspaceRelativeId, workspaceRelativeId } from "../workspace_storage.js";
import { fsaFailure, optionalFsaEntry, writeFsaHandle } from "./fsa-diagnostics.js";

export async function readFsaFile(driver, fileIdOrName) {
  if (!driver.dirHandle) throw new Error("No workspace directory chosen");
  if (!(await driver._verifyPermission(driver.dirHandle, false))) {
    throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  }
  const resolved = await driver._resolveFileHandle(fileIdOrName);
  let entry = resolved?.handle ?? null;
  if (!entry) {
    const { name } = parseWorkspaceRelativeId(fileIdOrName);
    const trash = await driver._getTrashDir(false);
    if (trash && name) entry = await optionalFsaEntry(() => trash.getFileHandle(name));
  }
  if (!entry) throw Object.assign(new Error("File not found"), { name: "NotFoundError" });
  return new Uint8Array(await (await entry.getFile()).arrayBuffer());
}

export async function moveFsaFile(driver, fileId, folderName) {
  if (!driver.dirHandle) return { ok: false, error: "No workspace chosen" };
  if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, error: "permission_denied" };
  const folder = folderName == null || folderName === "" ? null : String(folderName).trim();
  if (folderName && (!folder || folder.startsWith(".") || /[/\\:*?"<>|]/.test(folder))) return { ok: false, error: "invalid_name" };
  const resolved = await driver._resolveFileHandle(fileId);
  if (!resolved) return { ok: false, error: "file_not_found" };
  if ((resolved.folder || null) === folder) {
    return { ok: true, file: { id: workspaceRelativeId(resolved.name, folder), name: resolved.name, folder } };
  }
  const dest = await driver._getProjectDir(folder, Boolean(folder));
  if (!dest) return { ok: false, error: "folder_not_found" };
  const name = await driver._uniqueName(dest, resolved.name);
  await driver._moveHandle(resolved.handle, resolved.dir, dest, name);
  const nextId = workspaceRelativeId(name, folder);
  driver._migrateMeta(fileId, nextId);
  driver._migrateMeta(resolved.name, nextId);
  driver._emitChange("change", nextId);
  return { ok: true, file: { id: nextId, name, folder } };
}

export async function writeFsaFile(driver, name, bytes, options = {}) {
  if (!driver.dirHandle) throw new Error("No workspace directory chosen");
  if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, error: "Permission denied" };
  const safeName = name.includes(".") ? name : `${name}.voo`;
  const handle = await driver.dirHandle.getFileHandle(safeName, { create: true });
  await writeFsaHandle(handle, bytes);
  const file = await handle.getFile();
  const meta = { category: options.category || guessCategory(safeName), preview: options.preview || null };
  driver._setMeta(safeName, meta);
  driver._emitChange("create", safeName);
  return {
    ok: true, id: safeName, name: safeName, path: null,
    extension: safeName.split(".").pop().toLowerCase(), size: file.size,
    updatedAt: file.lastModified, createdAt: file.lastModified,
    starred: false, trashed: false, trashedAt: null, ...meta,
  };
}

export async function renameFsaFile(driver, fileId, newName) {
  if (!driver.dirHandle) return { ok: false, error: "No workspace chosen" };
  if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, error: "Permission denied" };
  const resolved = await driver._resolveFileHandle(fileId);
  if (!resolved) return { ok: false, error: "File not found" };
  const name = newName.includes(".") ? newName : `${newName}.voo`;
  if (name !== resolved.name && await optionalFsaEntry(() => resolved.dir.getFileHandle(name))) {
    return { ok: false, error: "A file with this name already exists" };
  }
  if (name === resolved.name) return { ok: true, newName: name, file: { id: fileId, name, folder: resolved.folder } };
  await driver._moveHandle(resolved.handle, resolved.dir, resolved.dir, name);
  const nextId = workspaceRelativeId(name, resolved.folder);
  driver._migrateMeta(fileId, nextId);
  driver._emitChange("change", nextId);
  return { ok: true, newName: name, file: { id: nextId, name, folder: resolved.folder } };
}

export async function trashFsaFile(driver, fileId) {
  if (!driver.dirHandle) return { ok: false, error: "No workspace chosen" };
  if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, error: "Permission denied" };
  const resolved = await driver._resolveFileHandle(fileId);
  if (!resolved) return { ok: false, error: "File not found" };
  const trash = await driver._getTrashDir(true);
  const name = await driver._uniqueName(trash, resolved.name);
  await driver._moveHandle(resolved.handle, resolved.dir, trash, name);
  driver._setMeta(name, { trashed: true, trashedAt: Date.now() });
  driver._deleteMeta(fileId);
  driver._emitChange("change", name);
  return { ok: true };
}

export async function restoreFsaFile(driver, name) {
  if (!driver.dirHandle) return { ok: false, error: "No workspace chosen" };
  if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, error: "Permission denied" };
  const trash = await driver._getTrashDir(false);
  if (!trash) return { ok: false, error: "Trash folder not found" };
  const source = await trash.getFileHandle(name);
  const bytes = await (await source.getFile()).arrayBuffer();
  const target = await driver.dirHandle.getFileHandle(name, { create: true });
  await writeFsaHandle(target, bytes);
  await trash.removeEntry(name);
  driver._setMeta(name, { trashed: false, trashedAt: null });
  driver._emitChange("change", name);
  return { ok: true };
}

export async function deleteFsaFile(driver, name) {
  if (!driver.dirHandle) return { ok: false, error: "No workspace chosen" };
  if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, error: "Permission denied" };
  const trash = await driver._getTrashDir(false);
  // Deletion is idempotent, but only NotFound is a successful no-op.
  if (trash) await optionalFsaEntry(() => trash.removeEntry(name));
  await optionalFsaEntry(() => driver.dirHandle.removeEntry(name));
  driver._deleteMeta(name);
  driver._emitChange("delete", name);
  return { ok: true };
}

export async function emptyFsaTrash(driver) {
  let deletedCount = 0;
  try {
    if (!driver.dirHandle) return { ok: false, deletedCount };
    if (!(await driver._verifyPermission(driver.dirHandle, true))) return { ok: false, deletedCount, error: "Permission denied" };
    const trash = await driver._getTrashDir(false);
    if (!trash) return { ok: true, deletedCount };
    const names = [];
    for await (const [name, entry] of trash.entries()) if (entry.kind === "file") names.push(name);
    for (const name of names) {
      await trash.removeEntry(name);
      driver._deleteMeta(name);
      deletedCount += 1;
    }
    driver._emitChange("delete", ".trash");
    return { ok: true, deletedCount };
  } catch (error) {
    return { ...fsaFailure("empty-trash", error), deletedCount };
  }
}
