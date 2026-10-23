# Test Specification: `tests/unit/workspace_storage.test.js`
**Target Milestone**: Milestone 1 (Dual-Platform Workspace Storage Engine)  
**Author**: explorer_m1_test  
**Date**: 2026-10-21  

---

## 1. Overview & Test Objectives

The `tests/unit/workspace_storage.test.js` test suite validates the frontend Polymorphic Storage Engine (`src/services/workspace_storage.js`) and its web storage drivers:
1. **`WebIdbWorkspaceDriver`**: Virtual IndexedDB workspace storage with seamless zero-dependency in-memory fallback for headless test runners.
2. **`WebFsaWorkspaceDriver`**: Chromium File System Access API integration (`FileSystemDirectoryHandle`), permission simulation (grant, prompt, deny), file streaming, and `.trash/` subfolder lifecycle.
3. **`WorkspaceStorageEngine` Factory & Polymorphism**: Runtime environment auto-detection (Electron -> Web FSA -> Web IDB), singleton management, and change event subscriptions.

---

## 2. Test Environment & Mock Harnesses

### 2.1 Vitest Invariant Compliance
- **Environment**: Node.js (`vite.config.js` sets `environment: "node"`).
- **Isolation**: Every test block resets global state (`globalThis.window`, mock stores, listeners) in `beforeEach` and `afterEach`.
- **Zero External Dependencies**: Must run without requiring Puppeteer, Playwright, or external browser polyfills.

### 2.2 Mock Harness 1: In-Memory IndexedDB Mock for WebIdbWorkspaceDriver
Emulates the `indexedDB` object store schema:
- `workspace_files`: stores design files `{ id, name, extension, bytes, size, createdAt, updatedAt, starred, category, preview }`
- `workspace_trash`: stores soft-deleted files `{ id, name, extension, bytes, size, createdAt, updatedAt, trashedAt }`
- `workspace_meta`: stores `{ key, value }` configuration entries

```javascript
class MockIdbDatabase {
  constructor() {
    this.stores = {
      workspace_files: new Map(),
      workspace_trash: new Map(),
      workspace_meta: new Map(),
    };
  }
  clear() {
    this.stores.workspace_files.clear();
    this.stores.workspace_trash.clear();
    this.stores.workspace_meta.clear();
  }
}
```

### 2.3 Mock Harness 2: W3C File System Access API Mock for WebFsaWorkspaceDriver
Emulates `FileSystemDirectoryHandle` and `FileSystemFileHandle`:
- **`MockFileHandle`**:
  - `kind = "file"`
  - `name`: string
  - `data`: Uint8Array
  - `lastModified`: timestamp
  - `getFile()`: returns `{ name, size, lastModified, arrayBuffer: () => Promise.resolve(this.data.buffer) }`
  - `createWritable()`: returns `{ write: (buf) => { this.data = buf; }, close: () => Promise.resolve() }`
- **`MockDirectoryHandle`**:
  - `kind = "directory"`
  - `name`: string
  - `entries`: Map of name -> handle
  - `permissionState`: `'granted'` | `'prompt'` | `'denied'`
  - `queryPermission({ mode })`: returns `this.permissionState`
  - `requestPermission({ mode })`: returns `this.permissionState`
  - `getFileHandle(name, { create })`: returns file handle or throws `NotFoundError`
  - `getDirectoryHandle(name, { create })`: returns directory handle or creates subfolder
  - `removeEntry(name, { recursive })`: removes entry or throws `NotFoundError`
  - `entries()`: async generator yielding `[name, handle]`

---

## 3. Test Cases Specification & Assertions

### Suite A: `WebIdbWorkspaceDriver` (IndexedDB Virtual Storage)

| Test # | Test Name | Target Behavior | Expected Assertions |
|---|---|---|---|
| A1 | `init() & getConfig()` | Initializes default virtual workspace | `config.type === "web-idb"`<br>`config.path === "Virtual Workspace"`<br>`config.isDefault === true` |
| A2 | `writeFileBytes() native .voo` | Writes `.voo` file and synthesizes metadata | `file.extension === "voo"`<br>`file.size === 128`<br>`file.trashed === false`<br>`file.starred === false`<br>`file.id` is valid string |
| A3 | `writeFileBytes() multi-format` | Writes `.fig`, `.psd`, `.svg` with category & preview | Metadata retains `category === "landing"`, `preview === "data:image/png;base64,..."` |
| A4 | `scanFiles() shallow listing` | Lists supported formats (`.voo`, `.fig`, `.psd`, `.svg`) | Scanned list contains all 4 valid design files |
| A5 | `scanFiles() extension filtering`| Filters out non-design files (`.txt`, `.json`, `.png`, `.zip`) | Non-design files do not appear in `scanFiles()` |
| A6 | `scanFiles() search & category` | Filters files matching search query and category | Search substring "Poster" matches "Poster.voo"; category filter works |
| A7 | `readFileBytes()` | Reads binary content from store | Returned `Uint8Array` deeply equals original bytes |
| A8 | `renameFile() standard` | Renames file and updates extension/mtime | `res.ok === true`<br>`res.file.name === "NewDoc.voo"`<br>`oldName` no longer exists |
| A9 | `renameFile() collision` | Prevents renaming to an existing file name | `res.ok === false`<br>`res.error` mentions collision / already exists |
| A10 | `toggleStar()` | Toggles star favorite status | Toggling returns `starred: true`, next toggle returns `starred: false` |
| A11 | `moveToTrash()` | Soft-deletes file to `workspace_trash` | `res.ok === true`<br>File removed from default `scanFiles()`<br>File appears in `scanFiles({ includeTrashed: true })` |
| A12 | `restoreFromTrash()` | Restores soft-deleted file | `res.ok === true`<br>File reappears in default `scanFiles()`<br>`file.trashed === false` |
| A13 | `deletePermanently()` | Permanently wipes file and binary data | Record deleted from both files and trash stores; `readFileBytes` throws/returns null |
| A14 | `emptyTrash()` | Empties all trashed files | `res.deletedCount === 2`<br>Trash store is empty; active files remain intact |
| A15 | `in-memory fallback resilience`| Runs cleanly when `indexedDB` is undefined in Node | Driver functions without throwing or crashing |

---

### Suite B: `WebFsaWorkspaceDriver` (Chromium File System Access API)

| Test # | Test Name | Target Behavior | Expected Assertions |
|---|---|---|---|
| B1 | `permission granted` | Direct access when permission is `'granted'` | `isConfigured()` returns `true`; `scanFiles()` proceeds immediately |
| B2 | `permission prompt & grant` | Prompts user when permission is `'prompt'` | Calls `requestPermission()`; upon grant, returns `ok: true` |
| B3 | `permission denied` | Rejects file actions when permission is `'denied'` | `scanFiles()` returns empty or error; `writeFileBytes()` returns `{ ok: false, error: "Permission denied" }` |
| B4 | `writeFileBytes() & readFileBytes()` | Writes to handle stream and reads bytes | Data read matches original `Uint8Array` bytes |
| B5 | `scanFiles() design files` | Iterates directory entries, filters `.voo`, `.fig`, `.psd`, `.svg` | Only design files returned; directories and `.txt` files excluded |
| B6 | `moveToTrash() .trash/ folder` | Moves file into `.trash/` subfolder handle | File handle created in `.trash/`; removed from root directory handle |
| B7 | `restoreFromTrash()` | Moves file from `.trash/` back to root | File handle recreated in root directory; removed from `.trash/` |
| B8 | `deletePermanently()` | Unlinks entry directly from handle | `removeEntry()` called on directory handle; file completely gone |
| B9 | `emptyTrash()` | Purges all files in `.trash/` directory | `.trash/` directory is cleared |

---

### Suite C: `WorkspaceStorageEngine` Factory & Auto-Detection

| Test # | Test Name | Target Behavior | Expected Assertions |
|---|---|---|---|
| C1 | `Electron auto-detection` | Detects `window.electronAPI.workspace` | `engine.getDriverType() === "electron"` |
| C2 | `Web FSA auto-detection` | Detects `window.showDirectoryPicker` without Electron | `engine.getDriverType() === "web-fsa"` |
| C3 | `Web IDB auto-detection` | Fallback when neither Electron nor FSA available | `engine.getDriverType() === "web-idb"` |
| C4 | `Singleton management` | `getWorkspaceStorage()` returns stable instance | Subsequent calls return same engine instance |
| C5 | `Event subscription` | `subscribe()` notifies listeners on mutations | Listener invoked on `writeFileBytes`, `renameFile`, `moveToTrash`, `deletePermanently` |
| C6 | `Unsubscribe lifecycle` | Returned unsubscribe function removes listener | Subsequent mutations do not trigger removed listener |

---

## 4. Complete Test Implementation Code Draft

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  WebIdbWorkspaceDriver,
  WebFsaWorkspaceDriver,
  ElectronWorkspaceDriver,
  getWorkspaceStorage,
  resetWorkspaceStorage,
} from "../../src/services/workspace_storage.js";

// ==========================================
// Mock Harnesses
// ==========================================

class MockFileHandle {
  constructor(name, data = new Uint8Array(), lastModified = Date.now()) {
    this.kind = "file";
    this.name = name;
    this.data = data;
    this.lastModified = lastModified;
  }
  async getFile() {
    return {
      name: this.name,
      size: this.data.byteLength,
      lastModified: this.lastModified,
      arrayBuffer: async () => this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength),
    };
  }
  async createWritable() {
    return {
      write: async (chunk) => {
        this.data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        this.lastModified = Date.now();
      },
      close: async () => {},
    };
  }
}

class MockDirectoryHandle {
  constructor(name = "root", permissionState = "granted") {
    this.kind = "directory";
    this.name = name;
    this.permissionState = permissionState;
    this.entriesMap = new Map();
  }
  async queryPermission() {
    return this.permissionState;
  }
  async requestPermission() {
    return this.permissionState;
  }
  async *entries() {
    for (const [name, handle] of this.entriesMap.entries()) {
      yield [name, handle];
    }
  }
  async getFileHandle(name, options = {}) {
    if (this.entriesMap.has(name)) {
      const h = this.entriesMap.get(name);
      if (h.kind === "file") return h;
      throw new Error("TypeMismatchError");
    }
    if (options.create) {
      const fh = new MockFileHandle(name);
      this.entriesMap.set(name, fh);
      return fh;
    }
    throw new Error("NotFoundError");
  }
  async getDirectoryHandle(name, options = {}) {
    if (this.entriesMap.has(name)) {
      const h = this.entriesMap.get(name);
      if (h.kind === "directory") return h;
      throw new Error("TypeMismatchError");
    }
    if (options.create) {
      const dh = new MockDirectoryHandle(name, this.permissionState);
      this.entriesMap.set(name, dh);
      return dh;
    }
    throw new Error("NotFoundError");
  }
  async removeEntry(name, options = {}) {
    if (!this.entriesMap.has(name)) throw new Error("NotFoundError");
    this.entriesMap.delete(name);
  }
}

// ==========================================
// Tests
// ==========================================

describe("Workspace Storage Engine: Web IDB, Web FSA & Polymorphic Factory", () => {
  beforeEach(() => {
    resetWorkspaceStorage();
    delete globalThis.window;
  });

  afterEach(() => {
    resetWorkspaceStorage();
    delete globalThis.window;
  });

  describe("Suite A: WebIdbWorkspaceDriver (Virtual IndexedDB Storage)", () => {
    let driver;

    beforeEach(async () => {
      driver = new WebIdbWorkspaceDriver();
      await driver.init();
    });

    it("A1: initializes default virtual workspace config", async () => {
      const config = await driver.getConfig();
      expect(config.type).toBe("web-idb");
      expect(config.path).toBe("Virtual Workspace");
      expect(config.isDefault).toBe(true);
    });

    it("A2: writes native .voo file and returns file info", async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const file = await driver.writeFileBytes("Hero.voo", bytes);

      expect(file).toBeDefined();
      expect(file.name).toBe("Hero.voo");
      expect(file.extension).toBe("voo");
      expect(file.size).toBe(5);
      expect(file.trashed).toBe(false);
      expect(file.starred).toBe(false);
      expect(file.createdAt).toBeGreaterThan(0);
    });

    it("A3: writes multi-format files (.fig, .psd, .svg) with category and preview metadata", async () => {
      const bytes = new Uint8Array([10, 20]);
      const fig = await driver.writeFileBytes("Design.fig", bytes, { category: "mobile", preview: "data:image/png;base64,fig" });
      const psd = await driver.writeFileBytes("Banner.psd", bytes, { category: "landing" });
      const svg = await driver.writeFileBytes("Icon.svg", bytes, { category: "other" });

      expect(fig.extension).toBe("fig");
      expect(fig.category).toBe("mobile");
      expect(fig.preview).toBe("data:image/png;base64,fig");
      expect(psd.extension).toBe("psd");
      expect(svg.extension).toBe("svg");
    });

    it("A4 & A5: shallow scan lists only supported design formats and ignores non-design files", async () => {
      await driver.writeFileBytes("Poster.voo", new Uint8Array([1]));
      await driver.writeFileBytes("UI.fig", new Uint8Array([2]));
      await driver.writeFileBytes("Artwork.psd", new Uint8Array([3]));
      await driver.writeFileBytes("Logo.svg", new Uint8Array([4]));

      const scanned = await driver.scanFiles();
      const names = scanned.map((f) => f.name);

      expect(names).toContain("Poster.voo");
      expect(names).toContain("UI.fig");
      expect(names).toContain("Artwork.psd");
      expect(names).toContain("Logo.svg");
      expect(scanned).toHaveLength(4);
    });

    it("A6: filters scan results by search query and category", async () => {
      await driver.writeFileBytes("PosterLanding.voo", new Uint8Array([1]), { category: "landing" });
      await driver.writeFileBytes("MobileApp.voo", new Uint8Array([2]), { category: "mobile" });

      const searched = await driver.scanFiles({ search: "mobile" });
      expect(searched).toHaveLength(1);
      expect(searched[0].name).toBe("MobileApp.voo");

      const categorized = await driver.scanFiles({ category: "landing" });
      expect(categorized).toHaveLength(1);
      expect(categorized[0].name).toBe("PosterLanding.voo");
    });

    it("A7: reads binary bytes matching written data", async () => {
      const original = new Uint8Array([100, 101, 102, 103]);
      const file = await driver.writeFileBytes("BinaryTest.voo", original);
      const read = await driver.readFileBytes(file.id);

      expect(Array.from(read)).toEqual(Array.from(original));
    });

    it("A8 & A9: renames file atomically and rejects collisions", async () => {
      const f1 = await driver.writeFileBytes("Alpha.voo", new Uint8Array([1]));
      await driver.writeFileBytes("Beta.voo", new Uint8Array([2]));

      // Collision rename should fail
      const colRes = await driver.renameFile(f1.id, "Beta.voo");
      expect(colRes.ok).toBe(false);

      // Normal rename should succeed
      const renRes = await driver.renameFile(f1.id, "Gamma.voo");
      expect(renRes.ok).toBe(true);
      expect(renRes.file.name).toBe("Gamma.voo");

      const scanned = await driver.scanFiles();
      const names = scanned.map((f) => f.name);
      expect(names).toContain("Gamma.voo");
      expect(names).not.toContain("Alpha.voo");
    });

    it("A10: toggles star favorite status", async () => {
      const file = await driver.writeFileBytes("StarMe.voo", new Uint8Array([1]));
      expect(file.starred).toBe(false);

      const res1 = await driver.toggleStar(file.id);
      expect(res1.starred).toBe(true);

      const res2 = await driver.toggleStar(file.id);
      expect(res2.starred).toBe(false);
    });

    it("A11 & A12: moves to trash, excludes from active scan, and restores", async () => {
      const file = await driver.writeFileBytes("TrashMe.voo", new Uint8Array([1]));

      const trashRes = await driver.moveToTrash(file.id);
      expect(trashRes.ok).toBe(true);

      // Active scan excludes trashed
      const active = await driver.scanFiles();
      expect(active.find((f) => f.id === file.id)).toBeUndefined();

      // Include trashed finds it
      const all = await driver.scanFiles({ includeTrashed: true });
      const found = all.find((f) => f.id === file.id);
      expect(found).toBeDefined();
      expect(found.trashed).toBe(true);

      // Restore
      const restoreRes = await driver.restoreFromTrash(file.id);
      expect(restoreRes.ok).toBe(true);

      const restored = await driver.scanFiles();
      expect(restored.find((f) => f.id === file.id)).toBeDefined();
    });

    it("A13: permanently deletes file from storage", async () => {
      const file = await driver.writeFileBytes("KillMe.voo", new Uint8Array([1]));
      const delRes = await driver.deletePermanently(file.id);
      expect(delRes.ok).toBe(true);

      const scanned = await driver.scanFiles({ includeTrashed: true });
      expect(scanned.find((f) => f.id === file.id)).toBeUndefined();
    });

    it("A14: empties all trashed files while keeping active files", async () => {
      const active = await driver.writeFileBytes("Active.voo", new Uint8Array([1]));
      const t1 = await driver.writeFileBytes("T1.voo", new Uint8Array([2]));
      const t2 = await driver.writeFileBytes("T2.voo", new Uint8Array([3]));

      await driver.moveToTrash(t1.id);
      await driver.moveToTrash(t2.id);

      const emptyRes = await driver.emptyTrash();
      expect(emptyRes.ok).toBe(true);
      expect(emptyRes.deletedCount).toBe(2);

      const remaining = await driver.scanFiles({ includeTrashed: true });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(active.id);
    });
  });

  describe("Suite B: WebFsaWorkspaceDriver (File System Access API Mock)", () => {
    let mockRoot;
    let driver;

    beforeEach(async () => {
      mockRoot = new MockDirectoryHandle("TestWorkspace", "granted");
      driver = new WebFsaWorkspaceDriver();
      await driver.setDirectory(mockRoot);
    });

    it("B1 & B2: respects granted permission and handles prompt", async () => {
      expect(await driver.isConfigured()).toBe(true);

      // Prompt simulation
      const promptDir = new MockDirectoryHandle("PromptDir", "prompt");
      const promptDriver = new WebFsaWorkspaceDriver();
      await promptDriver.setDirectory(promptDir);

      promptDir.permissionState = "granted";
      const files = await promptDriver.scanFiles();
      expect(files).toEqual([]);
    });

    it("B3: handles denied permission gracefully", async () => {
      const deniedDir = new MockDirectoryHandle("DeniedDir", "denied");
      const deniedDriver = new WebFsaWorkspaceDriver();
      await deniedDriver.setDirectory(deniedDir);

      const res = await deniedDriver.writeFileBytes("Denied.voo", new Uint8Array([1]));
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/denied/i);
    });

    it("B4 & B5: writes file bytes and scans only design files (.voo, .fig, .psd, .svg)", async () => {
      await driver.writeFileBytes("Main.voo", new Uint8Array([1, 2, 3]));
      await driver.writeFileBytes("Design.fig", new Uint8Array([4, 5]));
      await driver.writeFileBytes("Artwork.psd", new Uint8Array([6]));
      await driver.writeFileBytes("Icon.svg", new Uint8Array([7]));

      // Create unsupported file directly in directory
      const txtHandle = await mockRoot.getFileHandle("readme.txt", { create: true });
      const w = await txtHandle.createWritable();
      await w.write(new Uint8Array([65, 66]));
      await w.close();

      const files = await driver.scanFiles();
      const names = files.map((f) => f.name);

      expect(names).toContain("Main.voo");
      expect(names).toContain("Design.fig");
      expect(names).toContain("Artwork.psd");
      expect(names).toContain("Icon.svg");
      expect(names).not.toContain("readme.txt");
    });

    it("B6 & B7: moves file to .trash/ subfolder and restores", async () => {
      await driver.writeFileBytes("TrashFsa.voo", new Uint8Array([1, 2, 3]));

      const trashRes = await driver.moveToTrash("TrashFsa.voo");
      expect(trashRes.ok).toBe(true);

      // Active scan does not show it
      const active = await driver.scanFiles();
      expect(active.find((f) => f.name === "TrashFsa.voo")).toBeUndefined();

      // .trash/ subfolder contains the file
      const trashHandle = await mockRoot.getDirectoryHandle(".trash");
      expect(trashHandle.entriesMap.has("TrashFsa.voo")).toBe(true);

      // Restore
      const restoreRes = await driver.restoreFromTrash("TrashFsa.voo");
      expect(restoreRes.ok).toBe(true);

      const restored = await driver.scanFiles();
      expect(restored.find((f) => f.name === "TrashFsa.voo")).toBeDefined();
    });

    it("B8 & B9: deletes permanently and empties trash", async () => {
      await driver.writeFileBytes("Perm.voo", new Uint8Array([1]));
      await driver.moveToTrash("Perm.voo");

      const emptyRes = await driver.emptyTrash();
      expect(emptyRes.ok).toBe(true);

      const trashHandle = await mockRoot.getDirectoryHandle(".trash");
      expect(trashHandle.entriesMap.has("Perm.voo")).toBe(false);
    });
  });

  describe("Suite C: Polymorphic Factory & Auto-Detection", () => {
    it("C1: auto-detects Electron environment when window.electronAPI.workspace exists", () => {
      globalThis.window = {
        electronAPI: {
          workspace: {
            getConfig: vi.fn().mockResolvedValue({ type: "electron", path: "/test" }),
          },
        },
      };

      const engine = getWorkspaceStorage();
      expect(engine.getDriverType()).toBe("electron");
    });

    it("C2: auto-detects Web FSA when window.showDirectoryPicker exists", () => {
      globalThis.window = {
        showDirectoryPicker: vi.fn(),
      };

      const engine = getWorkspaceStorage();
      expect(engine.getDriverType()).toBe("web-fsa");
    });

    it("C3: falls back to Web IDB when neither Electron nor showDirectoryPicker exists", () => {
      delete globalThis.window;

      const engine = getWorkspaceStorage();
      expect(engine.getDriverType()).toBe("web-idb");
    });

    it("C4: preserves singleton instance", () => {
      delete globalThis.window;
      const e1 = getWorkspaceStorage();
      const e2 = getWorkspaceStorage();
      expect(e1).toBe(e2);
    });

    it("C5 & C6: supports subscribe and unsubscribe for mutation events", async () => {
      delete globalThis.window;
      const engine = getWorkspaceStorage();
      await engine.init();

      let eventReceived = null;
      const unsubscribe = engine.subscribe((evt) => {
        eventReceived = evt;
      });

      await engine.writeFileBytes("Notif.voo", new Uint8Array([1]));
      expect(eventReceived).not.toBeNull();
      expect(eventReceived.type).toBe("create");

      eventReceived = null;
      unsubscribe();

      await engine.writeFileBytes("Notif2.voo", new Uint8Array([2]));
      expect(eventReceived).toBeNull();
    });
  });
});
```
