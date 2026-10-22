/**
 * Virtual IndexedDB Storage Driver.
 * Provides a virtual workspace backed by IndexedDB stores (`workspace_files`,
 * `workspace_meta`, `workspace_trash`) with zero-dependency in-memory Map fallback
 * for headless Node.js Vitest test suites.
 */

import { guessCategory } from "../workspace_storage.js";

const IDB_NAME = "voo_virtual_workspace_db";
const IDB_VERSION = 2;
const STORE_FILES = "workspace_files";
const STORE_TRASH = "workspace_trash";
const STORE_META = "workspace_meta";
const STORE_FOLDERS = "workspace_folders";
const ALLOWED_EXTENSIONS = new Set(["voo", "fig", "psd", "svg"]);

export class WebIdbWorkspaceDriver {
  constructor() {
    this.subscribers = new Set();
    this.dbPromise = null;
    // Pure in-memory Maps when indexedDB is undefined (Node.js test environment)
    this.memFiles = new Map();
    this.memFolders = new Map();
    this.memTrash = new Map();
    this.memMeta = new Map([
      ["config", { key: "config", type: "web-idb", path: "Virtual Workspace", isDefault: true, isConfigured: false }],
    ]);
  }

  static isAvailable() {
    return true; // Always available as universal fallback
  }

  getDriverType() {
    return "web-idb";
  }

  _openDatabase() {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(null);
    }

    this.dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_TRASH)) {
          db.createObjectStore(STORE_TRASH, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    return this.dbPromise;
  }

  async init() {
    const db = await this._openDatabase();
    if (!db) return this.getConfig();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).get("config");
      req.onsuccess = () => {
        const cfg = req.result || {
          key: "config",
          type: "web-idb",
          path: "Virtual Workspace",
          isDefault: true,
          isConfigured: false,
        };
        resolve(cfg);
      };
      req.onerror = () => {
        resolve({
          type: "web-idb",
          path: "Virtual Workspace",
          isDefault: true,
          isConfigured: false,
        });
      };
    });
  }

  async getConfig() {
    const db = await this._openDatabase();
    if (!db) {
      const cfg = this.memMeta.get("config");
      return {
        type: "web-idb",
        path: cfg?.path || "Virtual Workspace",
        isDefault: Boolean(cfg?.isDefault ?? true),
        isConfigured: Boolean(cfg?.isConfigured ?? false),
      };
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).get("config");
      req.onsuccess = () => {
        const cfg = req.result || {
          path: "Virtual Workspace",
          isDefault: true,
          isConfigured: false,
        };
        resolve({
          type: "web-idb",
          path: cfg.path,
          isDefault: Boolean(cfg.isDefault),
          isConfigured: Boolean(cfg.isConfigured),
        });
      };
      req.onerror = () =>
        resolve({
          type: "web-idb",
          path: "Virtual Workspace",
          isDefault: true,
          isConfigured: false,
        });
    });
  }

  async isConfigured() {
    const cfg = await this.getConfig();
    return cfg.isConfigured;
  }

  async chooseDirectory() {
    const config = {
      key: "config",
      type: "web-idb",
      path: "Virtual Workspace",
      isDefault: false,
      isConfigured: true,
    };
    await this._writeMeta("config", config);
    this._emitChange("create", config.path);
    return { ok: true, config };
  }

  async setDirectory(name) {
    const config = {
      key: "config",
      type: "web-idb",
      path: typeof name === "string" ? name : "Virtual Workspace",
      isDefault: false,
      isConfigured: true,
    };
    await this._writeMeta("config", config);
    this._emitChange("change", config.path);
    return { ok: true, config };
  }

  async _writeMeta(key, value) {
    const db = await this._openDatabase();
    if (!db) {
      this.memMeta.set(key, value);
      return;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, "readwrite");
      tx.objectStore(STORE_META).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  /** Project folders of the sandbox workspace, stored as their own records. */
  async listFolders() {
    const db = await this._openDatabase();
    if (!db) return Array.from(this.memFolders.values()).sort((x, y) => x.name.localeCompare(y.name));
    return new Promise((resolve) => {
      const req = db.transaction(STORE_FOLDERS, "readonly").objectStore(STORE_FOLDERS).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((x, y) => x.name.localeCompare(y.name)));
      req.onerror = () => resolve([]);
    });
  }

  /** Creates a sandbox project folder; a name clash is reported, never merged. */
  async createFolder(name) {
    const safeName = typeof name === "string" ? name.trim() : "";
    if (!safeName || safeName.startsWith(".") || /[/\\:*?"<>|]/.test(safeName)) {
      return { ok: false, error: "invalid_name" };
    }
    const folder = { id: safeName, name: safeName, path: safeName, createdAt: Date.now() };
    const db = await this._openDatabase();
    if (!db) {
      if (this.memFolders.has(safeName)) return { ok: false, error: "already_exists" };
      this.memFolders.set(safeName, folder);
      return { ok: true, folder };
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, "readwrite");
      const store = tx.objectStore(STORE_FOLDERS);
      const existing = store.get(safeName);
      existing.onsuccess = () => {
        if (existing.result) {
          resolve({ ok: false, error: "already_exists" });
          return;
        }
        store.put(folder);
      };
      tx.oncomplete = () => resolve({ ok: true, folder });
      tx.onerror = () => resolve({ ok: false, error: "failed" });
    });
  }

  async scanFiles(options = {}) {
    const db = await this._openDatabase();
    let files = [];
    let trash = [];

    if (!db) {
      files = Array.from(this.memFiles.values());
      trash = Array.from(this.memTrash.values());
    } else {
      const results = await new Promise((resolve) => {
        const tx = db.transaction([STORE_FILES, STORE_TRASH], "readonly");
        const fReq = tx.objectStore(STORE_FILES).getAll();
        const tReq = tx.objectStore(STORE_TRASH).getAll();
        tx.oncomplete = () => {
          resolve({ files: fReq.result || [], trash: tReq.result || [] });
        };
        tx.onerror = () => resolve({ files: [], trash: [] });
      });
      files = results.files;
      trash = results.trash;
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

    let pool = [];
    if (trashOnly) {
      pool = trash;
    } else if (includeTrashed) {
      pool = [...files, ...trash];
    } else {
      pool = files;
    }

    let filtered = pool.filter((item) => {
      if (!item.extension || !ALLOWED_EXTENSIONS.has(item.extension.toLowerCase())) {
        return false;
      }
      if (starredOnly && !item.starred) return false;
      if (category && category !== "all" && item.category !== category) return false;
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        return item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
      }
      return true;
    });

    // Strip raw bytes from scan summaries for performance and cleanliness
    filtered = filtered.map(({ bytes, ...rest }) => ({
      ...rest,
      category: rest.category || guessCategory(rest.name),
    }));

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

  async readFileBytes(fileId) {
    const db = await this._openDatabase();
    if (!db) {
      const rec = this.memFiles.get(fileId) || this.memTrash.get(fileId);
      if (!rec?.bytes) throw new Error(`File ${fileId} not found`);
      return rec.bytes;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_FILES, STORE_TRASH], "readonly");
      const fReq = tx.objectStore(STORE_FILES).get(fileId);
      const tReq = tx.objectStore(STORE_TRASH).get(fileId);

      tx.oncomplete = () => {
        const found = fReq.result || tReq.result;
        if (!found || !found.bytes) reject(new Error(`File ${fileId} not found`));
        else resolve(found.bytes);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async writeFileBytes(name, bytes, options = {}) {
    const extMatch = name.toLowerCase().match(/\.(voo|fig|psd|svg)$/);
    const extension = extMatch ? extMatch[1] : "voo";
    const formattedName = extMatch ? name : `${name}.voo`;
    const uintBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    const record = {
      id: formattedName,
      name: formattedName,
      path: null,
      extension,
      size: uintBytes.byteLength,
      bytes: uintBytes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      starred: false,
      trashed: false,
      trashedAt: null,
      category: options.category || guessCategory(formattedName),
      preview: options.preview || null,
    };

    const db = await this._openDatabase();
    if (!db) {
      this.memFiles.set(record.id, record);
      this._emitChange("create", record.id);
      const { bytes: _, ...summary } = record;
      return { ok: true, ...summary };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, "readwrite");
      tx.objectStore(STORE_FILES).put(record);
      tx.oncomplete = () => {
        this._emitChange("create", record.id);
        const { bytes: _, ...summary } = record;
        resolve({ ok: true, ...summary });
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async renameFile(id, newName) {
    const extMatch = newName.toLowerCase().match(/\.(voo|fig|psd|svg)$/);
    const formattedName = extMatch ? newName : `${newName}.voo`;

    const db = await this._openDatabase();
    if (!db) {
      const rec = this.memFiles.get(id);
      if (!rec) return { ok: false, error: "File not found" };
      if (this.memFiles.has(formattedName) && formattedName !== id) {
        return { ok: false, error: "A file with this name already exists" };
      }
      this.memFiles.delete(id);
      const updated = {
        ...rec,
        id: formattedName,
        name: formattedName,
        extension: formattedName.split(".").pop().toLowerCase(),
        updatedAt: Date.now(),
      };
      this.memFiles.set(formattedName, updated);
      this._emitChange("change", formattedName);
      return { ok: true, file: updated };
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, "readwrite");
      const store = tx.objectStore(STORE_FILES);
      const checkReq = store.get(formattedName);
      checkReq.onsuccess = () => {
        if (checkReq.result && formattedName !== id) {
          return resolve({ ok: false, error: "A file with this name already exists" });
        }
        const req = store.get(id);
        req.onsuccess = () => {
          const rec = req.result;
          if (!rec) return resolve({ ok: false, error: "File not found" });
          store.delete(id);
          const updated = {
            ...rec,
            id: formattedName,
            name: formattedName,
            extension: formattedName.split(".").pop().toLowerCase(),
            updatedAt: Date.now(),
          };
          store.put(updated);
          tx.oncomplete = () => {
            this._emitChange("change", formattedName);
            resolve({ ok: true, file: updated });
          };
          tx.onerror = () => resolve({ ok: false, error: tx.error?.message });
        };
        req.onerror = () => resolve({ ok: false, error: req.error?.message });
      };
      checkReq.onerror = () => resolve({ ok: false, error: checkReq.error?.message });
    });
  }

  async moveToTrash(id) {
    const db = await this._openDatabase();
    if (!db) {
      const rec = this.memFiles.get(id);
      if (!rec) return { ok: false, error: "File not found" };
      this.memFiles.delete(id);
      this.memTrash.set(id, { ...rec, trashed: true, trashedAt: Date.now() });
      this._emitChange("change", id);
      return { ok: true };
    }

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_FILES, STORE_TRASH], "readwrite");
      const fStore = tx.objectStore(STORE_FILES);
      const tStore = tx.objectStore(STORE_TRASH);
      const req = fStore.get(id);

      req.onsuccess = () => {
        const rec = req.result;
        if (!rec) return resolve({ ok: false, error: "File not found" });
        fStore.delete(id);
        tStore.put({ ...rec, trashed: true, trashedAt: Date.now() });
        tx.oncomplete = () => {
          this._emitChange("change", id);
          resolve({ ok: true });
        };
        tx.onerror = () => resolve({ ok: false, error: tx.error?.message });
      };
      req.onerror = () => resolve({ ok: false, error: req.error?.message });
    });
  }

  async restoreFromTrash(id) {
    const db = await this._openDatabase();
    if (!db) {
      const rec = this.memTrash.get(id);
      if (!rec) return { ok: false, error: "File not found in trash" };
      this.memTrash.delete(id);
      this.memFiles.set(id, { ...rec, trashed: false, trashedAt: null, updatedAt: Date.now() });
      this._emitChange("change", id);
      return { ok: true };
    }

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_FILES, STORE_TRASH], "readwrite");
      const fStore = tx.objectStore(STORE_FILES);
      const tStore = tx.objectStore(STORE_TRASH);
      const req = tStore.get(id);

      req.onsuccess = () => {
        const rec = req.result;
        if (!rec) return resolve({ ok: false, error: "File not found in trash" });
        tStore.delete(id);
        fStore.put({ ...rec, trashed: false, trashedAt: null, updatedAt: Date.now() });
        tx.oncomplete = () => {
          this._emitChange("change", id);
          resolve({ ok: true });
        };
        tx.onerror = () => resolve({ ok: false, error: tx.error?.message });
      };
      req.onerror = () => resolve({ ok: false, error: req.error?.message });
    });
  }

  async deletePermanently(id) {
    const db = await this._openDatabase();
    if (!db) {
      this.memFiles.delete(id);
      this.memTrash.delete(id);
      this._emitChange("delete", id);
      return { ok: true };
    }

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_FILES, STORE_TRASH], "readwrite");
      tx.objectStore(STORE_FILES).delete(id);
      tx.objectStore(STORE_TRASH).delete(id);
      tx.oncomplete = () => {
        this._emitChange("delete", id);
        resolve({ ok: true });
      };
      tx.onerror = () => resolve({ ok: false, error: tx.error?.message });
    });
  }

  async emptyTrash() {
    const db = await this._openDatabase();
    if (!db) {
      const count = this.memTrash.size;
      this.memTrash.clear();
      this._emitChange("delete", ".trash");
      return { ok: true, deletedCount: count };
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TRASH, "readwrite");
      const store = tx.objectStore(STORE_TRASH);
      const cReq = store.count();
      cReq.onsuccess = () => {
        const count = cReq.result || 0;
        store.clear();
        tx.oncomplete = () => {
          this._emitChange("delete", ".trash");
          resolve({ ok: true, deletedCount: count });
        };
        tx.onerror = () => resolve({ ok: false, error: tx.error?.message, deletedCount: 0 });
      };
      cReq.onerror = () => resolve({ ok: false, error: cReq.error?.message, deletedCount: 0 });
    });
  }

  async toggleStar(id) {
    const db = await this._openDatabase();
    if (!db) {
      const rec = this.memFiles.get(id);
      if (!rec) return { ok: false, starred: false };
      rec.starred = !rec.starred;
      return { ok: true, starred: rec.starred };
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, "readwrite");
      const store = tx.objectStore(STORE_FILES);
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec) return resolve({ ok: false, starred: false });
        rec.starred = !rec.starred;
        store.put(rec);
        tx.oncomplete = () => resolve({ ok: true, starred: rec.starred });
        tx.onerror = () => resolve({ ok: false, starred: false });
      };
      req.onerror = () => resolve({ ok: false, starred: false });
    });
  }

  async revealInFinder() {
    return false;
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
