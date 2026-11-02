/**
 * Chromium File System Access API Driver.
 * Mounts physical folder handles using showDirectoryPicker(), persists the handle
 * in IndexedDB, manages .trash/ subfolder emulation, and monitors file iteration.
 */

import { parseWorkspaceRelativeId } from "../workspace_storage.js";

import { fsaFailure, fsaRead, fsaResult, isFsaError, optionalFsaEntry, reportFsaError, writeFsaHandle } from "./fsa-diagnostics.js";
import { scanFsaFiles } from "./fsa-scanning.js";
import { readFsaFile, moveFsaFile, writeFsaFile, renameFsaFile, trashFsaFile, restoreFsaFile, deleteFsaFile, emptyFsaTrash } from "./fsa-file-operations.js";

import { loadFsaHandle, saveFsaHandle } from "./fsa-handle-store.js";
const META_STORAGE_KEY = "voo_workspace_meta_fsa";

export class WebFsaWorkspaceDriver {
  constructor() {
    this.dirHandle = null;
    this.subscribers = new Set();
    this.permissionState = "prompt"; // "granted" | "prompt" | "denied"
  }

  static isAvailable() {
    return Boolean(
      typeof window !== "undefined" &&
      typeof window.showDirectoryPicker === "function"
    );
  }

  getDriverType() {
    return "web-fsa";
  }

  async _saveStoredHandle(handle) { return saveFsaHandle(handle); }

  async _loadStoredHandle() { return loadFsaHandle(); }

  _loadMetadata() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(META_STORAGE_KEY);
        const value = raw ? JSON.parse(raw) : {};
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError("Invalid workspace metadata");
        return value;
      }
    } catch (error) { reportFsaError("read-metadata", error); }
    return {};
  }

  _saveMetadata(meta) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
      }
    } catch (error) { reportFsaError("write-metadata", error); }
  }

  _setMeta(name, patch) {
    const meta = this._loadMetadata();
    meta[name] = { ...(meta[name] || {}), ...patch };
    this._saveMetadata(meta);
  }

  _deleteMeta(name) {
    const meta = this._loadMetadata();
    delete meta[name];
    this._saveMetadata(meta);
  }

  _migrateMeta(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    const meta = this._loadMetadata();
    if (!meta[oldId]) return;
    meta[newId] = meta[oldId];
    delete meta[oldId];
    this._saveMetadata(meta);
  }

  async _verifyPermission(handle, readWrite = true) {
    if (!handle) return false;
    const opts = { mode: readWrite ? "readwrite" : "read" };
    try {
      if (typeof handle.queryPermission === "function") {
        const q = await handle.queryPermission(opts);
        if (q === "granted") {
          this.permissionState = "granted";
          return true;
        }
        if (q === "prompt" && typeof handle.requestPermission === "function") {
          const r = await handle.requestPermission(opts);
          if (r === "granted") {
            this.permissionState = "granted";
            return true;
          }
        }
      }
    } catch (error) { reportFsaError("check-permission", error); }
    this.permissionState = "denied";
    return false;
  }

  async init() {
    if (!this.dirHandle) {
      this.dirHandle = await this._loadStoredHandle();
    }
    if (this.dirHandle && typeof this.dirHandle.queryPermission === "function") {
      try {
        const state = await this.dirHandle.queryPermission({ mode: "readwrite" });
        this.permissionState = state;
      } catch (error) {
        reportFsaError("query-permission", error);
        this.permissionState = "prompt";
      }
    }
    return this.getConfig();
  }

  async getConfig() {
    return {
      type: "web-fsa",
      path: this.dirHandle ? this.dirHandle.name : "Browser Workspace",
      isDefault: !this.dirHandle,
      isConfigured: Boolean(this.dirHandle && this.permissionState === "granted"),
    };
  }

  async isConfigured() {
    return Boolean(this.dirHandle && this.permissionState === "granted");
  }

  async chooseDirectory() {
    if (!WebFsaWorkspaceDriver.isAvailable()) {
      return { ok: false, error: "File System Access API unsupported" };
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      this.dirHandle = handle;
      this.permissionState = "granted";
      await this._saveStoredHandle(handle);
      this._emitChange("create", handle.name);
      return {
        ok: true,
        config: {
          type: "web-fsa",
          path: handle.name,
          isDefault: false,
          isConfigured: true,
        },
      };
    } catch (err) {
      if (isFsaError(err, "AbortError")) {
        return { ok: false, canceled: true };
      }
      return fsaFailure("choose-directory", err);
    }
  }

  async setDirectory(handle) {
    if (!handle || handle.kind !== "directory") {
      return { ok: false, error: "Invalid directory handle" };
    }
    this.dirHandle = handle;
    const hasPerm = await this._verifyPermission(handle, true);
    if (hasPerm) this.permissionState = "granted";
    await this._saveStoredHandle(handle);
    return {
      ok: true,
      config: {
        type: "web-fsa",
        path: handle.name,
        isDefault: false,
        isConfigured: this.permissionState === "granted",
      },
    };
  }

  /** Project folders: visible subdirectories of the chosen folder. */
  async listFolders() {
    if (!this.dirHandle) return [];
    return fsaRead("list-folders", async () => {
      const folders = [];
      for await (const [name, entry] of this.dirHandle.entries()) {
        if (entry.kind !== "directory" || name.startsWith(".") || name.startsWith("__voo_")) continue;
        folders.push({ id: name, name, path: name });
      }
      return folders.sort((x, y) => x.name.localeCompare(y.name));
    });
  }

  /** Creates a project folder; a name clash is reported, never merged. */
  async createFolder(name) {
    if (!this.dirHandle) return { ok: false, error: "No workspace directory chosen" };
    const safeName = typeof name === "string" ? name.trim() : "";
    if (!safeName || safeName.startsWith(".") || /[/\\:*?"<>|]/.test(safeName)) {
      return { ok: false, error: "invalid_name" };
    }
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, error: "permission_denied" };
    return fsaResult("create-folder", async () => {
      if (await optionalFsaEntry(() => this.dirHandle.getDirectoryHandle(safeName))) {
        return { ok: false, error: "already_exists" };
      }
      await this.dirHandle.getDirectoryHandle(safeName, { create: true });
      return { ok: true, folder: { id: safeName, name: safeName, path: safeName } };
    });
  }

  /** Removes a project directory and its contents from the chosen workspace. */
  async deleteFolder(name) {
    if (!this.dirHandle) return { ok: false, error: "No workspace directory chosen" };
    const safeName = typeof name === "string" ? name.trim() : "";
    if (!safeName || safeName.startsWith(".") || safeName.startsWith("__voo_") || /[/\\:*?\"<>|]/.test(safeName)) {
      return { ok: false, error: "invalid_name" };
    }
    if (!(await this._verifyPermission(this.dirHandle, true))) return { ok: false, error: "permission_denied" };
    try {
      await this.dirHandle.removeEntry(safeName, { recursive: true });
      return { ok: true };
    } catch (err) {
      return isFsaError(err, "NotFoundError") ? { ok: false, error: "directory_not_found" } : fsaFailure("delete-folder", err);
    }
  }

  async _getTrashDir(create = false) {
    if (!this.dirHandle) return null;
    const lookup = () => this.dirHandle.getDirectoryHandle(".trash", { create });
    return create ? lookup() : optionalFsaEntry(lookup);
  }

  async _getProjectDir(folderName, create = false) {
    if (!this.dirHandle) return null;
    if (!folderName) return this.dirHandle;
    const lookup = () => this.dirHandle.getDirectoryHandle(folderName, { create });
    return create ? lookup() : optionalFsaEntry(lookup);
  }

  async _resolveFileHandle(fileId) {
    const { folder, name } = parseWorkspaceRelativeId(fileId);
    const dir = await this._getProjectDir(folder, false);
    if (!dir || !name) return null;
    const handle = await optionalFsaEntry(() => dir.getFileHandle(name));
    return handle ? { dir, name, folder, handle } : null;
  }

  async _moveHandle(fileHandle, sourceDir, destDir, targetName) {
    if (typeof fileHandle.move === "function") {
      try {
        await fileHandle.move(destDir, targetName);
        return;
      } catch (error) {
        if (!isFsaError(error, "TypeError") && !isFsaError(error, "NotSupportedError")) throw error;
        // The destination form is unsupported; copy and delete instead.
      }
    }
    const file = await fileHandle.getFile();
    const bytes = await file.arrayBuffer();
    const next = await destDir.getFileHandle(targetName, { create: true });
    await writeFsaHandle(next, bytes);
    await sourceDir.removeEntry(fileHandle.name);
  }

  async _uniqueName(dir, baseName) {
    if (!(await optionalFsaEntry(() => dir.getFileHandle(baseName)))) return baseName;
    const match = baseName.match(/^(.*)\.([a-zA-Z0-9]+)$/);
    const stem = match ? match[1] : baseName;
    const ext = match ? match[2] : "voo";
    let n = 2;
    while (true) {
      const candidate = `${stem}-${n}.${ext}`;
      if (!(await optionalFsaEntry(() => dir.getFileHandle(candidate)))) return candidate;
      n += 1;
    }
  }

  async scanFiles(options = {}) {
    return fsaRead("scan-files", () => scanFsaFiles(this, options));
  }

  async readFileBytes(fileIdOrName) {
    return fsaRead("read-file", () => readFsaFile(this, fileIdOrName));
  }

  async moveToFolder(fileIdOrName, folderName) {
    return fsaResult("move-file", () => moveFsaFile(this, fileIdOrName, folderName));
  }

  async writeFileBytes(name, bytes, options = {}) {
    return fsaRead("write-file", () => writeFsaFile(this, name, bytes, options));
  }

  async renameFile(fileId, newName) {
    return fsaResult("rename-file", () => renameFsaFile(this, fileId, newName));
  }

  async moveToTrash(fileId) {
    return fsaResult("trash-file", () => trashFsaFile(this, fileId));
  }

  async restoreFromTrash(name) {
    return fsaResult("restore-file", () => restoreFsaFile(this, name));
  }

  async deletePermanently(name) {
    return fsaResult("delete-file", () => deleteFsaFile(this, name));
  }

  async emptyTrash() {
    return fsaResult("empty-trash", () => emptyFsaTrash(this));
  }

  async toggleStar(name) {
    const meta = this._loadMetadata();
    const next = !meta[name]?.starred;
    this._setMeta(name, { starred: next });
    return { ok: true, starred: next };
  }

  async revealInFinder() {
    return false; // Browser sandbox restriction
  }

  _emitChange(type, fileId) {
    for (const fn of this.subscribers) {
      try {
        fn({ type, fileId });
      } catch (error) { reportFsaError("notify-subscriber", error); }
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}
