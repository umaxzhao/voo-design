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
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: [defaultWorkspaceDir],
      }),
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
      try {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      } catch {}
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
      const newerTime = new Date(Date.now() + 10000);

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
      const res = await workspaceManager.writeWorkspaceFileBytes(
        defaultWorkspaceDir,
        "Created.voo",
        testBytes
      );

      expect(res.ok).toBe(true);
      expect(res.file.name).toBe("Created.voo");
      expect(res.file.size).toBe(5);

      const onDisk = fs.readFileSync(path.join(defaultWorkspaceDir, "Created.voo"));
      expect(Array.from(onDisk)).toEqual([1, 2, 3, 4, 5]);
    });

    it("E12: rejects path traversal attempts in filename", async () => {
      const testBytes = Buffer.from([1, 2]);
      const res = await workspaceManager.writeWorkspaceFileBytes(
        defaultWorkspaceDir,
        "../../../Exploit.voo",
        testBytes
      );

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
      let callCount = 0;
      workspaceManager.startWorkspaceWatcher(defaultWorkspaceDir, () => {
        callCount++;
      });

      // Allow OS fs.watch handle to bind
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Write files
      for (let i = 0; i < 3; i++) {
        fs.writeFileSync(path.join(defaultWorkspaceDir, `Rapid${i}.voo`), "content");
      }

      // Wait for debounce timer to fire
      await new Promise((resolve) => setTimeout(resolve, 650));

      expect(callCount).toBeGreaterThanOrEqual(1);
      // Coalescing ensures it did not fire once per write (i.e. <= 2 instead of 3+)
      expect(callCount).toBeLessThan(3);
    });

    it("E22: cleanly stops watcher and clears pending timers", async () => {
      let callCount = 0;
      workspaceManager.startWorkspaceWatcher(defaultWorkspaceDir, () => {
        callCount++;
      });

      fs.writeFileSync(path.join(defaultWorkspaceDir, "StopTest.voo"), "test");
      workspaceManager.stopWorkspaceWatcher();

      await new Promise((resolve) => setTimeout(resolve, 650));
      expect(callCount).toBe(0);
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

    it("E24: exposes workspace on electronAPI and vooDesktop in preload.cjs", () => {
      let exposedDesktop = null;
      let exposedElectronAPI = null;
      const mockContextBridge = {
        exposeInMainWorld: (key, obj) => {
          if (key === "vooDesktop") exposedDesktop = obj;
          if (key === "electronAPI") exposedElectronAPI = obj;
        },
      };
      const mockIpcRenderer = {
        invoke: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      const originalReqPreload = Module.prototype.require;
      Module.prototype.require = function (id) {
        if (id === "electron") {
          return {
            contextBridge: mockContextBridge,
            ipcRenderer: mockIpcRenderer,
          };
        }
        return originalReqPreload.apply(this, arguments);
      };

      try {
        require("../../electron/preload.cjs");
        expect(exposedDesktop).toBeDefined();
        expect(exposedDesktop.workspace).toBeDefined();
        expect(typeof exposedDesktop.workspace.getConfig).toBe("function");

        expect(exposedElectronAPI).toBeDefined();
        expect(exposedElectronAPI.workspace).toBeDefined();
        expect(typeof exposedElectronAPI.workspace.getConfig).toBe("function");
        expect(typeof exposedElectronAPI.workspace.chooseDirectory).toBe("function");
        expect(typeof exposedElectronAPI.workspace.scanFiles).toBe("function");
      } finally {
        Module.prototype.require = originalReqPreload;
      }
    });
  });
});
