# Handoff Report: Frontend Unified Storage Engine & Driver Architecture (Milestone 1)

## 1. Observation

### 1.1 Existing Storage Implementation (`src/storage/db.js`)
Inspection of `src/storage/db.js` (lines 1–45, 150–180) reveals:
- Database configuration: `DB_NAME = "voo_design_db"`, `DB_VERSION = 1`, object stores `assets` and `documents`.
- In-memory fallback: When `typeof indexedDB === "undefined"` (e.g. Node.js unit test runners), `openDatabase()` resolves to `null` and persistence delegates cleanly to an in-memory `Map` (`memoryStore`).
- Pure Promise-based transaction wrappers for `store.put`, `store.get`, and `store.delete` with `tx.oncomplete` and `tx.onerror` resolution.
- Re-exported via `src/canvas/store/db.js` (`export * from "../../storage/db.js"; export { dataUrlToBlob } from "../../shared/db_wire.js";`).

### 1.2 Recent Files & Dashboard Storage Patterns (`src/canvas/store/recent_files.js`)
Inspection of `src/canvas/store/recent_files.js` (lines 6–100, 148–245) reveals:
- Storage key: `voo_design_recent_files` stored in `window.localStorage` (max 50 records).
- Rich query filters: `getRecentFiles(options)` supports `includeTrashed`, `starredOnly`, `draftsOnly`, `trashOnly`, `category`, `search`, `sortBy` ("updatedAt" | "name"), and `sortOrder` ("asc" | "desc").
- File operations: `toggleStarFile`, `renameRecentFile`, `duplicateRecentFile`, `moveToTrash`, `restoreFromTrash`, `deletePermanently`, `emptyTrash`.
- Crucial disconnect: Currently these operations modify only the local metadata array in `localStorage`. They do not perform physical file I/O or reflect real folder states on disk or in virtual object stores.

### 1.3 Project I/O Dispatch (`src/canvas/store/project_io.js`)
Inspection of `src/canvas/store/project_io.js` (lines 350–435) reveals:
- Branch 1 (Desktop Electron): `window.electronAPI.saveFileDialog` + `window.electronAPI.writeFileBytes(targetPath, fileBytes)`.
- Branch 2 (Modern Web): `window.showSaveFilePicker` + `handle.createWritable()`.
- Branch 3 (Fallback Web): Blob download via dynamic `<a download="...">` element.
- Formats supported: `.voo` (JSON and binary envelope), `.fig` (Kiwi/zip archive via `importFigFile`), `.psd` (via `psdBytesToVooFile`), `.svg` (via `svgBytesToVooFile`).

### 1.4 Electron Preload & Main Isolation (`electron/preload.cjs` & `tests/unit/adversarial_isolation_electron_safety.test.js`)
- `electron/preload.cjs` exposes `window.vooDesktop` (with `localCli`) and `window.electronAPI` (with `isElectron`, `openFileDialog`, `saveFileDialog`, `readFile`, `readFileBytes`, `writeFile`, `writeFileBytes`).
- In `tests/unit/adversarial_isolation_electron_safety.test.js` (lines 256–270), `electronAPI` is validated by unit tests. Adding `workspace` sub-objects to `electronAPI` and `vooDesktop` preserves compatibility with all 842 existing tests.

### 1.5 Node.js Vitest Test Environment
- Execution of `npm test` runs 71 test suites and 842 unit tests. Vitest runs in Node.js where `window`, `document`, and `indexedDB` are either undefined or partially mocked.
- Any new frontend storage service must run seamlessly without requiring browser globals or external npm packages.

---

## 2. Logic Chain

1. **Need for Polymorphic Abstraction**:
   VOO Design executes in three distinct runtime environments:
   - Electron Desktop (macOS / Windows / Linux) with access to native IPC, `shell.trashItem`, and file watchers.
   - Modern Chromium Browsers with the File System Access API (`showDirectoryPicker`) and `FileSystemDirectoryHandle`.
   - Standard Web Browsers & Headless Node.js without FSA API, requiring an IndexedDB / in-memory virtual workspace.
   Instead of scattering conditional environment checks throughout UI components (`WelcomeDashboard`, `SettingsGeneral`, `OnboardingGuide`, `project_io.js`), a single polymorphic engine `WorkspaceStorageEngine` transparently resolves to the optimal driver while presenting a unified, identical API contract.

2. **Metadata Overlay Architecture**:
   Physical files on disk (in Electron and Web FSA) only store byte content and filesystem timestamps. They do not store user metadata such as `starred`, custom `category`, `preview` thumbnails, or `trashedAt`.
   A unified metadata overlay layer (stored in IndexedDB / localStorage) is merged with scanned files during `scanFiles()`. Operations such as `toggleStar()` and `renameFile()` update or migrate this metadata cleanly.

3. **Soft-Delete & Trash Strategy**:
   - Web FSA does not provide access to the operating system trash. Creating and managing a `.trash/` virtual sub-folder inside the chosen directory handle provides consistent, cross-platform soft-deletion, restoration, and emptying.
   - For Electron, moving files into `<workspaceRoot>/.trash/` before permanent deletion (or delegating to `shell.trashItem`) mirrors the same predictable behavior.
   - For Web IDB, soft-deletion transfers records from `workspace_files` to `workspace_trash`.

4. **Zero-Dependency & Headless Testing Invariant**:
   The engine and all drivers use native ES6/ES2022 JavaScript. The `WebIdbWorkspaceDriver` detects when `typeof indexedDB === "undefined"` and transparently falls back to an in-memory `Map` storage backend. This enables full unit testing in Node.js without polyfills or external dependencies.

---

## 3. Caveats

1. **Chromium FSA Permission Lifecycle**:
   `FileSystemDirectoryHandle` stored in IndexedDB loses active read/write permissions across browser sessions. Upon reload, `handle.queryPermission({ mode: "readwrite" })` will return `'prompt'`. The driver must record `needsPermission: true` without throwing, and only trigger `handle.requestPermission()` in response to an explicit user interaction.
2. **File Renaming In-Place Compatibility**:
   While `FileSystemHandle.move()` is supported in newer Chromium versions (Chrome 111+), older builds or variants may lack it. The Web FSA driver must support a fallback copy-and-unlink mechanism for safe renaming.
3. **Case-Only Renaming on Case-Insensitive Filesystems**:
   On macOS APFS and Windows NTFS, renaming `doc.voo` to `Doc.voo` in Electron can fail if renamed directly. The Electron backend handles this via intermediate staging names (`.tmp_rename_...`).

---

## 4. Conclusion & Technical Blueprint

### 4.1 Architecture Diagram

```
+---------------------------------------------------------------------------------------+
|                                    Application Consumers                              |
|   (WelcomeDashboard, SettingsDrawer, OnboardingGuide, project_io.js, useDesignStore)  |
+---------------------------------------------------------------------------------------+
                                           │
                                           ▼
+---------------------------------------------------------------------------------------+
|                          `workspaceStorage` (Singleton Engine)                         |
|                           `src/services/workspace_storage.js`                         |
|   Methods: init(), getConfig(), chooseDirectory(), setDirectory(), scanFiles(),       |
|            readFileBytes(), writeFileBytes(), renameFile(), moveToTrash(),            |
|            restoreFromTrash(), deletePermanently(), emptyTrash(), toggleStar(),        |
|            revealInFinder(), subscribe()                                              |
+---------------------------------------------------------------------------------------+
            │                                 │                                 │
            ▼                                 ▼                                 ▼
+-----------------------+         +-----------------------+         +-----------------------+
| ElectronWorkspaceDriver|        | WebFsaWorkspaceDriver |         | WebIdbWorkspaceDriver |
| (src/services/drivers/ |        | (src/services/drivers/|         | (src/services/drivers/|
|  electron_driver.js)  |        |  web_fsa_driver.js)   |         |  web_idb_driver.js)   |
+-----------------------+         +-----------------------+         +-----------------------+
            │                                 │                                 │
            ▼                                 ▼                                 ▼
   [Electron IPC Bridge]             [Chromium File System]            [IndexedDB / In-Memory]
  - window.electronAPI.workspace    - showDirectoryPicker()           - DB: voo_virtual_workspace_db
  - Native filesystem access        - Stored handle in IDB            - Store: workspace_files
  - OS trash / .trash folder        - Virtual .trash/ subfolder       - Store: workspace_trash
  - fs.watch change events          - Permission re-verification      - Store: workspace_meta
                                                                      - Pure Map fallback in Node
```

---

### 4.2 Module 1: `src/services/workspace_storage.js`

```javascript
/**
 * Unified Workspace Storage Engine for VOO Design.
 * Polymorphic facade providing identical directory, scanning, and file management
 * capabilities across Desktop Electron, Chromium Web FSA, and Virtual IndexedDB.
 */

import { ElectronWorkspaceDriver } from "./drivers/electron_driver.js";
import { WebFsaWorkspaceDriver } from "./drivers/web_fsa_driver.js";
import { WebIdbWorkspaceDriver } from "./drivers/web_idb_driver.js";

export function guessCategory(fileName = "") {
  const name = String(fileName).toLowerCase();
  if (/landing|home|hero|banner/i.test(name)) return "landing";
  if (/mobile|ios|android|phone|app/i.test(name)) return "mobile";
  if (/slide|deck|presentation|pitch/i.test(name)) return "slides";
  if (/dash|admin|crm|board|metric/i.test(name)) return "dashboard";
  return "web";
}

export class WorkspaceStorageEngine {
  constructor(forcedDriverType = null) {
    this.driver = this.resolveDriver(forcedDriverType);
    this.listeners = new Set();
    this.driverUnsub = null;
    this._attachDriverEvents();
  }

  resolveDriver(driverType = null) {
    if (driverType === "electron" || (!driverType && ElectronWorkspaceDriver.isAvailable())) {
      return new ElectronWorkspaceDriver();
    }
    if (driverType === "web-fsa" || (!driverType && WebFsaWorkspaceDriver.isAvailable())) {
      return new WebFsaWorkspaceDriver();
    }
    return new WebIdbWorkspaceDriver();
  }

  getDriverType() {
    return this.driver.getDriverType();
  }

  getDriver() {
    return this.driver;
  }

  switchDriver(driverType) {
    if (this.driverUnsub) {
      this.driverUnsub();
      this.driverUnsub = null;
    }
    this.driver = this.resolveDriver(driverType);
    this._attachDriverEvents();
    return this.driver;
  }

  _attachDriverEvents() {
    if (typeof this.driver.subscribe === "function") {
      this.driverUnsub = this.driver.subscribe((event) => {
        for (const cb of this.listeners) {
          try {
            cb(event);
          } catch (err) {
            console.error("[WorkspaceStorage] Error in event listener:", err);
          }
        }
      });
    }
  }

  async init() {
    return this.driver.init();
  }

  async getConfig() {
    return this.driver.getConfig();
  }

  async chooseDirectory() {
    return this.driver.chooseDirectory();
  }

  async setDirectory(dirPathOrHandle) {
    return this.driver.setDirectory(dirPathOrHandle);
  }

  async isConfigured() {
    return this.driver.isConfigured();
  }

  async scanFiles(options = {}) {
    return this.driver.scanFiles(options);
  }

  async readFileBytes(fileIdOrPath) {
    return this.driver.readFileBytes(fileIdOrPath);
  }

  async writeFileBytes(name, bytes, options = {}) {
    return this.driver.writeFileBytes(name, bytes, options);
  }

  async renameFile(fileIdOrPath, newName) {
    return this.driver.renameFile(fileIdOrPath, newName);
  }

  async moveToTrash(fileIdOrPath) {
    return this.driver.moveToTrash(fileIdOrPath);
  }

  async restoreFromTrash(fileIdOrPath) {
    return this.driver.restoreFromTrash(fileIdOrPath);
  }

  async deletePermanently(fileIdOrPath) {
    return this.driver.deletePermanently(fileIdOrPath);
  }

  async emptyTrash() {
    return this.driver.emptyTrash();
  }

  async toggleStar(fileIdOrPath) {
    return this.driver.toggleStar(fileIdOrPath);
  }

  async revealInFinder(fileIdOrPath) {
    return this.driver.revealInFinder(fileIdOrPath);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

let defaultInstance = null;

export function getWorkspaceStorage(forcedDriverType = null) {
  if (!defaultInstance || forcedDriverType) {
    defaultInstance = new WorkspaceStorageEngine(forcedDriverType);
  }
  return defaultInstance;
}

export const workspaceStorage = getWorkspaceStorage();
```

---

### 4.3 Module 2: `src/services/drivers/electron_driver.js`

```javascript
/**
 * Desktop Electron Storage Driver.
 * Connects to Electron main process via window.electronAPI.workspace IPC.
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
    return res.file;
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
```

---

### 4.4 Module 3: `src/services/drivers/web_fsa_driver.js`

```javascript
/**
 * Chromium File System Access API Driver.
 * Mounts physical folder handles using showDirectoryPicker(), persists the handle
 * in IndexedDB, manages .trash/ subfolder emulation, and monitors file iteration.
 */

import { guessCategory } from "../workspace_storage.js";

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

  async _verifyPermission(handle, readWrite = true) {
    if (!handle) return false;
    const opts = { mode: readWrite ? "readwrite" : "read" };
    try {
      if ((await handle.queryPermission(opts)) === "granted") {
        this.permissionState = "granted";
        return true;
      }
      if ((await handle.requestPermission(opts)) === "granted") {
        this.permissionState = "granted";
        return true;
      }
    } catch {}
    this.permissionState = "denied";
    return false;
  }

  async init() {
    if (!this.dirHandle) {
      this.dirHandle = await this._loadStoredHandle();
    }
    if (this.dirHandle) {
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
    this.permissionState = "granted";
    await this._saveStoredHandle(handle);
    return {
      ok: true,
      config: {
        type: "web-fsa",
        path: handle.name,
        isDefault: false,
        isConfigured: true,
      },
    };
  }

  async _getTrashDir(create = false) {
    if (!this.dirHandle) return null;
    try {
      return await this.dirHandle.getDirectoryHandle(".trash", { create });
    } catch {
      return null;
    }
  }

  async scanFiles(options = {}) {
    if (!this.dirHandle) return [];
    const hasPerm = await this._verifyPermission(this.dirHandle, false);
    if (!hasPerm) return [];

    const meta = this._loadMetadata();
    const files = [];

    // 1. Scan active root files
    try {
      for await (const [name, entry] of this.dirHandle.entries()) {
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
                trashed: false,
                trashedAt: null,
                category: m.category || guessCategory(name),
                preview: m.preview || null,
              });
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn("[WebFsaDriver] Failed to iterate root folder:", err);
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

    let fileEntry = null;
    try {
      fileEntry = await this.dirHandle.getFileHandle(fileIdOrName);
    } catch {
      const trashDir = await this._getTrashDir(false);
      if (trashDir) {
        fileEntry = await trashDir.getFileHandle(fileIdOrName);
      }
    }
    if (!fileEntry) throw new Error(`File ${fileIdOrName} not found`);
    const file = await fileEntry.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async writeFileBytes(name, bytes, options = {}) {
    if (!this.dirHandle) throw new Error("No workspace directory chosen");
    await this._verifyPermission(this.dirHandle, true);

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

  async renameFile(oldName, newName) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    await this._verifyPermission(this.dirHandle, true);

    const targetName = newName.includes(".") ? newName : `${newName}.voo`;
    try {
      const oldHandle = await this.dirHandle.getFileHandle(oldName);
      if (typeof oldHandle.move === "function") {
        await oldHandle.move(targetName);
      } else {
        const file = await oldHandle.getFile();
        const bytes = await file.arrayBuffer();
        const newHandle = await this.dirHandle.getFileHandle(targetName, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        await this.dirHandle.removeEntry(oldName);
      }

      const meta = this._loadMetadata();
      if (meta[oldName]) {
        meta[targetName] = meta[oldName];
        delete meta[oldName];
        this._saveMetadata(meta);
      }
      this._emitChange("change", targetName);
      return { ok: true, newName: targetName };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async moveToTrash(name) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    await this._verifyPermission(this.dirHandle, true);

    try {
      const trashDir = await this._getTrashDir(true);
      const fileHandle = await this.dirHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      const bytes = await file.arrayBuffer();

      const trashFileHandle = await trashDir.getFileHandle(name, { create: true });
      const writable = await trashFileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();

      await this.dirHandle.removeEntry(name);
      this._setMeta(name, { trashed: true, trashedAt: Date.now() });
      this._emitChange("change", name);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async restoreFromTrash(name) {
    if (!this.dirHandle) return { ok: false, error: "No workspace chosen" };
    await this._verifyPermission(this.dirHandle, true);

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
    await this._verifyPermission(this.dirHandle, true);

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
    await this._verifyPermission(this.dirHandle, true);

    const trashDir = await this._getTrashDir(false);
    if (!trashDir) return { ok: true, deletedCount: 0 };

    let count = 0;
    try {
      for await (const [name, entry] of trashDir.entries()) {
        if (entry.kind === "file") {
          await trashDir.removeEntry(name);
          this._deleteMeta(name);
          count++;
        }
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
```

---

### 4.5 Module 4: `src/services/drivers/web_idb_driver.js`

```javascript
/**
 * Virtual IndexedDB Storage Driver.
 * Provides a virtual workspace backed by IndexedDB stores (`workspace_files`,
 * `workspace_meta`, `workspace_trash`) with zero-dependency in-memory Map fallback
 * for headless Node.js Vitest test suites.
 */

import { guessCategory } from "../workspace_storage.js";

const IDB_NAME = "voo_virtual_workspace_db";
const IDB_VERSION = 1;
const STORE_FILES = "workspace_files";
const STORE_TRASH = "workspace_trash";
const STORE_META = "workspace_meta";

export class WebIdbWorkspaceDriver {
  constructor() {
    this.subscribers = new Set();
    this.dbPromise = null;
    // Pure in-memory Maps when indexedDB is undefined (Node.js test environment)
    this.memFiles = new Map();
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
      if (starredOnly && !item.starred) return false;
      if (category && category !== "all" && item.category !== category) return false;
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        return item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
      }
      return true;
    });

    // Strip bytes from scan summaries for efficiency
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
      return summary;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, "readwrite");
      tx.objectStore(STORE_FILES).put(record);
      tx.oncomplete = () => {
        this._emitChange("create", record.id);
        const { bytes: _, ...summary } = record;
        resolve(summary);
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
```

---

## 5. Verification Method

1. **Verify In-Memory Node.js Unit Testing**:
   Create and execute Vitest test file `tests/unit/workspace_storage_engine.test.js`:
   ```javascript
   import { describe, it, expect } from "vitest";
   import { getWorkspaceStorage } from "../../src/services/workspace_storage.js";

   describe("WorkspaceStorageEngine", () => {
     it("initializes with WebIdbWorkspaceDriver in headless Node", async () => {
       const storage = getWorkspaceStorage();
       expect(storage.getDriverType()).toBe("web-idb");
       const cfg = await storage.init();
       expect(cfg.type).toBe("web-idb");
     });

     it("performs write, scan, rename, trash, restore, delete", async () => {
       const storage = getWorkspaceStorage("web-idb");
       const file = await storage.writeFileBytes("Demo.voo", new Uint8Array([1, 2, 3]));
       expect(file.name).toBe("Demo.voo");

       let list = await storage.scanFiles();
       expect(list).toHaveLength(1);

       await storage.renameFile("Demo.voo", "Renamed.voo");
       list = await storage.scanFiles();
       expect(list[0].name).toBe("Renamed.voo");

       await storage.moveToTrash("Renamed.voo");
       expect(await storage.scanFiles()).toHaveLength(0);
       expect(await storage.scanFiles({ trashOnly: true })).toHaveLength(1);

       await storage.restoreFromTrash("Renamed.voo");
       expect(await storage.scanFiles()).toHaveLength(1);

       await storage.deletePermanently("Renamed.voo");
       expect(await storage.scanFiles()).toHaveLength(0);
     });
   });
   ```
   Command:
   ```bash
   npx vitest run tests/unit/workspace_storage_engine.test.js
   ```

2. **Verify Full Existing Test Suite Regression**:
   ```bash
   npm test
   ```
   *Expected Result*: 100% of test suites and tests pass with 0 failures.

3. **Verify Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Expected Result*: 0 design violations.

4. **Verify Clean Production Bundling**:
   ```bash
   npm run build
   ```
   *Expected Result*: Clean build产物, zero compilation warnings.
