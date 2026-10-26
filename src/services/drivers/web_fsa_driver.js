/**
 * Chromium File System Access API Driver.
 * Mounts physical folder handles using showDirectoryPicker(), persists the handle
 * in IndexedDB, manages .trash/ subfolder emulation, and monitors file iteration.
 */

import {
  guessCategory,
  parseWorkspaceRelativeId,
  workspaceRelativeId,
} from "../workspace_storage.js";

const FSA_DB_NAME = "voo_fsa_workspace";
const FSA_STORE_HANDLES = "handles";
const FSA_HANDLE_KEY = "active_dir_handle";
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

  _openFsaDb() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = indexedDB.open(FSA_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FSA_STORE_HANDLES)) {
          db.createObjectStore(FSA_STORE_HANDLES);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async _saveStoredHandle(handle) {
    const db = await this._openFsaDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(FSA_STORE_HANDLES, "readwrite");
      tx.objectStore(FSA_STORE_HANDLES).put(handle, FSA_HANDLE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async _loadStoredHandle() {
    const db = await this._openFsaDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(FSA_STORE_HANDLES, "readonly");
      const req = tx.objectStore(FSA_STORE_HANDLES).get(FSA_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  _loadMetadata() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(META_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      }
    } catch {}
    return {};
  }

  _saveMetadata(meta) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
      }
    } catch {}
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
    } catch {}
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
      } catch {
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
      if (err.name === "AbortError") {
        return { ok: false, canceled: true };
      }
      return { ok: false, error: err.message };
    }
  }

  async setDirectory(handle) {
    if (!handle || handle.kind !== "directory") {
      return { ok: false, error: "Invalid directory handle" };
    }
    this.dirHandle = handle;
    const hasPerm = await this._verifyPermission(handle, true);
    this.permissionState = hasPerm ? "granted" : "prompt";
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
    const folders = [];
    for await (const [name, entry] of this.dirHandle.entries()) {
      if (entry.kind !== "directory" || name.startsWith(".") || name.startsWith("__voo_")) continue;
      folders.push({ id: name, name, path: name });
    }
    return folders.sort((x, y) => x.name.localeCompare(y.name));
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
    try {
      await this.dirHandle.getDirectoryHandle(safeName);
      return { ok: false, error: "already_exists" };
    } catch {
      // Not found is the expected case: the name is free.
    }
    await this.dirHandle.getDirectoryHandle(safeName, { create: true });
    return { ok: true, folder: { id: safeName, name: safeName, path: safeName } };
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
      return { ok: false, error: err.name === "NotFoundError" ? "directory_not_found" : err.message || "failed" };
    }
  }

  async _getTrashDir(create = false) {
    if (!this.dirHandle) return null;
    try {
      return await this.dirHandle.getDirectoryHandle(".trash", { create });
    } catch {
      return null;
    }
  }

  async _getProjectDir(folderName, create = false) {
    if (!this.dirHandle) return null;
    if (!folderName) return this.dirHandle;
    try {
      return await this.dirHandle.getDirectoryHandle(folderName, { create });
    } catch {
      return null;
    }
  }

  async _resolveFileHandle(fileId) {
    const { folder, name } = parseWorkspaceRelativeId(fileId);
    const dir = await this._getProjectDir(folder, false);
    if (!dir || !name) return null;
    try {
      return { dir, name, folder, handle: await dir.getFileHandle(name) };
    } catch {
      return null;
    }
  }

  async _moveHandle(fileHandle, sourceDir, destDir, targetName) {
    if (typeof fileHandle.move === "function") {
      try {
        await fileHandle.move(destDir, targetName);
        return;
      } catch {
        // Fall through to copy + delete when the destination form is unsupported.
      }
    }
    const file = await fileHandle.getFile();
    const bytes = await file.arrayBuffer();
    const next = await destDir.getFileHandle(targetName, { create: true });
    const writable = await next.createWritable();
    await writable.write(bytes);
    await writable.close();
    await sourceDir.removeEntry(fileHandle.name);
  }

  async _uniqueName(dir, baseName) {
    try {
      await dir.getFileHandle(baseName);
    } catch {
      return baseName;
    }
    const match = baseName.match(/^(.*)\.([a-zA-Z0-9]+)$/);
    const stem = match ? match[1] : baseName;
    const ext = match ? match[2] : "voo";
    let n = 2;
    while (true) {
      const candidate = `${stem}-${n}.${ext}`;
      try {
        await dir.getFileHandle(candidate);
        n += 1;
      } catch {
        return candidate;
      }
    }
  }

  async _scanDirFiles(dirHandle, folder, meta, files) {
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind !== "file") continue;
      const match = name.toLowerCase().match(/\.(voo|fig|psd|svg)$/);
      if (!match) continue;
      try {
        const f = await entry.getFile();
        const id = workspaceRelativeId(name, folder);
        const m = meta[id] || meta[name] || {};
        files.push({
          id,
          name,
          path: null,
          folder,
          extension: match[1],
          size: f.size,
          updatedAt: f.lastModified,
          createdAt: f.lastModified,
          starred: Boolean(m.starred),
          trashed: false,
          trashedAt: null,
          category: m.category || guessCategory(name),
          preview: m.preview || null,
        });
      } catch {}
    }
  }

  async scanFiles(options = {}) {
    if (!this.dirHandle) return [];
    const hasPerm = await this._verifyPermission(this.dirHandle, false);
    if (!hasPerm) return [];

    const meta = this._loadMetadata();
    const files = [];

    // 1. Root files, then one level of project folders.
    try {
      await this._scanDirFiles(this.dirHandle, null, meta, files);
      for await (const [name, entry] of this.dirHandle.entries()) {
        if (entry.kind !== "directory" || name.startsWith(".") || name.startsWith("__voo_")) continue;
        await this._scanDirFiles(entry, name, meta, files);
      }
    } catch (err) {
      console.warn("[WebFsaDriver] Failed to iterate workspace folder:", err);
    }

    // 2. Scan virtual .trash/ directory
    if (options.includeTrashed || options.trashOnly) {
      const trashDir = await this._getTrashDir(false);
      if (trashDir) {
        try {
          for await (const [name, entry] of trashDir.entries()) {
            if (entry.kind === "file") {
              const match = name.toLowerCase().match(/\.(voo|fig|psd|svg)$/);
              if (match) {
                try {
                  const f = await entry.getFile();
                  const m = meta[name] || {};
                  files.push({
                    id: name,
                    name,
                    path: null,
                    extension: match[1],
                    size: f.size,
                    updatedAt: f.lastModified,
                    createdAt: f.lastModified,
                    starred: Boolean(m.starred),
                    trashed: true,
                    trashedAt: m.trashedAt || f.lastModified,
                    category: m.category || guessCategory(name),
                    preview: m.preview || null,
                  });
                } catch {}
              }
            }
          }
        } catch {}
      }
    }

    const {
      trashOnly = false,
      includeTrashed = false,
      starredOnly = false,
      category = null,
      search = "",
      sortBy = "updatedAt",
      sortOrder = "desc",
    } = options;

    let filtered = files.filter((item) => {
      if (trashOnly) return item.trashed;
      if (!includeTrashed && item.trashed) return false;
      if (starredOnly && !item.starred) return false;
      if (category && category !== "all" && item.category !== category) return false;
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        return item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
      }
      return true;
    });

    filtered.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (sortBy === "name") {
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      valA = valA || 0;
      valB = valB || 0;
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return filtered;
  }

  async readFileBytes(fileIdOrName) {
    if (!this.dirHandle) throw new Error("No workspace directory chosen");
    await this._verifyPermission(this.dirHandle, false);

    const resolved = await this._resolveFileHandle(fileIdOrName);
    let fileEntry = resolved?.handle || null;
    if (!fileEntry) {
      const { name } = parseWorkspaceRelativeId(fileIdOrName);
      const trashDir = await this._getTrashDir(false);
      if (trashDir && name) {
        try {
          fileEntry = await trashDir.getFileHandle(name);
        } catch {}
      }
    }
    if (!fileEntry) throw new Error(`File ${fileIdOrName} not found`);
    const file = await fileEntry.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async moveToFolder(fileIdOrName, folderName) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, error: "permission_denied" };

    const safeFolder =
      folderName == null || folderName === ""
        ? null
        : String(folderName).trim();
    if (
      folderName &&
      (!safeFolder || safeFolder.startsWith(".") || /[/\\:*?"<>|]/.test(safeFolder))
    ) {
      return { ok: false, error: "invalid_name" };
    }

    const resolved = await this._resolveFileHandle(fileIdOrName);
    if (!resolved) return { ok: false, error: "file_not_found" };
    if ((resolved.folder || null) === safeFolder) {
      return {
        ok: true,
        file: {
          id: workspaceRelativeId(resolved.name, safeFolder),
          name: resolved.name,
          folder: safeFolder,
        },
      };
    }

    const destDir = await this._getProjectDir(safeFolder, Boolean(safeFolder));
    if (!destDir) return { ok: false, error: "folder_not_found" };

    try {
      const targetName = await this._uniqueName(destDir, resolved.name);
      await this._moveHandle(resolved.handle, resolved.dir, destDir, targetName);
      const nextId = workspaceRelativeId(targetName, safeFolder);
      this._migrateMeta(fileIdOrName, nextId);
      this._migrateMeta(resolved.name, nextId);
      this._emitChange("change", nextId);
      return {
        ok: true,
        file: { id: nextId, name: targetName, folder: safeFolder },
      };
    } catch (err) {
      return { ok: false, error: err.message || "move_failed" };
    }
  }

  async writeFileBytes(name, bytes, options = {}) {
    if (!this.dirHandle) throw new Error("No workspace directory chosen");
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) {
      return { ok: false, error: "Permission denied" };
    }

    const safeName = name.includes(".") ? name : `${name}.voo`;
    const fileHandle = await this.dirHandle.getFileHandle(safeName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();

    const file = await fileHandle.getFile();
    this._setMeta(safeName, {
      category: options.category || guessCategory(safeName),
      preview: options.preview || null,
    });

    const fileInfo = {
      ok: true,
      id: safeName,
      name: safeName,
      path: null,
      extension: safeName.split(".").pop().toLowerCase(),
      size: file.size,
      updatedAt: file.lastModified,
      createdAt: file.lastModified,
      starred: false,
      trashed: false,
      trashedAt: null,
      category: options.category || guessCategory(safeName),
      preview: options.preview || null,
    };
    this._emitChange("create", safeName);
    return fileInfo;
  }

  async renameFile(fileId, newName) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, error: "Permission denied" };

    const resolved = await this._resolveFileHandle(fileId);
    if (!resolved) return { ok: false, error: "File not found" };
    const targetName = newName.includes(".") ? newName : `${newName}.voo`;
    try {
      if (targetName !== resolved.name) {
        try {
          await resolved.dir.getFileHandle(targetName);
          return { ok: false, error: "A file with this name already exists" };
        } catch {
          // Free name.
        }
      }
      await this._moveHandle(resolved.handle, resolved.dir, resolved.dir, targetName);
      const nextId = workspaceRelativeId(targetName, resolved.folder);
      this._migrateMeta(fileId, nextId);
      this._emitChange("change", nextId);
      return {
        ok: true,
        newName: targetName,
        file: { id: nextId, name: targetName, folder: resolved.folder },
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async moveToTrash(fileId) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, error: "Permission denied" };

    try {
      const resolved = await this._resolveFileHandle(fileId);
      if (!resolved) return { ok: false, error: "File not found" };
      const trashDir = await this._getTrashDir(true);
      const trashName = await this._uniqueName(trashDir, resolved.name);
      await this._moveHandle(resolved.handle, resolved.dir, trashDir, trashName);
      this._setMeta(trashName, { trashed: true, trashedAt: Date.now() });
      this._deleteMeta(fileId);
      this._emitChange("change", trashName);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async restoreFromTrash(name) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, error: "Permission denied" };

    try {
      const trashDir = await this._getTrashDir(false);
      if (!trashDir) return { ok: false, error: "Trash folder not found" };

      const trashFileHandle = await trashDir.getFileHandle(name);
      const file = await trashFileHandle.getFile();
      const bytes = await file.arrayBuffer();

      const restoredHandle = await this.dirHandle.getFileHandle(name, { create: true });
      const writable = await restoredHandle.createWritable();
      await writable.write(bytes);
      await writable.close();

      await trashDir.removeEntry(name);
      this._setMeta(name, { trashed: false, trashedAt: null });
      this._emitChange("change", name);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async deletePermanently(name) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, error: "Permission denied" };

    try {
      const trashDir = await this._getTrashDir(false);
      if (trashDir) {
        try {
          await trashDir.removeEntry(name);
        } catch {}
      }
      try {
        await this.dirHandle.removeEntry(name);
      } catch {}

      this._deleteMeta(name);
      this._emitChange("delete", name);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async emptyTrash() {
    if (!this.dirHandle) return { ok: false, deletedCount: 0 };
    const hasPerm = await this._verifyPermission(this.dirHandle, true);
    if (!hasPerm) return { ok: false, deletedCount: 0, error: "Permission denied" };

    const trashDir = await this._getTrashDir(false);
    if (!trashDir) return { ok: true, deletedCount: 0 };

    let count = 0;
    try {
      const toRemove = [];
      for await (const [name, entry] of trashDir.entries()) {
        if (entry.kind === "file") {
          toRemove.push(name);
        }
      }
      for (const name of toRemove) {
        await trashDir.removeEntry(name);
        this._deleteMeta(name);
        count++;
      }
      this._emitChange("delete", ".trash");
      return { ok: true, deletedCount: count };
    } catch (err) {
      return { ok: false, error: err.message, deletedCount: count };
    }
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
      } catch {}
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}
