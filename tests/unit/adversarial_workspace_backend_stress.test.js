import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("Adversarial Backend Stress & Empirical Edge Cases", () => {
  const sandboxDir = path.resolve("tests/unit/.tmp-adversarial-sandbox");
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
      showItemInFolder: vi.fn().mockImplementation((p) => fs.existsSync(p)),
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

  // ==========================================
  // Category 1: Path Traversal Attempts
  // ==========================================
  describe("Category 1: Path Traversal Security", () => {
    const traversalPayloads = [
      "../../secrets.voo",
      "..\\..\\config.voo",
      "../outside.voo",
      "..\\outside.voo",
      "folder/../../escape.voo",
      "folder\\..\\..\\escape.voo",
      "/etc/passwd",
      "\\windows\\system32\\cmd.exe",
      "C:\\boot.ini",
      "....//....//traversal.voo",
      "....\\\\....\\\\traversal.voo",
      "sub/nested.voo",
      "sub\\nested.voo",
    ];

    it.each(traversalPayloads)(
      "writeWorkspaceFileBytes blocks traversal attack: %s",
      async (payload) => {
        const dummyBytes = Buffer.from("adversarial_content");
        const res = await workspaceManager.writeWorkspaceFileBytes(
          defaultWorkspaceDir,
          payload,
          dummyBytes
        );

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/path_traversal_invalid_name|invalid_name/);

        // Verify no file was written outside the default workspace
        const outsideSecret = path.join(sandboxDir, "secrets.voo");
        const outsideConfig = path.join(sandboxDir, "config.voo");
        expect(fs.existsSync(outsideSecret)).toBe(false);
        expect(fs.existsSync(outsideConfig)).toBe(false);
      }
    );

    it.each(traversalPayloads)(
      "renameWorkspaceFile blocks traversal in newName: %s",
      async (payload) => {
        const initialFile = path.join(defaultWorkspaceDir, "Source.voo");
        fs.writeFileSync(initialFile, "legit content");

        const res = await workspaceManager.renameWorkspaceFile(initialFile, payload);
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/path_traversal_invalid_name|invalid_name/);
        expect(fs.existsSync(initialFile)).toBe(true);
      }
    );

    it("handles null bytes in filename without uncaught exceptions", async () => {
      const nullBytePayload = "evil\0file.voo";
      const res = await workspaceManager.writeWorkspaceFileBytes(
        defaultWorkspaceDir,
        nullBytePayload,
        Buffer.from("null_test")
      );
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("rejects path traversal in setWorkspaceRootDir", () => {
      // Trying to set non-existent traversal directory
      const res = workspaceManager.setWorkspaceRootDir(
        path.join(sandboxDir, "nonexistent", "..", "..", "nowhere")
      );
      expect(res.ok).toBe(false);
      expect(res.error).toBe("invalid_directory");
    });
  });

  // ==========================================
  // Category 2: Invalid Filename Characters and Symbols
  // ==========================================
  describe("Category 2: Invalid Filename Characters and Symbols", () => {
    it("rejects empty, whitespace, null, or non-string names", async () => {
      const invalidNames = ["", "   ", "\t\n", null, undefined, 12345, {}];
      for (const name of invalidNames) {
        const writeRes = await workspaceManager.writeWorkspaceFileBytes(
          defaultWorkspaceDir,
          name,
          Buffer.from("data")
        );
        expect(writeRes.ok).toBe(false);
        expect(writeRes.error).toBe("invalid_name");

        const renameRes = await workspaceManager.renameWorkspaceFile(
          path.join(defaultWorkspaceDir, "SomeFile.voo"),
          name
        );
        expect(renameRes.ok).toBe(false);
      }
    });

    it("sanitizes illegal OS characters (:*?\"<>|) gracefully during write", async () => {
      const dirtyName = 'chart:2026*sales?"<final>|v1.voo';
      const res = await workspaceManager.writeWorkspaceFileBytes(
        defaultWorkspaceDir,
        dirtyName,
        Buffer.from("chart data")
      );

      expect(res.ok).toBe(true);
      expect(res.file.name).toBe("chart_2026_sales___final__v1.voo");
      expect(fs.existsSync(res.file.path)).toBe(true);
    });

    it("sanitizes illegal OS characters during rename", async () => {
      const srcFile = path.join(defaultWorkspaceDir, "Original.voo");
      fs.writeFileSync(srcFile, "hello");

      const dirtyName = "report:summary*q3?.voo";
      const res = await workspaceManager.renameWorkspaceFile(srcFile, dirtyName);

      expect(res.ok).toBe(true);
      expect(res.newName).toBe("report_summary_q3_.voo");
      expect(fs.existsSync(res.newPath)).toBe(true);
      expect(fs.existsSync(srcFile)).toBe(false);
    });

    it("supports unicode, emojis, and international characters seamlessly", async () => {
      const unicodeNames = [
        "🎨 界面设计 2026.voo",
        "Проект_дизайна_русский.voo",
        "مخطط_تصميم_عربي.fig",
        "デザイン文書_日本語.svg",
        "Café_naïve_coöperation.psd",
      ];

      for (const name of unicodeNames) {
        const writeRes = await workspaceManager.writeWorkspaceFileBytes(
          defaultWorkspaceDir,
          name,
          Buffer.from(`content for ${name}`)
        );
        expect(writeRes.ok).toBe(true);
        expect(writeRes.file.name).toBe(name);
        expect(fs.existsSync(writeRes.file.path)).toBe(true);

        const renameTarget = `Renamed_${name}`;
        const renameRes = await workspaceManager.renameWorkspaceFile(
          writeRes.file.path,
          renameTarget
        );
        expect(renameRes.ok).toBe(true);
        expect(renameRes.newName).toBe(renameTarget);
        expect(fs.existsSync(renameRes.newPath)).toBe(true);
      }

      // Verify scanner reads all unicode design files
      const scan = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);
      expect(scan.ok).toBe(true);
      expect(scan.files.length).toBe(unicodeNames.length);
    });

    it("handles dot-only names without crashing or corrupting directories", async () => {
      const file = path.join(defaultWorkspaceDir, "TestDot.voo");
      fs.writeFileSync(file, "test");

      const res = await workspaceManager.renameWorkspaceFile(file, ".");
      // '.' refers to current directory, existing path check prevents overwriting directory
      expect(res.ok).toBe(false);
      expect(fs.existsSync(file)).toBe(true);
    });
  });

  // ==========================================
  // Category 3: Case-Only Renames (macOS APFS & NTFS)
  // ==========================================
  describe("Category 3: Case-Only Renames", () => {
    it("renames design.voo -> Design.voo via intermediate staging", async () => {
      const initialPath = path.join(defaultWorkspaceDir, "design.voo");
      fs.writeFileSync(initialPath, "canvas json payload");

      const res = await workspaceManager.renameWorkspaceFile(initialPath, "Design.voo");
      expect(res.ok).toBe(true);
      expect(res.newName).toBe("Design.voo");
      expect(res.newPath).toBe(path.join(defaultWorkspaceDir, "Design.voo"));

      // Verify file content intact
      const content = fs.readFileSync(res.newPath, "utf-8");
      expect(content).toBe("canvas json payload");

      // Verify readdir returns the exact updated case
      const entries = fs.readdirSync(defaultWorkspaceDir);
      expect(entries).toContain("Design.voo");
      expect(entries).not.toContain("design.voo");
    });

    it("renames DESIGN.VOO -> design.voo", async () => {
      const initialPath = path.join(defaultWorkspaceDir, "UPPER.VOO");
      fs.writeFileSync(initialPath, "upper content");

      const res = await workspaceManager.renameWorkspaceFile(initialPath, "upper.voo");
      expect(res.ok).toBe(true);
      expect(res.newName).toBe("upper.voo");

      const entries = fs.readdirSync(defaultWorkspaceDir);
      expect(entries).toContain("upper.voo");
      expect(entries).not.toContain("UPPER.VOO");
    });

    it("supports case-only rename without typing extension in newName", async () => {
      const initialPath = path.join(defaultWorkspaceDir, "artboard.voo");
      fs.writeFileSync(initialPath, "artboard");

      // User enters just 'ArtBoard' in rename input
      const res = await workspaceManager.renameWorkspaceFile(initialPath, "ArtBoard");
      expect(res.ok).toBe(true);
      expect(res.newName).toBe("ArtBoard.voo");

      const entries = fs.readdirSync(defaultWorkspaceDir);
      expect(entries).toContain("ArtBoard.voo");
      expect(entries).not.toContain("artboard.voo");
    });

    it("returns unchanged: true when renaming to identical name and case", async () => {
      const initialPath = path.join(defaultWorkspaceDir, "SameName.voo");
      fs.writeFileSync(initialPath, "same");

      const res = await workspaceManager.renameWorkspaceFile(initialPath, "SameName.voo");
      expect(res.ok).toBe(true);
      expect(res.unchanged).toBe(true);
      expect(res.newPath).toBe(initialPath);
    });

    it("handles collision resolution with -2, -3 suffix when resolveCollision is enabled", async () => {
      const fileA = path.join(defaultWorkspaceDir, "Card.voo");
      const fileB = path.join(defaultWorkspaceDir, "Card-2.voo");
      const fileC = path.join(defaultWorkspaceDir, "Existing.voo");
      fs.writeFileSync(fileA, "A");
      fs.writeFileSync(fileB, "B");
      fs.writeFileSync(fileC, "C");

      // Attempt rename Existing.voo -> Card.voo with collision resolution
      const res = await workspaceManager.renameWorkspaceFile(fileC, "Card.voo", {
        resolveCollision: true,
      });

      expect(res.ok).toBe(true);
      expect(res.collisionResolved).toBe(true);
      expect(res.newName).toBe("Card-3.voo");
      expect(fs.existsSync(res.newPath)).toBe(true);
      expect(fs.readFileSync(res.newPath, "utf-8")).toBe("C");
    });
  });

  // ==========================================
  // Category 4: Empty / Zero-byte Files & Non-existent Files
  // ==========================================
  describe("Category 4: Empty Files & Non-Existent File Operations", () => {
    it("writes, scans, and reads 0-byte design files cleanly", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const writeRes = await workspaceManager.writeWorkspaceFileBytes(
        defaultWorkspaceDir,
        "Zero.voo",
        emptyBuffer
      );

      expect(writeRes.ok).toBe(true);
      expect(writeRes.file.size).toBe(0);

      const scan = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);
      expect(scan.ok).toBe(true);
      const found = scan.files.find((f) => f.name === "Zero.voo");
      expect(found).toBeDefined();
      expect(found.size).toBe(0);

      const onDisk = fs.readFileSync(writeRes.file.path);
      expect(onDisk.length).toBe(0);
    });

    it("returns explicit file_not_found error for operations on non-existent files", async () => {
      const fakePath = path.join(defaultWorkspaceDir, "GhostFile.voo");

      const renameRes = await workspaceManager.renameWorkspaceFile(fakePath, "NewGhost.voo");
      expect(renameRes.ok).toBe(false);
      expect(renameRes.error).toBe("file_not_found");

      const trashRes = await workspaceManager.moveWorkspaceFileToTrash(fakePath);
      expect(trashRes.ok).toBe(false);
      expect(trashRes.error).toBe("file_not_found");

      const delRes = await workspaceManager.deleteWorkspaceFilePermanently(fakePath);
      expect(delRes.ok).toBe(false);
      expect(delRes.error).toBe("file_not_found");

      const restoreRes = await workspaceManager.restoreWorkspaceFileFromTrash(
        "GhostFile.voo",
        defaultWorkspaceDir
      );
      expect(restoreRes.ok).toBe(false);
      expect(restoreRes.error).toBe("file_not_found_in_trash");

      expect(workspaceManager.revealItemInFinder(fakePath)).toBe(false);
    });

    it("scans non-existent directory safely without throwing", () => {
      const res = workspaceManager.scanWorkspaceFiles(path.join(sandboxDir, "MissingDir"));
      expect(res.ok).toBe(false);
      expect(res.error).toBe("directory_not_found");
      expect(res.files).toEqual([]);
    });

    it("recovers gracefully when projects_config.json is corrupt or invalid JSON", () => {
      fs.writeFileSync(configFile, "{ invalid json corrupt content !!!", "utf-8");

      const cfg = workspaceManager.getWorkspaceConfig();
      expect(cfg.path).toBe(defaultWorkspaceDir);
      expect(cfg.isDefault).toBe(true);
      expect(cfg.isConfigured).toBe(false);
    });

    it("falls back to default if configured directory in projects_config.json was deleted", () => {
      const deletedFolder = path.join(sandboxDir, "DeletedWorkspace");
      fs.writeFileSync(
        configFile,
        JSON.stringify({ workspaceRoot: deletedFolder }),
        "utf-8"
      );

      const cfg = workspaceManager.getWorkspaceConfig();
      expect(cfg.path).toBe(defaultWorkspaceDir);
      expect(cfg.isDefault).toBe(true);
      expect(cfg.isConfigured).toBe(false);
    });

    it("emptyWorkspaceTrash handles non-existent or empty .trash directory safely", async () => {
      const emptyRes = await workspaceManager.emptyWorkspaceTrash(defaultWorkspaceDir);
      expect(emptyRes.ok).toBe(true);
      expect(emptyRes.deletedCount).toBe(0);

      // Now create trash directory with files
      const trashDir = path.join(defaultWorkspaceDir, ".trash");
      fs.mkdirSync(trashDir, { recursive: true });
      fs.writeFileSync(path.join(trashDir, "Trashed1.voo"), "t1");
      fs.writeFileSync(path.join(trashDir, "Trashed2.voo"), "t2");

      const cleanRes = await workspaceManager.emptyWorkspaceTrash(defaultWorkspaceDir);
      expect(cleanRes.ok).toBe(true);
      expect(cleanRes.deletedCount).toBe(2);
      expect(fs.readdirSync(trashDir).length).toBe(0);
    });
  });

  // ==========================================
  // Category 5: Concurrency and Race Conditions
  // ==========================================
  describe("Category 5: Concurrency and Stress Harness", () => {
    it("handles 20 rapid concurrent writes with overwrite: true without corruption", async () => {
      const filename = "ConcurrentHeavy.voo";
      const totalWrites = 20;

      const promises = Array.from({ length: totalWrites }, (_, i) => {
        const payload = Buffer.from(`write-version-${i}-${"x".repeat(1024)}`);
        return workspaceManager.writeWorkspaceFileBytes(
          defaultWorkspaceDir,
          filename,
          payload,
          { overwrite: true }
        );
      });

      const results = await Promise.all(promises);

      // All writes should resolve cleanly
      for (const res of results) {
        expect(res.ok).toBe(true);
        expect(res.file.name).toBe(filename);
      }

      // Check on disk: file must exist and contain valid data from one of the versions
      const finalContent = fs.readFileSync(path.join(defaultWorkspaceDir, filename), "utf-8");
      expect(finalContent).toMatch(/^write-version-\d+-x+$/);

      // Verify no temporary files remain in directory
      const leftoverTmp = fs
        .readdirSync(defaultWorkspaceDir)
        .filter((name) => name.startsWith(".") && name.includes(".tmp_"));
      expect(leftoverTmp).toHaveLength(0);
    });

    it("handles concurrent writes of distinct files and verifies scanner consistency", async () => {
      const count = 30;
      const writePromises = Array.from({ length: count }, (_, i) => {
        const ext = ["voo", "fig", "psd", "svg"][i % 4];
        return workspaceManager.writeWorkspaceFileBytes(
          defaultWorkspaceDir,
          `Batch_${i}.${ext}`,
          Buffer.from(`batch item ${i}`)
        );
      });

      const writeResults = await Promise.all(writePromises);
      for (const res of writeResults) {
        expect(res.ok).toBe(true);
      }

      const scanRes = await workspaceManager.scanWorkspaceFiles(defaultWorkspaceDir);
      expect(scanRes.ok).toBe(true);
      expect(scanRes.files.length).toBe(count);
    });

    it("handles concurrent rename collision without crashing", async () => {
      const targetA = path.join(defaultWorkspaceDir, "RacerA.voo");
      const targetB = path.join(defaultWorkspaceDir, "RacerB.voo");
      fs.writeFileSync(targetA, "data A");
      fs.writeFileSync(targetB, "data B");

      // Both try to rename to Trophy.voo at the same time without collision resolution
      const [resA, resB] = await Promise.all([
        workspaceManager.renameWorkspaceFile(targetA, "Trophy.voo"),
        workspaceManager.renameWorkspaceFile(targetB, "Trophy.voo"),
      ]);

      // Exactly one should succeed, or collision rejection occurs for the latter
      const successes = [resA, resB].filter((r) => r.ok);
      const failures = [resA, resB].filter((r) => !r.ok);

      expect(successes.length).toBeGreaterThanOrEqual(1);
      if (failures.length > 0) {
        expect(failures[0].error).toMatch(/already exists/i);
      }

      expect(fs.existsSync(path.join(defaultWorkspaceDir, "Trophy.voo"))).toBe(true);
    });

    it("watcher survives rapid creation of 50 files without leaking listeners or crashing", async () => {
      let changeNotifications = 0;
      workspaceManager.startWorkspaceWatcher(defaultWorkspaceDir, () => {
        changeNotifications++;
      });

      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(
          path.join(defaultWorkspaceDir, `RapidFire_${i}.voo`),
          `payload ${i}`
        );
      }

      // Wait for debounce timer (300ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(changeNotifications).toBeGreaterThanOrEqual(1);
      // Coalescing should prevent 50 separate invocations
      expect(changeNotifications).toBeLessThanOrEqual(5);

      workspaceManager.stopWorkspaceWatcher();
    });
  });

  // ==========================================
  // Category 6: IPC Channel Full Contract Execution
  // ==========================================
  describe("Category 6: IPC Handlers Verification", () => {
    it("exercises IPC handlers end-to-end including readFileBytes", async () => {
      const handlers = new Map();
      const mockIpcMain = {
        handle: (channel, fn) => handlers.set(channel, fn),
      };

      workspaceManager.registerWorkspaceIpc(mockIpcMain);

      // 1. write via IPC
      const writeHandler = handlers.get("workspace:writeFileBytes");
      expect(writeHandler).toBeDefined();
      const writeRes = await writeHandler(null, {
        name: "IpcTest.voo",
        bytes: Buffer.from("ipc test bytes"),
      });
      expect(writeRes.ok).toBe(true);

      // 2. read via IPC (readFileBytes)
      const readHandler = handlers.get("workspace:readFileBytes");
      expect(readHandler).toBeDefined();
      const readRes = await readHandler(null, writeRes.file.path);
      expect(readRes.ok).toBe(true);
      expect(readRes.bytes.toString("utf-8")).toBe("ipc test bytes");

      // 3. read non-existent file via IPC
      const readBadRes = await readHandler(null, path.join(defaultWorkspaceDir, "NonExistent.voo"));
      expect(readBadRes.ok).toBe(false);
      expect(readBadRes.error).toBe("file_not_found");

      // 4. rename via IPC
      const renameHandler = handlers.get("workspace:renameFile");
      expect(renameHandler).toBeDefined();
      const renameRes = await renameHandler(null, {
        filePath: writeRes.file.path,
        newName: "IpcRenamed.voo",
      });
      expect(renameRes.ok).toBe(true);
      expect(renameRes.newName).toBe("IpcRenamed.voo");

      // 5. move to trash via IPC
      const trashHandler = handlers.get("workspace:moveToTrash");
      expect(trashHandler).toBeDefined();
      const trashRes = await trashHandler(null, renameRes.newPath);
      expect(trashRes.ok).toBe(true);

      // 6. delete permanently via IPC
      const permFile = path.join(defaultWorkspaceDir, "PermIpc.voo");
      fs.writeFileSync(permFile, "perm");
      const delHandler = handlers.get("workspace:deletePermanently");
      expect(delHandler).toBeDefined();
      const delRes = await delHandler(null, permFile);
      expect(delRes.ok).toBe(true);
      expect(fs.existsSync(permFile)).toBe(false);
    });
  });
});
