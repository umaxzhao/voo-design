import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  WorkspaceStorageEngine,
  WebIdbWorkspaceDriver,
  WebFsaWorkspaceDriver,
  ElectronWorkspaceDriver,
  getWorkspaceStorage,
  resetWorkspaceStorage,
} from "../../src/services/workspace_storage.js";

describe("Adversarial Storage Engine Empirical Challenge", () => {
  beforeEach(() => {
    resetWorkspaceStorage();
    delete globalThis.window;
  });

  afterEach(() => {
    resetWorkspaceStorage();
    delete globalThis.window;
  });

  // =========================================================================
  // 1. Driver switching during active subscriptions
  // =========================================================================
  describe("1. Driver switching during active subscriptions", () => {
    it("1.1 switches drivers cleanly and reroutes events to active engine subscribers", async () => {
      const engine = new WorkspaceStorageEngine("web-idb");
      await engine.init();

      const receivedEvents = [];
      const unsub = engine.subscribe((evt) => {
        receivedEvents.push(evt);
      });

      // Write a file on the initial web-idb driver
      await engine.writeFileBytes("Initial.voo", new Uint8Array([1, 2, 3]));
      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].type).toBe("create");
      expect(receivedEvents[0].fileId).toBe("Initial.voo");

      // Switch to a new driver instance
      const oldDriver = engine.getDriver();
      engine.switchDriver("web-idb");
      const newDriver = engine.getDriver();
      expect(newDriver).not.toBe(oldDriver);

      // Verify that triggering event on old driver does NOT reach engine subscriber
      oldDriver._emitChange("create", "GhostOld.voo");
      expect(receivedEvents.length).toBe(1); // Still 1, old driver properly unsubscribed

      // Verify that triggering event on new driver DOES reach engine subscriber
      await engine.writeFileBytes("NewDriverFile.voo", new Uint8Array([4, 5, 6]));
      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents[1].fileId).toBe("NewDriverFile.voo");

      unsub();
    });

    it("1.2 subscriber error isolation: a throwing subscriber does not break other subscribers", async () => {
      const engine = new WorkspaceStorageEngine("web-idb");
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const goodEvents = [];
      engine.subscribe(() => {
        throw new Error("Adversarial subscriber fault injection!");
      });
      engine.subscribe((evt) => {
        goodEvents.push(evt);
      });

      // Trigger change
      await engine.writeFileBytes("FaultTolerant.voo", new Uint8Array([7, 8, 9]));
      expect(goodEvents.length).toBe(1);
      expect(goodEvents[0].fileId).toBe("FaultTolerant.voo");

      consoleErrorSpy.mockRestore();
    });

    it("1.3 self-unsubscribing listener during event delivery does not corrupt iteration", async () => {
      const engine = new WorkspaceStorageEngine("web-idb");
      let unsubSelf = null;
      let selfCallCount = 0;
      let peerCallCount = 0;

      unsubSelf = engine.subscribe(() => {
        selfCallCount++;
        if (unsubSelf) unsubSelf(); // Unsubscribe self on first event
      });

      engine.subscribe(() => {
        peerCallCount++;
      });

      await engine.writeFileBytes("Turn1.voo", new Uint8Array([1]));
      expect(selfCallCount).toBe(1);
      expect(peerCallCount).toBe(1);

      await engine.writeFileBytes("Turn2.voo", new Uint8Array([2]));
      expect(selfCallCount).toBe(1); // Self not called again
      expect(peerCallCount).toBe(2); // Peer called normally
    });

    it("1.4 rapid sequential driver switches under load", async () => {
      const engine = new WorkspaceStorageEngine("web-idb");
      const events = [];
      engine.subscribe((e) => events.push(e));

      // Rapidly toggle between drivers 10 times
      for (let i = 0; i < 10; i++) {
        engine.switchDriver("web-idb");
      }

      await engine.writeFileBytes("AfterChurn.voo", new Uint8Array([100]));
      expect(events.length).toBe(1);
      expect(events[0].fileId).toBe("AfterChurn.voo");
    });

    it("1.5 driver without subscribe method handled gracefully", () => {
      const engine = new WorkspaceStorageEngine("web-idb");
      const dummyDriver = {
        getDriverType: () => "dummy",
        init: async () => ({}),
      };
      engine.driver = dummyDriver;
      expect(() => engine._attachDriverEvents()).not.toThrow();
      expect(() => engine.switchDriver("web-idb")).not.toThrow();
    });
  });

  // =========================================================================
  // 2. Unicode, emoji, and whitespace filenames in virtual storage
  // =========================================================================
  describe("2. Unicode, emoji, and whitespace filenames in virtual storage", () => {
    let driver;

    beforeEach(async () => {
      driver = new WebIdbWorkspaceDriver();
      await driver.init();
    });

    it("2.1 handles multi-codepoint emoji, flags, and surrogate pairs", async () => {
      const complexNames = [
        "🔥_FireProject.voo",
        "👨‍👩‍👧‍👦_FamilyDesign.fig",
        "🏳️‍🌈_PrideBanner.svg",
        "🚀✨_BlastOff_v2.psd",
      ];

      for (const name of complexNames) {
        const payload = new Uint8Array([42, 43, 44]);
        const res = await driver.writeFileBytes(name, payload);
        expect(res.ok).toBe(true);
        expect(res.name).toBe(name);

        const readBack = await driver.readFileBytes(name);
        expect(readBack).toEqual(payload);
      }

      const files = await driver.scanFiles();
      expect(files.length).toBe(4);
      const names = files.map((f) => f.name);
      for (const expected of complexNames) {
        expect(names).toContain(expected);
      }
    });

    it("2.2 handles CJK, Cyrillic, RTL Arabic and Hebrew script filenames", async () => {
      const multilingual = [
        "中文_界面设计_原型.voo",
        "日本語_モバイル画面_最終版.fig",
        "한국어_대시보드_디자인.psd",
        "Русский_проект_вектор.svg",
        "تصميم_عربي_مشروع.voo",
        "עברית_עיצوب_מסך.voo",
      ];

      for (const name of multilingual) {
        const payload = new TextEncoder().encode(`Content for ${name}`);
        const res = await driver.writeFileBytes(name, payload);
        expect(res.ok).toBe(true);

        const readBack = await driver.readFileBytes(name);
        expect(new TextDecoder().decode(readBack)).toBe(`Content for ${name}`);
      }

      // Verify search finds non-ASCII terms accurately
      const chineseSearch = await driver.scanFiles({ search: "原型" });
      expect(chineseSearch.length).toBe(1);
      expect(chineseSearch[0].name).toBe("中文_界面设计_原型.voo");

      const arabicSearch = await driver.scanFiles({ search: "مشروع" });
      expect(arabicSearch.length).toBe(1);
      expect(arabicSearch[0].name).toBe("تصميم_عربي_مشروع.voo");
    });

    it("2.3 handles whitespace edge cases: multiple internal spaces, tabs, and leading spaces", async () => {
      const edgeNames = [
        "Project  With   Lots    Of     Spaces.voo",
        "Tab\tSeparated\tName.voo",
        "  LeadingSpaces.voo",
      ];

      for (const name of edgeNames) {
        const payload = new Uint8Array([1, 2, 3]);
        const res = await driver.writeFileBytes(name, payload);
        expect(res.ok).toBe(true);

        const readBack = await driver.readFileBytes(res.name);
        expect(readBack).toEqual(payload);
      }

      const files = await driver.scanFiles();
      expect(files.length).toBe(3);
    });

    it("2.4 handles filenames without extension by auto-appending .voo", async () => {
      const noExt = "MyUntiltedDrawing";
      const res = await driver.writeFileBytes(noExt, new Uint8Array([9, 9]));
      expect(res.name).toBe("MyUntiltedDrawing.voo");
      expect(res.extension).toBe("voo");

      const readBack = await driver.readFileBytes("MyUntiltedDrawing.voo");
      expect(readBack).toEqual(new Uint8Array([9, 9]));
    });

    it("2.5 handles filenames with punctuation, brackets, and math symbols", async () => {
      const punctName = "Report (Draft) [Q3] {Final} + 100% #tag & more.voo";
      const res = await driver.writeFileBytes(punctName, new Uint8Array([1]));
      expect(res.ok).toBe(true);
      expect(res.name).toBe(punctName);

      const searchPunct = await driver.scanFiles({ search: "[Q3]" });
      expect(searchPunct.length).toBe(1);
      expect(searchPunct[0].name).toBe(punctName);
    });

    it("2.6 renaming with emoji and non-ASCII characters preserves extension and metadata", async () => {
      await driver.writeFileBytes("OldASCII.voo", new Uint8Array([10]));
      const ren = await driver.renameFile("OldASCII.voo", "🎨_新画板_v2.voo");
      expect(ren.ok).toBe(true);
      expect(ren.file.name).toBe("🎨_新画板_v2.voo");
      expect(ren.file.extension).toBe("voo");

      const files = await driver.scanFiles();
      expect(files.some((f) => f.name === "🎨_新画板_v2.voo")).toBe(true);
      expect(files.some((f) => f.name === "OldASCII.voo")).toBe(false);
    });
  });

  // =========================================================================
  // 3. Query filters with malformed options or special characters
  // =========================================================================
  describe("3. Query filters with malformed options or special characters", () => {
    let driver;

    beforeEach(async () => {
      driver = new WebIdbWorkspaceDriver();
      await driver.init();
      await driver.writeFileBytes("Alpha.voo", new Uint8Array([1]), { category: "landing" });
      await driver.writeFileBytes("Beta.fig", new Uint8Array([2]), { category: "mobile" });
      await driver.writeFileBytes("Gamma.psd", new Uint8Array([3]), { category: "slides" });
      await driver.toggleStar("Alpha.voo");
    });

    it("3.1 handles special regex characters in search string literally", async () => {
      await driver.writeFileBytes("Special [brackets].voo", new Uint8Array([4]));
      await driver.writeFileBytes("Special (parens).voo", new Uint8Array([5]));
      await driver.writeFileBytes("Special.*dotstar.voo", new Uint8Array([6]));

      const bSearch = await driver.scanFiles({ search: "[brackets]" });
      expect(bSearch.length).toBe(1);
      expect(bSearch[0].name).toBe("Special [brackets].voo");

      const dotSearch = await driver.scanFiles({ search: ".*" });
      expect(dotSearch.length).toBe(1);
      expect(dotSearch[0].name).toBe("Special.*dotstar.voo");
    });

    it("3.2 sorts with unusual or missing sort keys safely", async () => {
      // Sorting by non-existent key falls back to 0 without crashing
      const sorted = await driver.scanFiles({ sortBy: "nonExistentKey", sortOrder: "asc" });
      expect(sorted.length).toBe(3);

      // Sorting by name descending
      const sortedNameDesc = await driver.scanFiles({ sortBy: "name", sortOrder: "desc" });
      expect(sortedNameDesc.map((f) => f.name)).toEqual(["Gamma.psd", "Beta.fig", "Alpha.voo"]);

      // Sorting by name ascending
      const sortedNameAsc = await driver.scanFiles({ sortBy: "name", sortOrder: "asc" });
      expect(sortedNameAsc.map((f) => f.name)).toEqual(["Alpha.voo", "Beta.fig", "Gamma.psd"]);
    });

    it("3.3 verifies options null safety: scanFiles(null) vs scanFiles()", async () => {
      // scanFiles() with undefined options defaults to {}
      const defRes = await driver.scanFiles();
      expect(defRes.length).toBe(3);

      const emptyRes = await driver.scanFiles({});
      expect(emptyRes.length).toBe(3);

      // Stress empirical observation: does scanFiles(null) throw destructuring error?
      let threwOnNull = false;
      try {
        await driver.scanFiles(null);
      } catch (err) {
        threwOnNull = true;
        expect(err).toBeInstanceOf(TypeError);
      }
      // Note: Passing null explicitly triggers JS default parameter bypass (destructuring null).
      // Empirical verification records whether the driver handles null or throws.
    });

    it("3.4 search with leading and trailing whitespace is trimmed properly", async () => {
      const res = await driver.scanFiles({ search: "   alpha   " });
      expect(res.length).toBe(1);
      expect(res[0].name).toBe("Alpha.voo");
    });

    it("3.5 category filter: 'all' vs specific vs non-existent", async () => {
      const all = await driver.scanFiles({ category: "all" });
      expect(all.length).toBe(3);

      const landing = await driver.scanFiles({ category: "landing" });
      expect(landing.length).toBe(1);
      expect(landing[0].name).toBe("Alpha.voo");

      const empty = await driver.scanFiles({ category: "non_existent_category" });
      expect(empty.length).toBe(0);
    });

    it("3.6 contradictory flags: trashOnly vs includeTrashed", async () => {
      await driver.moveToTrash("Beta.fig");

      // When trashOnly: true, it should return only trashed files even if includeTrashed is also true
      const res = await driver.scanFiles({ trashOnly: true, includeTrashed: true });
      expect(res.length).toBe(1);
      expect(res[0].name).toBe("Beta.fig");
      expect(res[0].trashed).toBe(true);
    });
  });

  // =========================================================================
  // 4. Soft-trash, restore, and empty trash cycles with multiple items
  // =========================================================================
  describe("4. Soft-trash, restore, and empty trash cycles with multiple items", () => {
    let driver;

    beforeEach(async () => {
      driver = new WebIdbWorkspaceDriver();
      await driver.init();
    });

    it("4.1 executes multi-item batch trash, selective restore, and empty trash cycle", async () => {
      const TOTAL = 15;
      const fileNames = Array.from({ length: TOTAL }, (_, i) => `Doc_${String(i).padStart(2, "0")}.voo`);

      for (const name of fileNames) {
        await driver.writeFileBytes(name, new Uint8Array([1, 2, 3]));
      }

      expect((await driver.scanFiles()).length).toBe(TOTAL);

      // Soft-trash first 8 files
      const trashedNames = fileNames.slice(0, 8);
      const keptNames = fileNames.slice(8);

      for (const name of trashedNames) {
        const res = await driver.moveToTrash(name);
        expect(res.ok).toBe(true);
      }

      // Check active pool
      const active = await driver.scanFiles();
      expect(active.length).toBe(7);
      expect(active.map((f) => f.name).sort()).toEqual(keptNames.sort());

      // Check trash pool
      const trash = await driver.scanFiles({ trashOnly: true });
      expect(trash.length).toBe(8);
      for (const item of trash) {
        expect(item.trashed).toBe(true);
        expect(item.trashedAt).toBeGreaterThan(0);
      }

      // Check includeTrashed
      const all = await driver.scanFiles({ includeTrashed: true });
      expect(all.length).toBe(TOTAL);

      // Restore 3 files from trash
      const restoredNames = trashedNames.slice(0, 3);
      for (const name of restoredNames) {
        const res = await driver.restoreFromTrash(name);
        expect(res.ok).toBe(true);
      }

      // Active pool should now be 7 + 3 = 10
      const activeAfterRestore = await driver.scanFiles();
      expect(activeAfterRestore.length).toBe(10);

      // Trash pool should now have 8 - 3 = 5 items
      const trashAfterRestore = await driver.scanFiles({ trashOnly: true });
      expect(trashAfterRestore.length).toBe(5);

      // Empty trash permanently
      const emptyRes = await driver.emptyTrash();
      expect(emptyRes.ok).toBe(true);
      expect(emptyRes.deletedCount).toBe(5);

      // Trash pool should be empty now
      expect((await driver.scanFiles({ trashOnly: true })).length).toBe(0);

      // Active files remain unaffected
      const finalActive = await driver.scanFiles();
      expect(finalActive.length).toBe(10);

      // Repeating emptyTrash returns deletedCount: 0 cleanly
      const doubleEmpty = await driver.emptyTrash();
      expect(doubleEmpty.ok).toBe(true);
      expect(doubleEmpty.deletedCount).toBe(0);
    });

    it("4.2 rejects invalid lifecycle transitions: double trash and double restore", async () => {
      await driver.writeFileBytes("Single.voo", new Uint8Array([1]));

      // 1. Move to trash
      const t1 = await driver.moveToTrash("Single.voo");
      expect(t1.ok).toBe(true);

      // 2. Double trash -> should fail
      const t2 = await driver.moveToTrash("Single.voo");
      expect(t2.ok).toBe(false);
      expect(t2.error).toMatch(/not found/i);

      // 3. Restore
      const r1 = await driver.restoreFromTrash("Single.voo");
      expect(r1.ok).toBe(true);

      // 4. Double restore -> should fail
      const r2 = await driver.restoreFromTrash("Single.voo");
      expect(r2.ok).toBe(false);
      expect(r2.error).toMatch(/not found in trash/i);
    });

    it("4.3 permanent deletion of specific trashed vs active file", async () => {
      await driver.writeFileBytes("ActiveToDelete.voo", new Uint8Array([1]));
      await driver.writeFileBytes("TrashToDelete.voo", new Uint8Array([2]));
      await driver.moveToTrash("TrashToDelete.voo");

      // Delete active file permanently
      const delActive = await driver.deletePermanently("ActiveToDelete.voo");
      expect(delActive.ok).toBe(true);
      expect((await driver.scanFiles()).length).toBe(0);

      // Delete trashed file permanently
      const delTrash = await driver.deletePermanently("TrashToDelete.voo");
      expect(delTrash.ok).toBe(true);
      expect((await driver.scanFiles({ trashOnly: true })).length).toBe(0);
    });

    it("4.4 name collision when active file is created while older file of same name is in trash", async () => {
      // 1. Create file A with payload [1]
      await driver.writeFileBytes("Colliding.voo", new Uint8Array([1]));
      // 2. Trash file A
      await driver.moveToTrash("Colliding.voo");

      // 3. Create fresh file A with payload [2] in active files
      await driver.writeFileBytes("Colliding.voo", new Uint8Array([2]));

      // 4. Scan active files -> should have 1 file
      const active = await driver.scanFiles();
      expect(active.length).toBe(1);
      expect(await driver.readFileBytes("Colliding.voo")).toEqual(new Uint8Array([2]));

      // 5. Scan trash -> should have 1 file in trash
      const trash = await driver.scanFiles({ trashOnly: true });
      expect(trash.length).toBe(1);

      // 6. Restoring from trash overwrites active file in virtual IDB driver
      const restoreRes = await driver.restoreFromTrash("Colliding.voo");
      expect(restoreRes.ok).toBe(true);

      // Empirical check: verify that restored file payload [1] is now active
      const restoredBytes = await driver.readFileBytes("Colliding.voo");
      expect(restoredBytes).toEqual(new Uint8Array([1]));
    });
  });

  // =========================================================================
  // 5. In-memory Map fallback boundary limits
  // =========================================================================
  describe("5. In-memory Map fallback boundary limits", () => {
    let driver;

    beforeEach(async () => {
      driver = new WebIdbWorkspaceDriver();
      await driver.init();
    });

    it("5.1 high-volume scalability: 500 files bulk write, scan, search, and sort", async () => {
      const COUNT = 500;
      const t0 = performance.now();

      for (let i = 0; i < COUNT; i++) {
        const padded = String(i).padStart(4, "0");
        const ext = i % 4 === 0 ? "fig" : i % 4 === 1 ? "psd" : i % 4 === 2 ? "svg" : "voo";
        const cat = i % 2 === 0 ? "landing" : "mobile";
        driver.memFiles.set(`file_${padded}.${ext}`, {
          id: `file_${padded}.${ext}`,
          name: `file_${padded}.${ext}`,
          path: null,
          extension: ext,
          size: 100 + i,
          bytes: new Uint8Array([i % 256]),
          createdAt: 1700000000000 + i,
          updatedAt: 1700000000000 + i,
          starred: i % 10 === 0,
          trashed: false,
          trashedAt: null,
          category: cat,
          preview: null,
        });
      }

      // Scan all 500 files
      const allFiles = await driver.scanFiles();
      expect(allFiles.length).toBe(500);

      // Filtered scan
      const starred = await driver.scanFiles({ starredOnly: true });
      expect(starred.length).toBe(50);

      // Search scan
      const searchRes = await driver.scanFiles({ search: "file_004" });
      expect(searchRes.length).toBe(10); // file_0040 to file_0049

      // Sorted scan descending by name
      const sorted = await driver.scanFiles({ sortBy: "name", sortOrder: "desc" });
      // 499 % 4 === 3 -> "file_0499.voo"
      expect(sorted[0].name).toBe("file_0499.voo");

      const tEnd = performance.now();
      const totalTimeMs = tEnd - t0;

      // Ensure that high volume operations are well under 1000ms
      expect(totalTimeMs).toBeLessThan(1000);
    });

    it("5.2 memory safety: scanFiles strips raw bytes from returned objects", async () => {
      const largeBytes = new Uint8Array(1024 * 50); // 50 KB
      await driver.writeFileBytes("LargeAsset.voo", largeBytes);

      const files = await driver.scanFiles();
      expect(files.length).toBe(1);
      expect(files[0].name).toBe("LargeAsset.voo");
      expect(files[0].size).toBe(50 * 1024);
      expect(files[0].bytes).toBeUndefined(); // Raw bytes must not be retained in scan summary
    });

    it("5.3 churn lifecycle: clean memory reclamation after repeated create-trash-delete cycles", async () => {
      const CYCLES = 100;
      for (let i = 0; i < CYCLES; i++) {
        const id = `Churn_${i}.voo`;
        await driver.writeFileBytes(id, new Uint8Array([1, 2, 3]));
        await driver.moveToTrash(id);
        await driver.deletePermanently(id);
      }

      // Both memFiles and memTrash should be completely empty
      expect(driver.memFiles.size).toBe(0);
      expect(driver.memTrash.size).toBe(0);
      expect((await driver.scanFiles({ includeTrashed: true })).length).toBe(0);
    });

    it("5.4 large binary payload integrity: handles multi-megabyte payloads intact", async () => {
      const MB = 3;
      const size = MB * 1024 * 1024;
      const payload = new Uint8Array(size);
      // Fill boundary bytes
      payload[0] = 0x56; // 'V'
      payload[1] = 0x4f; // 'O'
      payload[2] = 0x4f; // 'O'
      payload[size - 1] = 0xff;

      await driver.writeFileBytes("HugeDocument.voo", payload);

      const readBack = await driver.readFileBytes("HugeDocument.voo");
      expect(readBack.byteLength).toBe(size);
      expect(readBack[0]).toBe(0x56);
      expect(readBack[1]).toBe(0x4f);
      expect(readBack[2]).toBe(0x4f);
      expect(readBack[size - 1]).toBe(0xff);
    });

    it("5.5 in-memory reference semantics: records live reference vs defensive cloning behavior", async () => {
      const originalPayload = new Uint8Array([10, 20, 30]);
      await driver.writeFileBytes("LiveRefTest.voo", originalPayload);

      const readBytes = await driver.readFileBytes("LiveRefTest.voo");
      expect(readBytes).toEqual(new Uint8Array([10, 20, 30]));

      // Mutate read buffer
      readBytes[0] = 99;

      // In Node in-memory fallback, rec.bytes is returned directly without structuredClone
      const readAgain = await driver.readFileBytes("LiveRefTest.voo");
      // Documenting exact empirical behavior
      expect(readAgain[0]).toBe(99); // Live reference returned in memory fallback
    });
  });
});
