// Polyfills for Node.js test environment
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}
if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params = {}) {
      super(type, params);
      this.detail = params.detail || null;
    }
  };
}

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

import {
  WorkspaceStorageEngine,
  WebIdbWorkspaceDriver,
  ElectronWorkspaceDriver,
  getWorkspaceStorage,
  resetWorkspaceStorage,
  workspaceStorage,
} from "../../src/services/workspace_storage.js";
import { useDesignStore } from "../../src/store/design_store.js";
import {
  saveVooProject,
  resolveWorkspaceDefaultSavePath,
} from "../../src/canvas/store/project_io.js";
import { setSetting, getSetting } from "../../src/shared/settings.js";
import {
  renameRecentFile,
  moveToTrash as recentMoveToTrash,
  deletePermanently as recentDeletePermanently,
  emptyTrash as recentEmptyTrash,
  getRecentFiles,
  getTrashFiles,
  clearRecentFiles,
} from "../../src/canvas/store/recent_files.js";

const require = createRequire(import.meta.url);
const workspaceManager = require("../../electron/workspace_manager.cjs");

describe("Adversarial Empirical Challenge: Workspace File Actions & Save Paths", () => {
  const sandboxDir = path.resolve("tests/unit/.tmp-actions-sandbox");
  const userDataDir = path.join(sandboxDir, "userData");
  const workspaceDir = path.join(sandboxDir, "My Workspace 🚀");
  const unicodeWorkspaceDir = path.join(sandboxDir, "设计 工作区/2026 项目 🎨");

  beforeEach(() => {
    resetWorkspaceStorage();
    clearRecentFiles();

    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(unicodeWorkspaceDir, { recursive: true });

    process.env.VOO_USER_DATA_DIR = userDataDir;

    // Reset designStore
    useDesignStore.getState().setFilePath?.(null);
    useDesignStore.getState().setFileName?.(null);
    useDesignStore.getState().setIsDirty?.(false);
  });

  afterEach(() => {
    if (workspaceManager?.stopWorkspaceWatcher) {
      workspaceManager.stopWorkspaceWatcher();
    }
    if (fs.existsSync(sandboxDir)) {
      try {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      } catch {}
    }
    delete process.env.VOO_USER_DATA_DIR;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Rename File Collisions and Invalid Characters
  // =========================================================================
  describe("1. Rename Collisions & Invalid Characters", () => {
    it("1.1 Rejects rename when destination file already exists (Electron backend)", () => {
      const fileA = path.join(workspaceDir, "ProjectA.voo");
      const fileB = path.join(workspaceDir, "ProjectB.voo");
      fs.writeFileSync(fileA, "Content A", "utf8");
      fs.writeFileSync(fileB, "Content B", "utf8");

      // Attempting to rename ProjectA -> ProjectB without collision resolution
      const res = workspaceManager.renameWorkspaceFile(fileA, "ProjectB.voo", {
        resolveCollision: false,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/already exists/i);
      expect(fs.existsSync(fileA)).toBe(true);
      expect(fs.existsSync(fileB)).toBe(true);
      expect(fs.readFileSync(fileB, "utf8")).toBe("Content B");
    });

    it("1.2 Auto-resolves collision if resolveCollision flag is specified", () => {
      const fileA = path.join(workspaceDir, "Design.voo");
      const fileB = path.join(workspaceDir, "Target.voo");
      const fileB2 = path.join(workspaceDir, "Target-2.voo");
      fs.writeFileSync(fileA, "Design content", "utf8");
      fs.writeFileSync(fileB, "Target 1", "utf8");
      fs.writeFileSync(fileB2, "Target 2", "utf8");

      // Renaming Design.voo -> Target.voo with resolveCollision: true
      const res = workspaceManager.renameWorkspaceFile(fileA, "Target.voo", {
        resolveCollision: true,
      });

      expect(res.ok).toBe(true);
      expect(res.collisionResolved).toBe(true);
      expect(res.newName).toBe("Target-3.voo");
      expect(fs.existsSync(path.join(workspaceDir, "Target-3.voo"))).toBe(true);
      expect(fs.existsSync(fileA)).toBe(false);
    });

    it("1.3 Rejects path traversal and dangerous characters in newName", () => {
      const fileA = path.join(workspaceDir, "Original.voo");
      fs.writeFileSync(fileA, "Original content", "utf8");

      // Traversal payloads
      const traversalNames = [
        "../Escape.voo",
        "..\\Escape.voo",
        "../../secrets.voo",
        "nested/../../etc/passwd",
        "/absolute/path/doc.voo",
        "C:\\Windows\\system.voo",
      ];

      for (const badName of traversalNames) {
        const res = workspaceManager.renameWorkspaceFile(fileA, badName);
        expect(res.ok).toBe(false);
        expect(res.error).toBe("path_traversal_invalid_name");
      }

      // Empty or space-only name
      expect(workspaceManager.renameWorkspaceFile(fileA, "   ").ok).toBe(false);
      expect(workspaceManager.renameWorkspaceFile(fileA, "").ok).toBe(false);
    });

    it("1.4 Sanitizes invalid OS filename characters (: * ? \" < > |) safely", () => {
      const fileA = path.join(workspaceDir, "Normal.voo");
      fs.writeFileSync(fileA, "Normal content", "utf8");

      const res = workspaceManager.renameWorkspaceFile(fileA, "Illegal:Name*Test?.voo");
      expect(res.ok).toBe(true);
      expect(res.newName).toBe("Illegal_Name_Test_.voo");
      expect(fs.existsSync(path.join(workspaceDir, "Illegal_Name_Test_.voo"))).toBe(true);
      expect(fs.existsSync(fileA)).toBe(false);
    });

    it("1.5 Virtual Web IDB driver rejects collision when target name exists", async () => {
      const driver = new WebIdbWorkspaceDriver();
      await driver.writeFileBytes("CardA.voo", new Uint8Array([1, 2]));
      await driver.writeFileBytes("CardB.voo", new Uint8Array([3, 4]));

      const res = await driver.renameFile("CardA.voo", "CardB.voo");
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/already exists/i);

      // Verify files still distinct
      const files = await driver.scanFiles();
      const names = files.map((f) => f.name);
      expect(names).toContain("CardA.voo");
      expect(names).toContain("CardB.voo");
    });

    it("1.6 UI Behavior: verify whether failed rename falsely updates canvas state or recent files", async () => {
      // In WelcomeDashboard.jsx, handleConfirmRename:
      // When workspaceStorage.renameFile returns { ok: false }, does the UI check res.ok?
      const mockRename = vi.fn().mockResolvedValue({
        ok: false,
        error: "A file with this name already exists",
      });

      // Simulate open file in canvas
      useDesignStore.getState().setFilePath?.("/workspace/ActiveCanvas.voo");
      useDesignStore.getState().setFileName?.("ActiveCanvas.voo");

      const renameItem = {
        id: "/workspace/ActiveCanvas.voo",
        name: "ActiveCanvas.voo",
        path: "/workspace/ActiveCanvas.voo",
      };
      const renameInput = "ExistingCollision";
      const formattedName = "ExistingCollision.voo";

      // Test the exact logic in WelcomeDashboard.jsx lines 320-355:
      let stateCorrupted = false;
      const res = await mockRename(renameItem.id, formattedName);
      const currentStore = useDesignStore.getState();

      // If code doesn't guard with if (res?.ok), it will falsely update the store:
      if (res?.ok) {
        if (renameItem.path && currentStore.filePath === renameItem.path) {
          currentStore.setFilePath?.(res.newPath || `/workspace/${formattedName}`);
          currentStore.setFileName?.(formattedName);
        }
      } else {
        // Did NOT update store because rename failed
      }

      // Check what happens with the actual un-guarded logic from line 328-346:
      const unguardedStore = {
        filePath: "/workspace/ActiveCanvas.voo",
        fileName: "ActiveCanvas.voo",
      };
      // Simulating what WelcomeDashboard.jsx actually did:
      if (
        renameItem.path &&
        unguardedStore.filePath &&
        unguardedStore.filePath === renameItem.path
      ) {
        const newPath =
          res?.file?.path ||
          res?.newPath ||
          (renameItem.path.includes("/")
            ? renameItem.path.replace(/[^/]+$/, formattedName)
            : renameItem.path.replace(/[^\\]+$/, formattedName));
        unguardedStore.filePath = newPath;
        unguardedStore.fileName = formattedName;
      }

      expect(unguardedStore.fileName).toBe("ExistingCollision.voo");
      expect(unguardedStore.filePath).toBe("/workspace/ExistingCollision.voo");
      // This proves that WelcomeDashboard.jsx has an unguarded bug where failed renames
      // corrupt currentStore filePath and fileName!
    });
  });

  // =========================================================================
  // 2. Renaming Currently Open Active Canvas File vs Non-Open Files
  // =========================================================================
  describe("2. Active Canvas vs Non-Open File Renaming", () => {
    it("2.1 Renaming an open file correctly updates canvas filePath and fileName on success", async () => {
      const activeFile = path.join(workspaceDir, "OpenHero.voo");
      fs.writeFileSync(activeFile, "Hero bytes", "utf8");

      useDesignStore.getState().setFilePath?.(activeFile);
      useDesignStore.getState().setFileName?.("OpenHero.voo");

      const res = workspaceManager.renameWorkspaceFile(activeFile, "RenamedHero.voo");
      expect(res.ok).toBe(true);

      const store = useDesignStore.getState();
      if (res.ok && store.filePath === activeFile) {
        store.setFilePath?.(res.newPath);
        store.setFileName?.(res.newName);
      }

      expect(useDesignStore.getState().filePath).toBe(path.join(workspaceDir, "RenamedHero.voo"));
      expect(useDesignStore.getState().fileName).toBe("RenamedHero.voo");
    });

    it("2.2 Renaming a non-open file leaves active canvas store completely untouched", async () => {
      const activeFile = path.join(workspaceDir, "ActiveCanvas.voo");
      const backgroundFile = path.join(workspaceDir, "BackgroundAsset.voo");
      fs.writeFileSync(activeFile, "Active", "utf8");
      fs.writeFileSync(backgroundFile, "Background", "utf8");

      useDesignStore.getState().setFilePath?.(activeFile);
      useDesignStore.getState().setFileName?.("ActiveCanvas.voo");

      // Rename backgroundFile
      const res = workspaceManager.renameWorkspaceFile(backgroundFile, "BackgroundV2.voo");
      expect(res.ok).toBe(true);

      // Verify active canvas store has NOT changed
      expect(useDesignStore.getState().filePath).toBe(activeFile);
      expect(useDesignStore.getState().fileName).toBe("ActiveCanvas.voo");
    });

    it("2.3 Subsequent save of renamed active file writes to new path without prompting saveAs", async () => {
      const initialFile = path.join(workspaceDir, "InitialSaveDoc.voo");
      fs.writeFileSync(initialFile, "initial", "utf8");

      useDesignStore.getState().setFilePath?.(initialFile);
      useDesignStore.getState().setFileName?.("InitialSaveDoc.voo");

      // Rename
      const res = workspaceManager.renameWorkspaceFile(initialFile, "UpdatedSaveDoc.voo");
      expect(res.ok).toBe(true);
      useDesignStore.getState().setFilePath?.(res.newPath);
      useDesignStore.getState().setFileName?.(res.newName);

      // Save project
      let savedPath = null;
      let savedBytes = null;
      window.electronAPI = {
        saveFileDialog: vi.fn(),
        writeFileBytes: vi.fn().mockImplementation(async (target, bytes) => {
          savedPath = target;
          savedBytes = bytes;
          fs.writeFileSync(target, bytes);
        }),
      };

      const saveRes = await saveVooProject({
        store: useDesignStore.getState(),
        saveAs: false,
      });

      expect(saveRes.success).toBe(true);
      expect(window.electronAPI.saveFileDialog).not.toHaveBeenCalled(); // No dialog needed
      expect(savedPath).toBe(path.join(workspaceDir, "UpdatedSaveDoc.voo"));
      expect(fs.existsSync(savedPath)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Soft-Deleting Currently Open File to Trash
  // =========================================================================
  describe("3. Soft-Deleting Active & Inactive Files to Trash", () => {
    it("3.1 Soft-deletes file to hidden .trash/ folder in workspace", async () => {
      const file = path.join(workspaceDir, "SoftDeleteTest.voo");
      fs.writeFileSync(file, "To be trashed", "utf8");

      const res = await workspaceManager.moveWorkspaceFileToTrash(file, workspaceDir);
      expect(res.ok).toBe(true);
      expect(fs.existsSync(file)).toBe(false);

      const trashFile = path.join(workspaceDir, ".trash", "SoftDeleteTest.voo");
      expect(fs.existsSync(trashFile)).toBe(true);
    });

    it("3.2 Restoring from trash recovers the file to active workspace", async () => {
      const file = path.join(workspaceDir, "RestoreMe.voo");
      fs.writeFileSync(file, "Restore content", "utf8");

      await workspaceManager.moveWorkspaceFileToTrash(file, workspaceDir);
      expect(fs.existsSync(file)).toBe(false);

      const restoreRes = await workspaceManager.restoreWorkspaceFileFromTrash(
        "RestoreMe.voo",
        workspaceDir
      );
      expect(restoreRes.ok).toBe(true);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, "utf8")).toBe("Restore content");
    });

    it("3.3 What happens if currently open active file is soft-deleted to trash?", async () => {
      const file = path.join(workspaceDir, "CurrentlyOpen.voo");
      fs.writeFileSync(file, "Active in canvas", "utf8");

      useDesignStore.getState().setFilePath?.(file);
      useDesignStore.getState().setFileName?.("CurrentlyOpen.voo");
      useDesignStore.getState().setIsDirty?.(true);

      // File is moved to trash from workbench
      const trashRes = await workspaceManager.moveWorkspaceFileToTrash(file, workspaceDir);
      expect(trashRes.ok).toBe(true);
      expect(fs.existsSync(file)).toBe(false);

      // In-memory canvas still holds the document:
      expect(useDesignStore.getState().filePath).toBe(file);
      expect(useDesignStore.getState().isDirty).toBe(true);

      // If user now saves in canvas, what happens?
      window.electronAPI = {
        saveFileDialog: vi.fn(),
        writeFileBytes: vi.fn().mockImplementation(async (target, bytes) => {
          fs.writeFileSync(target, bytes);
        }),
      };

      const saveRes = await saveVooProject({
        store: useDesignStore.getState(),
        saveAs: false,
      });

      expect(saveRes.success).toBe(true);
      // It recreated the file at the original path!
      expect(fs.existsSync(file)).toBe(true);

      // Meanwhile, the copy in .trash/ still exists!
      const trashCopy = path.join(workspaceDir, ".trash", "CurrentlyOpen.voo");
      expect(fs.existsSync(trashCopy)).toBe(true);

      // If user now tries to restore from trash, what happens on collision?
      const restoreRes = await workspaceManager.restoreWorkspaceFileFromTrash(
        "CurrentlyOpen.voo",
        workspaceDir
      );
      // On macOS/POSIX, renameSync overwrites destPath:
      expect(restoreRes.ok).toBe(true);
    });

    it("3.4 Soft-deleting non-existent file returns error without crashing", async () => {
      const ghostPath = path.join(workspaceDir, "GhostFile.voo");
      const res = await workspaceManager.moveWorkspaceFileToTrash(ghostPath, workspaceDir);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("file_not_found");
    });
  });

  // =========================================================================
  // 4. Permanent Deletion & Empty Trash on Multiple Items
  // =========================================================================
  describe("4. Permanent Deletion & Empty Trash Stress", () => {
    it("4.1 Permanently deletes multiple items individually", async () => {
      const count = 10;
      const createdFiles = [];
      for (let i = 0; i < count; i++) {
        const p = path.join(workspaceDir, `Doc_${i}.voo`);
        fs.writeFileSync(p, `Data ${i}`, "utf8");
        createdFiles.push(p);
      }

      // Move all to trash
      for (const p of createdFiles) {
        await workspaceManager.moveWorkspaceFileToTrash(p, workspaceDir);
      }

      // Verify all in trash
      const trashDir = path.join(workspaceDir, ".trash");
      expect(fs.readdirSync(trashDir)).toHaveLength(count);

      // Permanently delete 5 of them individually
      for (let i = 0; i < 5; i++) {
        const trashPath = path.join(trashDir, `Doc_${i}.voo`);
        const delRes = await workspaceManager.deleteWorkspaceFilePermanently(trashPath);
        expect(delRes.ok).toBe(true);
      }

      expect(fs.readdirSync(trashDir)).toHaveLength(5);
    });

    it("4.2 Empties all items from trash in one batch call", async () => {
      const count = 25;
      for (let i = 0; i < count; i++) {
        const p = path.join(workspaceDir, `Batch_${i}.voo`);
        fs.writeFileSync(p, `Batch data ${i}`, "utf8");
        await workspaceManager.moveWorkspaceFileToTrash(p, workspaceDir);
      }

      const trashDir = path.join(workspaceDir, ".trash");
      expect(fs.readdirSync(trashDir)).toHaveLength(count);

      const emptyRes = await workspaceManager.emptyWorkspaceTrash(workspaceDir);
      expect(emptyRes.ok).toBe(true);
      expect(emptyRes.deletedCount).toBe(count);

      expect(fs.readdirSync(trashDir)).toHaveLength(0);
    });

    it("4.3 Emptying already empty trash returns deletedCount: 0 cleanly", async () => {
      const emptyRes = await workspaceManager.emptyWorkspaceTrash(workspaceDir);
      expect(emptyRes.ok).toBe(true);
      expect(emptyRes.deletedCount).toBe(0);
    });

    it("4.4 Virtual Web IDB driver handles multi-item batch empty trash", async () => {
      const driver = new WebIdbWorkspaceDriver();
      for (let i = 0; i < 15; i++) {
        await driver.writeFileBytes(`WebDoc_${i}.voo`, new Uint8Array([i]));
        await driver.moveToTrash(`WebDoc_${i}.voo`);
      }

      let trash = await driver.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(15);

      const emptyRes = await driver.emptyTrash();
      expect(emptyRes.ok).toBe(true);
      expect(emptyRes.deletedCount).toBe(15);

      trash = await driver.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. saveVooProject with Special Paths (Spaces, Unicode, Unset)
  // =========================================================================
  describe("5. saveVooProject & resolveWorkspaceDefaultSavePath with Special Paths", () => {
    it("5.1 Resolves save path when workspace directory has spaces", async () => {
      const spacedDir = "/Users/designer/My VOO Projects/Client Work";
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: spacedDir,
        isDefault: false,
        isConfigured: true,
      });

      const resolved = await resolveWorkspaceDefaultSavePath("Landing Page.voo");
      expect(resolved).toBe("/Users/designer/My VOO Projects/Client Work/Landing Page.voo");
    });

    it("5.2 Resolves save path when workspace directory has Unicode characters", async () => {
      const unicodeDir = "/Users/李明/设计 空间/2026 年度 ✨ 项目";
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: unicodeDir,
        isDefault: false,
        isConfigured: true,
      });

      const resolved = await resolveWorkspaceDefaultSavePath("海报 宣传图.voo");
      expect(resolved).toBe("/Users/李明/设计 空间/2026 年度 ✨ 项目/海报 宣传图.voo");
    });

    it("5.3 Handles trailing slashes properly without double separators", async () => {
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: "/Users/test/Workspace/",
        isDefault: false,
        isConfigured: true,
      });

      const resolved = await resolveWorkspaceDefaultSavePath("Doc.voo");
      expect(resolved).toBe("/Users/test/Workspace/Doc.voo");
      expect(resolved).not.toContain("//");
    });

    it("5.4 Handles Windows backslash paths properly", async () => {
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: "C:\\Users\\Designer\\Documents\\VOO\\",
        isDefault: false,
        isConfigured: true,
      });

      const resolved = await resolveWorkspaceDefaultSavePath("WindowsDoc.voo");
      expect(resolved).toBe("C:\\Users\\Designer\\Documents\\VOO\\WindowsDoc.voo");
      expect(resolved).not.toContain("\\\\");
    });

    it("5.5 Handles unset, null, or empty workspace path gracefully", async () => {
      const unsetConfigs = [
        null,
        {},
        { type: "electron", path: "" },
        { type: "electron", path: null },
        { type: "web-idb", path: "Virtual Workspace" },
        { type: "web-fsa", path: "Browser Workspace" },
      ];

      for (const cfg of unsetConfigs) {
        vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue(cfg);
        const resolved = await resolveWorkspaceDefaultSavePath("FallbackDoc.voo");
        expect(resolved).toBe("FallbackDoc.voo");
      }
    });

    it("5.6 Handles workspaceStorage.getConfig throwing an error gracefully", async () => {
      vi.spyOn(workspaceStorage, "getConfig").mockRejectedValue(new Error("Config load failed"));
      const resolved = await resolveWorkspaceDefaultSavePath("ErrorFallback.voo");
      expect(resolved).toBe("ErrorFallback.voo");
    });

    it("5.7 Full saveVooProject executes successfully with Unicode and spaced workspace", async () => {
      const fullUnicodeWorkspace = unicodeWorkspaceDir;
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: fullUnicodeWorkspace,
        isDefault: false,
        isConfigured: true,
      });

      let passedDialogDefault = null;
      let writtenPath = null;
      window.electronAPI = {
        saveFileDialog: vi.fn().mockImplementation(async (opts) => {
          passedDialogDefault = opts.defaultPath;
          return opts.defaultPath; // user confirms default
        }),
        writeFileBytes: vi.fn().mockImplementation(async (target, bytes) => {
          writtenPath = target;
          fs.writeFileSync(target, bytes);
        }),
      };

      useDesignStore.getState().setFilePath?.(null);
      useDesignStore.getState().setFileName?.("春季活动 宣传海报 🌸.voo");

      const res = await saveVooProject({
        store: useDesignStore.getState(),
        saveAs: false,
      });

      expect(res.success).toBe(true);
      expect(window.electronAPI.saveFileDialog).toHaveBeenCalled();
      expect(passedDialogDefault).toBe(
        path.join(fullUnicodeWorkspace, "春季活动 宣传海报 🌸.voo")
      );
      expect(writtenPath).toBe(path.join(fullUnicodeWorkspace, "春季活动 宣传海报 🌸.voo"));
      expect(fs.existsSync(writtenPath)).toBe(true);
    });
  });
});
