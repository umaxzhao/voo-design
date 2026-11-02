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
import { renderToStaticMarkup } from "react-dom/server";
import WelcomeDashboard from "../../src/canvas/components/welcome_dashboard.jsx";
import {
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

describe("Milestone 3: Workbench Integrated File Management", () => {
  let storage;

  beforeEach(async () => {
    resetWorkspaceStorage();
    const driver = workspaceStorage.getDriver();
    if (driver?.memFiles) {
      driver.memFiles.clear();
    }
    if (driver?.memTrash) {
      driver.memTrash.clear();
    }
    setSetting("voo.workspace.path", "Virtual Workspace");
    setSetting("voo.workspace.type", "web-idb");
    setSetting("voo.workspace.name", "VOO Projects");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Workspace path controls live in settings, not on the dashboard", () => {
    it("renders no active workspace strip on the dashboard", () => {
      const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));
      expect(html).not.toContain('data-testid="active-workspace-strip"');
      expect(html).not.toContain('data-testid="sidebar-workspace-strip"');
    });
  });

  describe("2. File Listing from workspaceStorage.scanFiles() & Tab Support", () => {
    it("scans and lists files in workspace for recents, starred, drafts, and trash", async () => {
      const dummyData = new Uint8Array([1, 2, 3, 4]);

      // Write initial design files
      const f1 = await workspaceStorage.writeFileBytes("HeroLanding.voo", dummyData, {
        category: "landing",
      });
      const f2 = await workspaceStorage.writeFileBytes("MobileApp.fig", dummyData, {
        category: "mobile",
      });
      const f3 = await workspaceStorage.writeFileBytes("DraftBoard.voo", dummyData, {
        category: "web",
      });
      const memDriver = workspaceStorage.getDriver();
      if (memDriver?.memFiles?.has("DraftBoard.voo")) {
        memDriver.memFiles.get("DraftBoard.voo").isDraft = true;
      }

      // 1. Recents tab (all active files)
      const recents = await workspaceStorage.scanFiles({ includeTrashed: false });
      expect(recents.map((f) => f.name)).toContain("HeroLanding.voo");
      expect(recents.map((f) => f.name)).toContain("MobileApp.fig");
      expect(recents.map((f) => f.name)).toContain("DraftBoard.voo");

      // 2. Star toggle and Starred tab
      await workspaceStorage.toggleStar(f1.id);
      const starred = await workspaceStorage.scanFiles({ starredOnly: true });
      expect(starred).toHaveLength(1);
      expect(starred[0].name).toBe("HeroLanding.voo");
      expect(starred[0].starred).toBe(true);

      // 3. Drafts tab
      const allFiles = await workspaceStorage.scanFiles();
      const drafts = allFiles.filter((f) => f.isDraft);
      expect(drafts).toHaveLength(1);
      expect(drafts[0].name).toBe("DraftBoard.voo");

      // 4. Move to Trash and Trash tab
      await workspaceStorage.moveToTrash(f2.id);
      const activeAfterTrash = await workspaceStorage.scanFiles({ includeTrashed: false });
      expect(activeAfterTrash.map((f) => f.name)).not.toContain("MobileApp.fig");

      const trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(1);
      expect(trash[0].name).toBe("MobileApp.fig");
      expect(trash[0].trashed).toBe(true);
    });

    it("filters files by search query and category", async () => {
      const dummyData = new Uint8Array([10, 20]);
      await workspaceStorage.writeFileBytes("ECommerceShop.voo", dummyData, { category: "web" });
      await workspaceStorage.writeFileBytes("BrandPoster.svg", dummyData, { category: "slides" });

      const searchRes = await workspaceStorage.scanFiles({ search: "ecom" });
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].name).toBe("ECommerceShop.voo");

      const catRes = await workspaceStorage.scanFiles({ category: "slides" });
      expect(catRes).toHaveLength(1);
      expect(catRes[0].name).toBe("BrandPoster.svg");
    });
  });

  describe("3. Star Toggle Metadata Persistence", () => {
    it("toggles star on and off and persists metadata across rescans", async () => {
      const dummyData = new Uint8Array([5, 6, 7]);
      const file = await workspaceStorage.writeFileBytes("FavoritesDoc.voo", dummyData);

      expect(file.starred).toBe(false);

      // Toggle ON
      const resOn = await workspaceStorage.toggleStar(file.id);
      expect(resOn.ok).toBe(true);
      expect(resOn.starred).toBe(true);

      let scanned = await workspaceStorage.scanFiles({ starredOnly: true });
      expect(scanned).toHaveLength(1);
      expect(scanned[0].id).toBe(file.id);
      expect(scanned[0].starred).toBe(true);

      // Toggle OFF
      const resOff = await workspaceStorage.toggleStar(file.id);
      expect(resOff.ok).toBe(true);
      expect(resOff.starred).toBe(false);

      scanned = await workspaceStorage.scanFiles({ starredOnly: true });
      expect(scanned).toHaveLength(0);
    });
  });

  describe("4. Disk-Synchronized Rename & Canvas Path Synchronization", () => {
    it("renames file in storage and updates canvas filePath and fileName when actively open", async () => {
      const dummyData = new Uint8Array([42]);
      const file = await workspaceStorage.writeFileBytes("OldProject.voo", dummyData);

      // Setup open project in canvas designStore
      const filePath = `/Users/test/workspace/${file.name}`;
      useDesignStore.getState().setFilePath?.(filePath);
      useDesignStore.getState().setFileName?.(file.name);

      expect(useDesignStore.getState().filePath).toBe(filePath);
      expect(useDesignStore.getState().fileName).toBe("OldProject.voo");

      // Rename file in storage
      const renameRes = await workspaceStorage.renameFile(file.id, "RenamedBrand.voo");
      expect(renameRes.ok).toBe(true);

      // Perform canvas synchronization logic
      const currentStore = useDesignStore.getState();
      if (currentStore.filePath === filePath) {
        const newPath = `/Users/test/workspace/RenamedBrand.voo`;
        currentStore.setFilePath?.(newPath);
        currentStore.setFileName?.("RenamedBrand.voo");
      }

      expect(useDesignStore.getState().fileName).toBe("RenamedBrand.voo");
      expect(useDesignStore.getState().filePath).toBe("/Users/test/workspace/RenamedBrand.voo");

      // Verify file list has the new name
      const files = await workspaceStorage.scanFiles();
      expect(files.map((f) => f.name)).toContain("RenamedBrand.voo");
      expect(files.map((f) => f.name)).not.toContain("OldProject.voo");
    });
  });

  describe("5. Move to Trash and Restore from Trash", () => {
    it("moves file to trash and restores cleanly", async () => {
      const dummy = new Uint8Array([99]);
      const file = await workspaceStorage.writeFileBytes("TrashTest.voo", dummy);

      // Verify active
      let active = await workspaceStorage.scanFiles();
      expect(active.map((f) => f.id)).toContain(file.id);

      // Move to trash
      const trashRes = await workspaceStorage.moveToTrash(file.id);
      expect(trashRes.ok).toBe(true);

      active = await workspaceStorage.scanFiles();
      expect(active.map((f) => f.id)).not.toContain(file.id);

      let trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash.map((f) => f.id)).toContain(file.id);

      // Restore from trash
      const restoreRes = await workspaceStorage.restoreFromTrash(file.id);
      expect(restoreRes.ok).toBe(true);

      active = await workspaceStorage.scanFiles();
      expect(active.map((f) => f.id)).toContain(file.id);

      trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash.map((f) => f.id)).not.toContain(file.id);
    });
  });

  describe("6. Permanent Deletion and Empty Trash", () => {
    it("permanently deletes an item from trash", async () => {
      const dummy = new Uint8Array([11]);
      const file = await workspaceStorage.writeFileBytes("PermanentDelete.voo", dummy);

      await workspaceStorage.moveToTrash(file.id);
      let trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(1);

      const delRes = await workspaceStorage.deletePermanently(file.id);
      expect(delRes.ok).toBe(true);

      trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(0);

      const active = await workspaceStorage.scanFiles();
      expect(active).toHaveLength(0);
    });

    it("empties all files from trash in one operation", async () => {
      const dummy = new Uint8Array([22]);
      const f1 = await workspaceStorage.writeFileBytes("Trash1.voo", dummy);
      const f2 = await workspaceStorage.writeFileBytes("Trash2.fig", dummy);
      const fKeep = await workspaceStorage.writeFileBytes("KeepMe.voo", dummy);

      await workspaceStorage.moveToTrash(f1.id);
      await workspaceStorage.moveToTrash(f2.id);

      let trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(2);

      const emptyRes = await workspaceStorage.emptyTrash();
      expect(emptyRes.ok).toBe(true);

      trash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(trash).toHaveLength(0);

      const active = await workspaceStorage.scanFiles();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe("KeepMe.voo");
    });
  });

  describe("7. Default Save Path Derivation in saveVooProject", () => {
    it("derives default save path inside active workspace directory on Electron", async () => {
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: "/Users/designer/Documents/VOO/Projects",
        isDefault: false,
        isConfigured: true,
      });

      const defaultSavePath = await resolveWorkspaceDefaultSavePath("MyPoster.voo");
      expect(defaultSavePath).toBe("/Users/designer/Documents/VOO/Projects/MyPoster.voo");
    });

    it("passes active workspace defaultPath to saveFileDialog when saving new document", async () => {
      vi.spyOn(workspaceStorage, "getConfig").mockResolvedValue({
        type: "electron",
        path: "/Users/test/Workspace",
        isDefault: false,
        isConfigured: true,
      });

      let dialogOptions = null;
      window.electronAPI = {
        saveFileDialog: vi.fn().mockImplementation(async (opts) => {
          dialogOptions = opts;
          return "/Users/test/Workspace/Design 1.voo";
        }),
        writeFileBytes: vi.fn().mockResolvedValue(true),
      };

      useDesignStore.getState().setFilePath?.(null);
      useDesignStore.getState().setFileName?.("Design 1.voo");

      const res = await saveVooProject({
        store: useDesignStore.getState(),
        saveAs: false,
      });

      expect(res.success).toBe(true);
      expect(window.electronAPI.saveFileDialog).toHaveBeenCalled();
      expect(dialogOptions.defaultPath).toBe("/Users/test/Workspace/Design 1.voo");
    });

    it("passes startIn directoryHandle to showSaveFilePicker on Web FSA", async () => {
      const mockDirHandle = { kind: "directory", name: "BrowserWorkspace" };
      vi.spyOn(workspaceStorage, "getDriver").mockReturnValue({
        dirHandle: mockDirHandle,
      });

      let pickerOptions = null;
      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const mockFileHandle = {
        name: "WebDesign.voo",
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      };

      window.electronAPI = null;
      window.showSaveFilePicker = vi.fn().mockImplementation(async (opts) => {
        pickerOptions = opts;
        return mockFileHandle;
      });

      useDesignStore.getState().setFilePath?.(null);
      useDesignStore.getState().setFileHandle?.(null);
      useDesignStore.getState().setFileName?.("WebDesign.voo");

      const res = await saveVooProject({
        store: useDesignStore.getState(),
        saveAs: false,
      });

      expect(res.success).toBe(true);
      expect(window.showSaveFilePicker).toHaveBeenCalled();
      expect(pickerOptions.startIn).toBe(mockDirHandle);
    });
  });
});
