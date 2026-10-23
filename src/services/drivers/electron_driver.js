/**
 * Desktop Electron Storage Driver.
 * Connects to Electron main process via window.electronAPI.workspace or window.vooDesktop.workspace IPC.
 */

import { guessCategory } from "../workspace_storage.js";

const META_STORAGE_KEY = "voo_workspace_meta_electron";

export class ElectronWorkspaceDriver {
  constructor() {
    this.metaMem = new Map();
  }

  static isAvailable() {
    return Boolean(
      typeof window !== "undefined" &&
      (window.electronAPI?.workspace || window.vooDesktop?.workspace)
    );
  }

  get bridge() {
    if (typeof window === "undefined") return null;
    return window.electronAPI?.workspace || window.vooDesktop?.workspace || null;
  }

  getDriverType() {
    return "electron";
  }

  _loadMetadata() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(META_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      }
    } catch {}
    const obj = {};
    for (const [k, v] of this.metaMem.entries()) obj[k] = v;
    return obj;
  }

  _saveMetadata(meta) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
      }
    } catch {}
    this.metaMem.clear();
    for (const [k, v] of Object.entries(meta)) this.metaMem.set(k, v);
  }

  _getMeta(id) {
    const meta = this._loadMetadata();
    return meta[id] || {};
  }

  _setMeta(id, patch) {
    const meta = this._loadMetadata();
    meta[id] = { ...(meta[id] || {}), ...patch };
    this._saveMetadata(meta);
  }

  _migrateMeta(oldId, newId) {
    const meta = this._loadMetadata();
    if (meta[oldId]) {
      meta[newId] = meta[oldId];
      delete meta[oldId];
      this._saveMetadata(meta);
    }
  }

  _deleteMeta(id) {
    const meta = this._loadMetadata();
    if (meta[id]) {
      delete meta[id];
      this._saveMetadata(meta);
    }
  }

  async init() {
    return this.getConfig();
  }

  async getConfig() {
    if (!this.bridge) {
      return { type: "electron", path: "", isDefault: true, isConfigured: false };
    }
    const res = await this.bridge.getConfig();
    return {
      type: "electron",
      path: res?.path || "",
      isDefault: Boolean(res?.isDefault),
      isConfigured: Boolean(res?.isConfigured),
    };
  }

  async isConfigured() {
    const cfg = await this.getConfig();
    return cfg.isConfigured;
  }

  async chooseDirectory() {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable" };
    const res = await this.bridge.chooseDirectory();
    if (res.canceled || !res.path) {
      return { ok: false, canceled: true };
    }
    const setRes = await this.bridge.setDirectory(res.path);
    return {
      ok: Boolean(setRes.ok),
      config: {
        type: "electron",
        path: res.path,
        isDefault: false,
        isConfigured: true,
      },
    };
  }

  async setDirectory(dirPath) {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable" };
    const res = await this.bridge.setDirectory(dirPath);
    return {
      ok: Boolean(res.ok),
      config: {
        type: "electron",
        path: dirPath,
        isDefault: false,
        isConfigured: true,
      },
      error: res.error,
    };
  }

  /** Project folders directly under the workspace root. */
  async listFolders() {
    if (!this.bridge?.listFolders) return [];
    const res = await this.bridge.listFolders();
    return res?.ok ? res.folders : [];
  }

  /** Creates a project folder; resolves with { ok, folder?, error? }. */
  async createFolder(name) {
    if (!this.bridge?.createFolder) return { ok: false, error: "unsupported" };
    const res = await this.bridge.createFolder(name);
    return res?.ok ? { ok: true, folder: res.folder } : { ok: false, error: res?.error || "failed" };
  }

  /** Moves a file into a project folder, or back to the root when folderName is null. */
  async moveToFolder(fileIdOrPath, folderName) {
    if (!this.bridge?.moveToFolder) return { ok: false, error: "unsupported" };
    const res = await this.bridge.moveToFolder(fileIdOrPath, folderName);
    if (res?.ok && res.file?.id && res.previousPath) {
      this._migrateMeta(res.previousPath, res.file.id);
      this._migrateMeta(fileIdOrPath, res.file.id);
    }
    return res?.ok
      ? { ok: true, file: res.file }
      : { ok: false, error: res?.error || "failed" };
  }

  async scanFiles(options = {}) {
    if (!this.bridge) return [];
    const res = await this.bridge.scanFiles();
    const diskFiles = res?.files || [];
    const metaMap = this._loadMetadata();

    const merged = diskFiles.map((f) => {
      const m = metaMap[f.id] || metaMap[f.path] || {};
      return {
        id: f.id,
        name: f.name,
        path: f.path,
        folder: f.folder ?? null,
        extension: f.extension,
        size: f.size || 0,
        updatedAt: f.updatedAt || Date.now(),
        createdAt: f.createdAt || f.updatedAt || Date.now(),
        starred: Boolean(m.starred ?? f.starred),
        trashed: Boolean(f.trashed || m.trashed),
        trashedAt: f.trashedAt || m.trashedAt || null,
        category: m.category || f.category || guessCategory(f.name),
        preview: m.preview || f.preview || null,
        isDraft: Boolean(f.isDraft),
      };
    });

    const {
      includeTrashed = false,
      trashOnly = false,
      starredOnly = false,
      category = null,
      search = "",
      sortBy = "updatedAt",
      sortOrder = "desc",
    } = options;

    let filtered = merged.filter((item) => {
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

  async readFileBytes(fileIdOrPath) {
    if (!this.bridge) throw new Error("Electron bridge unavailable");
    const res = await this.bridge.readFileBytes(fileIdOrPath);
    if (!res.ok || !res.bytes) throw new Error(res.error || "Failed to read file bytes");
    return new Uint8Array(res.bytes.buffer, res.bytes.byteOffset, res.bytes.byteLength);
  }

  async writeFileBytes(name, bytes, options = {}) {
    if (!this.bridge) throw new Error("Electron bridge unavailable");
    const res = await this.bridge.writeFileBytes(name, bytes, options);
    if (!res.ok || !res.file) throw new Error(res.error || "Failed to write file");
    this._setMeta(res.file.id, {
      category: options.category || guessCategory(name),
      preview: options.preview || null,
    });
    return { ok: true, ...res.file };
  }

  async renameFile(fileIdOrPath, newName) {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable" };
    const res = await this.bridge.renameFile(fileIdOrPath, newName);
    if (res.ok && res.newPath) {
      this._migrateMeta(fileIdOrPath, res.newPath);
    }
    return res;
  }

  async moveToTrash(fileIdOrPath) {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable" };
    const res = await this.bridge.moveToTrash(fileIdOrPath);
    if (res.ok) {
      this._setMeta(fileIdOrPath, { trashed: true, trashedAt: Date.now() });
    }
    return res;
  }

  async restoreFromTrash(fileIdOrPath) {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable" };
    const res = await this.bridge.restoreFromTrash(fileIdOrPath);
    if (res.ok) {
      this._setMeta(fileIdOrPath, { trashed: false, trashedAt: null });
    }
    return res;
  }

  async deletePermanently(fileIdOrPath) {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable" };
    const res = await this.bridge.deletePermanently(fileIdOrPath);
    if (res.ok) {
      this._deleteMeta(fileIdOrPath);
    }
    return res;
  }

  async emptyTrash() {
    if (!this.bridge) return { ok: false, error: "Electron bridge unavailable", deletedCount: 0 };
    return this.bridge.emptyTrash();
  }

  async toggleStar(fileIdOrPath) {
    const meta = this._getMeta(fileIdOrPath);
    const next = !meta.starred;
    this._setMeta(fileIdOrPath, { starred: next });
    return { ok: true, starred: next };
  }

  async revealInFinder(fileIdOrPath) {
    if (!this.bridge?.revealInFinder) return false;
    return this.bridge.revealInFinder(fileIdOrPath);
  }

  subscribe(callback) {
    if (!this.bridge?.onChanged) return () => {};
    return this.bridge.onChanged(callback);
  }
}
