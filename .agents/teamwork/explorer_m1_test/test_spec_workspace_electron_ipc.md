# Test Specification: `tests/unit/workspace_electron_ipc.test.js`
**Target Milestone**: Milestone 1 (Dual-Platform Workspace Storage Engine)  
**Author**: explorer_m1_test  
**Date**: 2026-10-21  

---

## 1. Overview & Test Objectives

The `tests/unit/workspace_electron_ipc.test.js` test suite validates the Electron Desktop backend architecture:
1. **`electron/workspace_manager.cjs` Core Logic**:
   - Workspace root directory configuration and persistence in `projects_config.json` (`userData`).
   - Default directory resolution (`~/Documents/VOO/Projects`) and validation (`isValidProjectsRootDir`).
   - Shallow scanning of design files (`.voo`, `.fig`, `.psd`, `.svg`) with metadata extraction.
   - Atomic file writing and path traversal sanitization.
   - Atomic file renaming with macOS APFS / Windows NTFS case-only intermediate staging.
   - Trash safety: primary `shell.trashItem` with automatic fallback to workspace `.trash/` subfolder or safe unlink.
   - Debounced directory watcher (300ms) with event coalescing.
2. **Main Process IPC & Preload Bridge Verification**:
   - Verification that all 11 `workspace:*` IPC channels are registered and callable via IPC handlers.
   - Verification of `electron/preload.cjs` exposure under both `window.electronAPI.workspace` and `window.vooDesktop.workspace`.
   - Security isolation verification: no leaks, no unconstrained directory write risks, zero regressions on `tests/unit/adversarial_isolation_electron_safety.test.js`.

---

## 2. Test Environment & Mock Harnesses

### 2.1 File System Sandboxing
All file I/O tests operate in an isolated temporary directory created in `beforeEach` and recursively removed in `afterEach`:
```javascript
const testSandboxDir = path.resolve("tests/unit/.tmp-workspace-test");
const testUserDataDir = path.join(testSandboxDir, "userData");
const testDocsDir = path.join(testSandboxDir, "documents");
const testProjectsDir = path.join(testDocsDir, "VOO", "Projects");
```

### 2.2 Electron App & Shell Mocking
```javascript
const mockApp = {
  name: "VOO Design",
  getPath: (name) => {
    if (name === "userData") return testUserDataDir;
    if (name === "documents") return testDocsDir;
    return testSandboxDir;
  },
};

const mockShell = {
  trashItem: vi.fn().mockImplementation(async (filePath) => {
    if (mockShell.forceTrashFailure) {
      throw new Error("Trash not supported on mounted volume");
    }
    // Simulate OS trash by removing or moving to system trash
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    throw new Error("File not found");
  }),
  showItemInFolder: vi.fn(),
  forceTrashFailure: false,
};

const mockDialog = {
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [testProjectsDir] }),
};
```

---

## 3. Detailed Test Matrix & Expected Assertions

### Suite 1: Directory Configuration & Validation

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E1 | `default directory resolution` | Resolves `~/Documents/VOO/Projects` when no config exists | `config.path.endsWith("VOO/Projects") === true`<br>`config.isDefault === true`<br>`config.isConfigured === false` |
| E2 | `valid directory check` | Validates directory existence and write permission | `isValidProjectsRootDir(validDir) === true`<br>`isValidProjectsRootDir("/non/existent") === false`<br>`isValidProjectsRootDir(filePath) === false` |
| E3 | `setProjectsRootDir() persistence` | Writes `{ workspaceRoot }` into `projects_config.json` | `res.ok === true`<br>`fs.existsSync(configPath) === true`<br>`JSON.parse(content).workspaceRoot === targetDir` |
| E4 | `custom config loading` | Loads previously saved workspaceRoot | `config.path === targetDir`<br>`config.isDefault === false`<br>`config.isConfigured === true` |
| E5 | `rejects invalid target directory` | Rejects non-directory or non-writable paths | `res.ok === false`<br>`res.error` describes invalid directory |

---

### Suite 2: File Scanner & Filtering

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E6 | `shallow design file scan` | Scans `.voo`, `.fig`, `.psd`, `.svg` files | Exactly 4 design files returned; metadata contains `name`, `path`, `extension`, `size`, `createdAt`, `updatedAt` |
| E7 | `ignores non-design files` | Ignores `.txt`, `.json`, `.png`, `.DS_Store` | None of the non-design files appear in the returned array |
| E8 | `ignores subdirectories` | Skips `.trash/`, `subfolder/`, `assets/` | Only root-level files returned; subdirectories never returned as files |
| E9 | `sorts by mtime descending` | Files sorted with most recently modified first | `files[0].updatedAt >= files[1].updatedAt` |
| E10 | `handles empty or 0-byte files` | Reads 0-byte design file without throwing | Returns file with `size: 0` safely |

---

### Suite 3: Atomic Writing & Path Security

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E11 | `atomic file writing` | Writes file via temporary `.tmp` then atomic rename | Target file exists with exact binary contents; temporary file cleaned up |
| E12 | `path traversal protection` | Rejects names containing `../` or `..\\` | Returns `{ ok: false, error: /path traversal/i }` |
| E13 | `filename sanitization` | Cleans or escapes illegal filesystem characters | Strips `[/\\:*?"<>|]` from filename |

---

### Suite 4: Atomic Rename & Case-Only Staging

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E14 | `standard file rename` | Renames `OldName.voo` to `NewName.voo` | `res.ok === true`<br>`NewName.voo` exists on disk<br>`OldName.voo` deleted |
| E15 | `collision prevention` | Prevents renaming if target file already exists | `res.ok === false`<br>`res.error` mentions file already exists |
| E16 | `case-only rename staging` | Renames `design.voo` to `Design.voo` on APFS/NTFS | Stages through `__voo_rename_*` intermediate;<br>`Design.voo` exists; case updated without error or data loss |

---

### Suite 5: Trash Safety & Fallback

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E17 | `primary shell.trashItem` | Moves file to OS trash | `mockShell.trashItem` called with `filePath`; returns `{ ok: true }` |
| E18 | `fallback to .trash/ folder` | When `shell.trashItem` fails, moves to `.trash/` | `mockShell.forceTrashFailure = true`; file moved to `.trash/Hero.voo`; returns `{ ok: true }` |
| E19 | `fallback to safe unlink` | When `.trash/` move fails, safe unlink occurs | File unlinked cleanly; returns `{ ok: true }` |
| E20 | `deletePermanently()` | Calls `fs.promises.unlink(filePath)` | File deleted permanently; returns `{ ok: true }` |

---

### Suite 6: Debounced Directory Watcher

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E21 | `watcher debounce coalescing` | Coalesces 5 rapid mutations within 50ms | Callback called exactly ONCE after 300ms debounce interval |
| E22 | `watcher stop and cleanup` | Closes `fs.FSWatcher` and clears pending timers | Subsequent mutations do not trigger callback after `stopWatcher()` |

---

### Suite 7: Electron Main IPC & Preload Integration

| Test # | Test Name | Behavior | Expected Assertions |
|---|---|---|---|
| E23 | `registers all workspace:* channels` | Handlers registered in `ipcMain` | `ipcMainHandlers.has("workspace:getConfig") === true`<br>`ipcMainHandlers.has("workspace:chooseDir") === true`<br>`ipcMainHandlers.has("workspace:scanFiles") === true`<br>`ipcMainHandlers.has("workspace:renameFile") === true`<br>`ipcMainHandlers.has("workspace:moveToTrash") === true` |
| E24 | `preload exposes workspace APIs` | Exposed on `electronAPI` and `vooDesktop` | `exposedApi.electronAPI.workspace` has all methods<br>`exposedApi.vooDesktop.workspace` has all methods |
| E25 | `adversarial security invariants` | Zero regressions on Electron safety test | Context isolation = true, sandbox = false, nodeIntegration = false |

---

## 4. Complete Test Implementation Code Draft

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("Workspace Electron IPC & Filesystem Backend", () => {
  const sandboxDir = path.resolve("tests/unit/.tmp-electron-workspace");
  const userDataDir = path.join(sandboxDir, "userData");
  const docsDir = path.join(sandboxDir, "documents");
  const defaultWorkspaceDir = path.join(docsDir, "VOO", "Projects");
  const configFile = path.join(userDataDir, "projects_config.json");

  let mockShell;
  let mockApp;
  let mockDialog;
  let originalReq;
  let workspaceManager;

  beforeEach(() => {
    // Setup clean sandbox
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(defaultWorkspaceDir, { recursive: true });

    mockShell = {
      trashItem: vi.fn().mockImplementation(async (filePath) => {
        if (mockShell.forceFail) throw new Error("Trash volume error");
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return true;
        }
        throw new Error("File not found");
      }),
      showItemInFolder: vi.fn().mockReturnValue(true),
      forceFail: false,
    };

    mockApp = {
      name: "VOO Design",
      getPath: (key) => {
        if (key === "userData") return userDataDir;
        if (key === "documents") return docsDir;
        return sandboxDir;
      },
    };

    mockDialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [defaultWorkspaceDir] }),
    };

    originalReq = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === "electron") {
        return {
          app: mockApp,
          shell: mockShell,
          dialog: mockDialog,
          ipcMain: { handle: vi.fn() },
        };
      }
      return originalReq.apply(this, arguments);
    };

    // Load workspace manager module
    workspaceManager = require("../../electron/workspace_manager.cjs");
  });

  afterEach(() => {
    Module.prototype.require = originalReq;
    if (workspaceManager && typeof workspaceManager.stopWorkspaceWatcher === "function") {
      workspaceManager.stopWorkspaceWatcher();
    }
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  describe("1. Directory Configuration & Validation", () => {
    it("E1: resolves default ~/Documents/VOO/Projects when no config exists", async () => {
      const config = await workspaceManager.getWorkspaceConfig();
      expect(config.path).toBe(defaultWorkspaceDir);
      expect(config.isDefault).toBe(true);
      expect(config.isConfigured).toBe(false);
    });

    it("E2: validates directory existence and write access", () => {
      expect(workspaceManager.isValidProjectsRootDir(defaultWorkspaceDir)).toBe(true);
      expect(workspaceManager.isValidProjectsRootDir("/path/does/not/exist")).toBe(false);

      // Create a dummy file and test that files are rejected as root dirs
      const dummyFile = path.join(sandboxDir, "file.txt");
      fs.writeFileSync(dummyFile, "test");
      expect(workspaceManager.isValidProjectsRootDir(dummyFile)).toBe(false);
    });

    it("E3 & E4: saves custom workspace directory to projects_config.json and reloads", async () => {
      const customDir = path.join(sandboxDir, "CustomProjects");
      fs.mkdirSync(customDir, { recursive: true });

      const setRes = await workspaceManager.setWorkspaceRoot(customDir);
      expect(setRes.ok).toBe(true);
      expect(setRes.path).toBe(customDir);

      expect(fs.existsSync(configFile)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      expect(saved.workspaceRoot).toBe(customDir);

      const reloaded = await workspaceManager.getWorkspaceConfig();
      expect(reloaded.path).toBe(customDir);
      expect(reloaded.isDefault).toBe(false);
      expect(reloaded.isConfigured).toBe(true);
    });

    it("E5: rejects setting invalid or non-directory path", async () => {
      const res = await workspaceManager.setWorkspaceRoot(path.join(sandboxDir, "non_existent"));
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe("2. File Scanner & Filtering", () => {
    beforeEach(() => {
      // Seed files
      fs.writeFileSync(path.join(defaultWorkspaceDir, "Hero.voo"), "voo content");
      fs.writeFileSync(path.join(defaultWorkspaceDir, "Design.fig"), "fig content");
      fs.writeFileSync(path.join(defaultWorkspaceDir, "Banner.psd"), "psd content");
      fs.writeFileSync(path.join(defaultWorkspaceDir, "Icon.svg"), "svg content");

      // Seed non-design files
      fs.writeFileSync(path.join(defaultWorkspaceDir, "readme.txt"), "text");
      fs.writeFileSync(path.join(defaultWorkspaceDir, "package.json"), "{}");
      fs.writeFileSync(path.join(defaultWorkspaceDir, ".DS_Store"), "ds");

      // Seed subdirectories
      fs.mkdirSync(path.join(defaultWorkspaceDir, "subfolder"), { recursive: true });
      fs.mkdirSync(path.join(defaultWorkspaceDir, ".trash"), { recursive: true });
    });

    it("E6 & E7: scans only design files (.voo, .fig, .psd, .svg) and ignores non-design files", async () => {
      const scanRes = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);
      expect(scanRes.ok).toBe(true);

      const names = scanRes.files.map((f) => f.name);
      expect(names).toContain("Hero.voo");
      expect(names).toContain("Design.fig");
      expect(names).toContain("Banner.psd");
      expect(names).toContain("Icon.svg");

      expect(names).not.toContain("readme.txt");
      expect(names).not.toContain("package.json");
      expect(names).not.toContain(".DS_Store");
      expect(scanRes.files).toHaveLength(4);
    });

    it("E8: skips subdirectories from file listing", async () => {
      const scanRes = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);
      const names = scanRes.files.map((f) => f.name);

      expect(names).not.toContain("subfolder");
      expect(names).not.toContain(".trash");
    });

    it("E9: sorts scanned files by updatedAt descending", async () => {
      const olderTime = new Date(Date.now() - 60000);
      const newerTime = new Date();

      fs.utimesSync(path.join(defaultWorkspaceDir, "Hero.voo"), olderTime, olderTime);
      fs.utimesSync(path.join(defaultWorkspaceDir, "Icon.svg"), newerTime, newerTime);

      const scanRes = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);
      expect(scanRes.files[0].name).toBe("Icon.svg");
    });

    it("E10: safely handles 0-byte design files", async () => {
      fs.writeFileSync(path.join(defaultWorkspaceDir, "Empty.voo"), Buffer.alloc(0));
      const scanRes = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);

      const emptyFile = scanRes.files.find((f) => f.name === "Empty.voo");
      expect(emptyFile).toBeDefined();
      expect(emptyFile.size).toBe(0);
    });
  });

  describe("3. Atomic File Writing & Path Traversal Protection", () => {
    it("E11: writes file atomically to workspace root", async () => {
      const testBytes = Buffer.from([1, 2, 3, 4, 5]);
      const res = await workspaceManager.writeWorkspaceFileBytes(defaultWorkspaceDir, "Created.voo", testBytes);

      expect(res.ok).toBe(true);
      expect(res.file.name).toBe("Created.voo");
      expect(res.file.size).toBe(5);

      const onDisk = fs.readFileSync(path.join(defaultWorkspaceDir, "Created.voo"));
      expect(Array.from(onDisk)).toEqual([1, 2, 3, 4, 5]);
    });

    it("E12: rejects path traversal attempts in filename", async () => {
      const testBytes = Buffer.from([1, 2]);
      const res = await workspaceManager.writeWorkspaceFileBytes(defaultWorkspaceDir, "../../../Exploit.voo", testBytes);

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/traversal|invalid/i);
    });
  });

  describe("4. Atomic Rename & Case-Only Staging", () => {
    it("E14: renames file cleanly on disk", async () => {
      const oldPath = path.join(defaultWorkspaceDir, "OldDoc.voo");
      fs.writeFileSync(oldPath, "test content");

      const res = await workspaceManager.renameWorkspaceFile(oldPath, "NewDoc.voo");
      expect(res.ok).toBe(true);
      expect(res.newPath).toBe(path.join(defaultWorkspaceDir, "NewDoc.voo"));

      expect(fs.existsSync(oldPath)).toBe(false);
      expect(fs.existsSync(res.newPath)).toBe(true);
    });

    it("E15: prevents renaming to existing sibling file name", async () => {
      fs.writeFileSync(path.join(defaultWorkspaceDir, "FileA.voo"), "A");
      fs.writeFileSync(path.join(defaultWorkspaceDir, "FileB.voo"), "B");

      const res = await workspaceManager.renameWorkspaceFile(
        path.join(defaultWorkspaceDir, "FileA.voo"),
        "FileB.voo"
      );

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/already exists/i);
    });

    it("E16: executes case-only rename with intermediate staging", async () => {
      const target = path.join(defaultWorkspaceDir, "lowercase.voo");
      fs.writeFileSync(target, "case test");

      const res = await workspaceManager.renameWorkspaceFile(target, "LowerCase.voo");
      expect(res.ok).toBe(true);
      expect(path.basename(res.newPath)).toBe("LowerCase.voo");

      const content = fs.readFileSync(res.newPath, "utf-8");
      expect(content).toBe("case test");
    });
  });

  describe("5. Trash Safety & Fallback", () => {
    it("E17: moves file to OS trash via shell.trashItem", async () => {
      const target = path.join(defaultWorkspaceDir, "TrashMe.voo");
      fs.writeFileSync(target, "delete me");

      const res = await workspaceManager.moveWorkspaceFileToTrash(target);
      expect(res.ok).toBe(true);
      expect(mockShell.trashItem).toHaveBeenCalledWith(target);
    });

    it("E18: falls back to hidden .trash/ directory when shell.trashItem fails", async () => {
      mockShell.forceFail = true;
      const target = path.join(defaultWorkspaceDir, "FallbackTrash.voo");
      fs.writeFileSync(target, "fallback");

      const res = await workspaceManager.moveWorkspaceFileToTrash(target);
      expect(res.ok).toBe(true);

      expect(fs.existsSync(target)).toBe(false);
      const trashFolder = path.join(defaultWorkspaceDir, ".trash");
      expect(fs.existsSync(path.join(trashFolder, "FallbackTrash.voo"))).toBe(true);
    });

    it("E20: permanently deletes file using unlink", async () => {
      const target = path.join(defaultWorkspaceDir, "PermKill.voo");
      fs.writeFileSync(target, "kill");

      const res = await workspaceManager.deleteWorkspaceFilePermanently(target);
      expect(res.ok).toBe(true);
      expect(fs.existsSync(target)).toBe(false);
    });
  });

  describe("6. Debounced Directory Watcher", () => {
    it("E21: coalesces rapid multiple file writes into debounced notification", async () => {
      vi.useFakeTimers();
      let callCount = 0;

      workspaceManager.startWorkspaceWatcher(defaultWorkspaceDir, () => {
        callCount++;
      });

      // Simulate 5 rapid trigger events
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(defaultWorkspaceDir, `Rapid${i}.voo`), "content");
      }

      // Before debounce interval
      vi.advanceTimersByTime(150);
      expect(callCount).toBe(0);

      // Advance past 300ms debounce
      vi.advanceTimersByTime(200);
      expect(callCount).toBe(1);

      vi.useRealTimers();
    });

    it("E22: cleanly stops watcher and clears pending timers", () => {
      vi.useFakeTimers();
      let callCount = 0;

      workspaceManager.startWorkspaceWatcher(defaultWorkspaceDir, () => {
        callCount++;
      });

      fs.writeFileSync(path.join(defaultWorkspaceDir, "StopTest.voo"), "test");
      workspaceManager.stopWorkspaceWatcher();

      vi.advanceTimersByTime(500);
      expect(callCount).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("7. Electron Main & Preload Bridge Contracts", () => {
    it("E23: registers all required workspace:* IPC channels", () => {
      const registeredChannels = new Set();
      const mockIpcMain = {
        handle: (channel) => registeredChannels.add(channel),
      };

      workspaceManager.registerWorkspaceIpc(mockIpcMain);

      expect(registeredChannels.has("workspace:getConfig")).toBe(true);
      expect(registeredChannels.has("workspace:chooseDir")).toBe(true);
      expect(registeredChannels.has("workspace:setDir")).toBe(true);
      expect(registeredChannels.has("workspace:getDefaultDirectory")).toBe(true);
      expect(registeredChannels.has("workspace:scanFiles")).toBe(true);
      expect(registeredChannels.has("workspace:readFileBytes")).toBe(true);
      expect(registeredChannels.has("workspace:writeFileBytes")).toBe(true);
      expect(registeredChannels.has("workspace:renameFile")).toBe(true);
      expect(registeredChannels.has("workspace:moveToTrash")).toBe(true);
      expect(registeredChannels.has("workspace:deletePermanently")).toBe(true);
      expect(registeredChannels.has("workspace:revealInFinder")).toBe(true);
    });
  });
});
```
