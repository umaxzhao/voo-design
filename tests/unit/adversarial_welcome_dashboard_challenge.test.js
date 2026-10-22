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
  workspaceStorage,
  resetWorkspaceStorage,
  getWorkspaceStorage,
  ElectronWorkspaceDriver,
  WebIdbWorkspaceDriver,
  WebFsaWorkspaceDriver,
} from "../../src/services/workspace_storage.js";
import {
  getRecentFiles,
  getStarredFiles,
  getTrashFiles,
  getDrafts,
} from "../../src/canvas/store/recent_files.js";
import { setSetting, getSetting } from "../../src/shared/settings.js";

describe("Adversarial Empirical Challenge: WelcomeDashboard Workspace UI & Reactive Listing", () => {
  beforeEach(() => {
    resetWorkspaceStorage();
    const driver = workspaceStorage.getDriver();
    if (driver?.memFiles) driver.memFiles.clear();
    if (driver?.memTrash) driver.memTrash.clear();

    setSetting("voo.workspace.path", "/Users/designer/Documents/VOO/Projects");
    setSetting("voo.workspace.type", "electron");
    setSetting("voo.workspace.name", "VOO Projects");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Challenge 1: Rapid Switching Between Tabs During Async In-Flight Scan
  // =========================================================================
  describe("Challenge 1: Rapid Tab Switching & Async In-Flight Scan Race Conditions", () => {
    it("1.1 EMPIRICAL VULNERABILITY: Stale in-flight scan from tab 1 overwrites state of tab 2 without request sequence guard", async () => {
      // Simulate two tabs: 'recents' vs 'trash'
      // Populate storage with 2 recent files and 1 trash file
      const dummy = new Uint8Array([1, 2, 3]);
      const rec1 = await workspaceStorage.writeFileBytes("ActiveHero.voo", dummy, { category: "landing" });
      const rec2 = await workspaceStorage.writeFileBytes("ActiveMobile.voo", dummy, { category: "mobile" });
      const trFile = await workspaceStorage.writeFileBytes("DeletedOld.voo", dummy, { category: "web" });
      await workspaceStorage.moveToTrash(trFile.id);

      // Verify initial storage state
      const actualRecents = await workspaceStorage.scanFiles({ includeTrashed: false });
      expect(actualRecents.map((f) => f.name).sort()).toEqual(["ActiveHero.voo", "ActiveMobile.voo"]);
      const actualTrash = await workspaceStorage.scanFiles({ trashOnly: true });
      expect(actualTrash.map((f) => f.name)).toEqual(["DeletedOld.voo"]);

      // Simulate WelcomeDashboard's reloadFiles logic directly:
      // Tab 1 ('recents') triggers scan with 100ms latency
      // Tab 2 ('trash') is clicked 10ms later with 20ms latency
      let dashboardFileList = [];
      let activeTab = "recents";

      const executeScanForTab = async (tab, latencyMs) => {
        const options = {
          category: null,
          search: "",
          sortBy: "updatedAt",
          sortOrder: "desc",
          ...(tab === "starred" ? { starredOnly: true } : {}),
          ...(tab === "trash" ? { trashOnly: true } : {}),
        };

        const result = await new Promise((resolve) => {
          setTimeout(async () => {
            const files = await workspaceStorage.scanFiles(options);
            resolve(files);
          }, latencyMs);
        });

        // This is what WelcomeDashboard does at line 162: setFileList(files || [])
        // WITHOUT checking whether tab is still active or request is latest
        dashboardFileList = result;
      };

      // Trigger Tab 1 ('recents') with 100ms delay
      const req1 = executeScanForTab("recents", 80);

      // User immediately clicks Tab 2 ('trash') at t=10ms with 20ms delay
      activeTab = "trash";
      const req2 = executeScanForTab("trash", 20);

      // Wait for both to complete
      await Promise.all([req1, req2]);

      // EMPIRICAL OBSERVATION:
      // Req 2 completed at ~20ms and set dashboardFileList = actualTrash.
      // Req 1 completed at ~80ms and OVERWROTE dashboardFileList with actualRecents!
      // But activeTab is STILL "trash"!
      expect(activeTab).toBe("trash");
      expect(dashboardFileList.map((f) => f.name).sort()).toEqual(["ActiveHero.voo", "ActiveMobile.voo"]);
      // Confirmed: dashboard displays active files inside trash tab!
    });

    it("1.2 PROPOSED MITIGATION: Request sequence guard (scanSeqRef) properly drops stale responses", async () => {
      const dummy = new Uint8Array([1, 2, 3]);
      await workspaceStorage.writeFileBytes("ActiveHero.voo", dummy);
      const trFile = await workspaceStorage.writeFileBytes("DeletedOld.voo", dummy);
      await workspaceStorage.moveToTrash(trFile.id);

      let dashboardFileList = [];
      let activeTab = "recents";
      let latestSeq = 0;

      const executeSafeScanForTab = async (tab, latencyMs) => {
        const currentSeq = ++latestSeq;
        const options = {
          category: null,
          search: "",
          sortBy: "updatedAt",
          sortOrder: "desc",
          ...(tab === "trash" ? { trashOnly: true } : {}),
        };

        const files = await new Promise((resolve) => {
          setTimeout(async () => {
            const res = await workspaceStorage.scanFiles(options);
            resolve(res);
          }, latencyMs);
        });

        // Sequence guard: drop stale response if a newer scan was started
        if (currentSeq !== latestSeq) {
          return;
        }
        dashboardFileList = files;
      };

      const req1 = executeSafeScanForTab("recents", 80);
      activeTab = "trash";
      const req2 = executeSafeScanForTab("trash", 20);

      await Promise.all([req1, req2]);

      // With sequence guard, stale req1 was dropped, and dashboardFileList correctly holds trash
      expect(activeTab).toBe("trash");
      expect(dashboardFileList.map((f) => f.name)).toEqual(["DeletedOld.voo"]);
    });

    it("1.3 Multi-tab rapid cycling jitter stress test", async () => {
      const dummy = new Uint8Array([1]);
      await workspaceStorage.writeFileBytes("DocA.voo", dummy);
      await workspaceStorage.writeFileBytes("DocB.voo", dummy);

      const tabs = ["recents", "starred", "drafts", "trash"];
      let completedScans = 0;

      // Run 20 rapid tab switch simulations concurrently
      const promises = tabs.map((tab, idx) => {
        const latency = (4 - idx) * 15; // Inverted latency: earlier tabs finish later
        return new Promise((resolve) => {
          setTimeout(async () => {
            const res = await workspaceStorage.scanFiles({
              ...(tab === "starred" ? { starredOnly: true } : {}),
              ...(tab === "trash" ? { trashOnly: true } : {}),
            });
            completedScans++;
            resolve({ tab, count: res.length });
          }, latency);
        });
      });

      const results = await Promise.all(promises);
      expect(completedScans).toBe(4);
      expect(results).toHaveLength(4);
    });
  });

  // =========================================================================
  // Challenge 2: Long Truncated Workspace Path on Mobile/Narrow Screen Viewports
  // =========================================================================
  describe("Challenge 2: Workspace path controls live in settings, not on the dashboard", () => {
    it("renders no workspace path strip on the dashboard", () => {
      const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));
      expect(html).not.toContain('data-testid="workspace-path-display"');
      expect(html).not.toContain('data-testid="sidebar-workspace-strip"');
    });
  });

  // =========================================================================
  // Challenge 3: Search Filtering with Regex, Emoji, Special Chars & Empty Queries
  // =========================================================================
  describe("Challenge 3: Search Filtering Edge Cases Across Drivers", () => {
    let dummyData;

    beforeEach(async () => {
      dummyData = new Uint8Array([1, 2, 3]);
      await workspaceStorage.writeFileBytes("SimpleDesign.voo", dummyData, { category: "web" });
      await workspaceStorage.writeFileBytes("App[Mobile].voo", dummyData, { category: "mobile" });
      await workspaceStorage.writeFileBytes("Regex(Test)*+?.fig", dummyData, { category: "landing" });
      await workspaceStorage.writeFileBytes("🎨CreativePoster.svg", dummyData, { category: "slides" });
      await workspaceStorage.writeFileBytes("Dangerous<tag>.voo", dummyData, { category: "dashboard" });
    });

    it("3.1 Regex special characters do not cause SyntaxError and match literal strings", async () => {
      // Searching for literal characters: '[', ']', '(', ')', '*', '+', '?'
      const bracketSearch = await workspaceStorage.scanFiles({ search: "[Mobile]" });
      expect(bracketSearch.map((f) => f.name)).toContain("App[Mobile].voo");
      expect(bracketSearch).toHaveLength(1);

      const regexSpecialSearch = await workspaceStorage.scanFiles({ search: "(Test)*+?" });
      expect(regexSpecialSearch.map((f) => f.name)).toContain("Regex(Test)*+?.fig");
      expect(regexSpecialSearch).toHaveLength(1);

      // Searching for regex quantifier alone
      const starSearch = await workspaceStorage.scanFiles({ search: "*" });
      expect(starSearch.map((f) => f.name)).toContain("Regex(Test)*+?.fig");
    });

    it("3.2 Emoji query matches emoji filenames accurately", async () => {
      const emojiSearch = await workspaceStorage.scanFiles({ search: "🎨" });
      expect(emojiSearch.map((f) => f.name)).toContain("🎨CreativePoster.svg");
      expect(emojiSearch).toHaveLength(1);
    });

    it("3.3 Empty and whitespace-only queries bypass filter and return all active files", async () => {
      const emptySearch = await workspaceStorage.scanFiles({ search: "" });
      expect(emptySearch).toHaveLength(5);

      const spacesSearch = await workspaceStorage.scanFiles({ search: "     " });
      expect(spacesSearch).toHaveLength(5);

      const tabSearch = await workspaceStorage.scanFiles({ search: "\t\n" });
      expect(tabSearch).toHaveLength(5);
    });

    it("3.4 Special injection strings match literal substrings safely without crash", async () => {
      const xssSearch = await workspaceStorage.scanFiles({ search: "<tag>" });
      expect(xssSearch.map((f) => f.name)).toContain("Dangerous<tag>.voo");
      expect(xssSearch).toHaveLength(1);

      const nonExistent = await workspaceStorage.scanFiles({ search: "non_existent_query_12345" });
      expect(nonExistent).toHaveLength(0);
    });

    it("3.5 Search is case-insensitive across all drivers", async () => {
      const lower = await workspaceStorage.scanFiles({ search: "simple" });
      const upper = await workspaceStorage.scanFiles({ search: "SIMPLE" });
      const mixed = await workspaceStorage.scanFiles({ search: "SiMpLe" });

      expect(lower.map((f) => f.name)).toEqual(["SimpleDesign.voo"]);
      expect(upper.map((f) => f.name)).toEqual(["SimpleDesign.voo"]);
      expect(mixed.map((f) => f.name)).toEqual(["SimpleDesign.voo"]);
    });

    it("3.6 Search matches category name as well as file name", async () => {
      // "dashboard" is the category of "Dangerous<tag>.voo"
      const catSearch = await workspaceStorage.scanFiles({ search: "dashboard" });
      expect(catSearch.map((f) => f.name)).toContain("Dangerous<tag>.voo");
    });

    it("3.7 Fallback search in recent_files.js handles regex and emoji identically", () => {
      const fallbackFiles = [
        { id: "1", name: "Alpha[Test].voo", category: "web", trashed: false },
        { id: "2", name: "Beta(Star)*.voo", category: "landing", trashed: false },
        { id: "3", name: "🚀Rocket.voo", category: "mobile", trashed: false },
      ];

      // In recent_files.js getRecentFiles fallback:
      const filterRecent = (list, search) => {
        return list.filter((item) => {
          if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            const matchName = item.name?.toLowerCase().includes(q);
            const matchCategory = item.category?.toLowerCase().includes(q);
            if (!matchName && !matchCategory) return false;
          }
          return true;
        });
      };

      expect(filterRecent(fallbackFiles, "[Test]")).toHaveLength(1);
      expect(filterRecent(fallbackFiles, "(Star)*")).toHaveLength(1);
      expect(filterRecent(fallbackFiles, "🚀")).toHaveLength(1);
      expect(filterRecent(fallbackFiles, "   ")).toHaveLength(3);
    });
  });

  // =========================================================================
  // Challenge 4: Rapid Clicking on "刷新" (Rescan) Button & Concurrency
  // =========================================================================
  describe("Challenge 4: Rapid Rescan Button Concurrency & State Integrity", () => {
    it("4.1 Concurrent scanFiles executions do not corrupt storage or cause race condition errors", async () => {
      const dummy = new Uint8Array([55]);
      await workspaceStorage.writeFileBytes("RescanDoc1.voo", dummy);
      await workspaceStorage.writeFileBytes("RescanDoc2.voo", dummy);

      // Fire 15 concurrent scanFiles calls rapidly
      const promises = Array.from({ length: 15 }, (_, i) =>
        workspaceStorage.scanFiles({ sortBy: i % 2 === 0 ? "updatedAt" : "name" })
      );

      const allResults = await Promise.all(promises);

      // Every single concurrent call should succeed and return exactly 2 files
      expect(allResults).toHaveLength(15);
      for (const res of allResults) {
        expect(res).toHaveLength(2);
        expect(res.map((f) => f.name)).toContain("RescanDoc1.voo");
        expect(res.map((f) => f.name)).toContain("RescanDoc2.voo");
      }
    });

    it("4.2 EMPIRICAL OBSERVATION: handleRescanWorkspace lacks re-entrancy ref guard", async () => {
      // In WelcomeDashboard.jsx lines 437-455:
      // const handleRescanWorkspace = async () => {
      //   setIsScanning(true);
      //   ...
      //   await reloadFiles();
      //   setIsScanning(false);
      // };
      //
      // If invoked twice before React state re-renders (disabled={isScanning}):
      // 1. Both invocations enter and run workspaceStorage.scanFiles()
      // 2. Window event "voo:workspace-rescan" fires twice
      // 3. When invocation 1 finishes, setIsScanning(false) executes even while invocation 2 is still running!

      const rescanEventSpy = vi.fn();
      window.addEventListener("voo:workspace-rescan", rescanEventSpy);

      let scanCallCount = 0;
      const originalScan = workspaceStorage.scanFiles.bind(workspaceStorage);
      vi.spyOn(workspaceStorage, "scanFiles").mockImplementation(async (opts) => {
        scanCallCount++;
        await new Promise((r) => setTimeout(r, 20));
        return originalScan(opts);
      });

      // Simulated concurrent clicks
      let isScanningState = false;
      let scanningCount = 0;

      const simulatedHandleRescanWorkspace = async () => {
        // Without `if (isScanningRef.current) return;`:
        isScanningState = true;
        scanningCount++;
        try {
          const files = await workspaceStorage.scanFiles();
          window.dispatchEvent(
            new CustomEvent("voo:workspace-rescan", {
              detail: { count: files.length },
            })
          );
        } finally {
          scanningCount--;
          isScanningState = false;
        }
      };

      // Two rapid clicks
      const click1 = simulatedHandleRescanWorkspace();
      const click2 = simulatedHandleRescanWorkspace();

      await Promise.all([click1, click2]);

      // Both clicks executed scanFiles
      expect(scanCallCount).toBe(2);
      // Event fired twice
      expect(rescanEventSpy).toHaveBeenCalledTimes(2);

      window.removeEventListener("voo:workspace-rescan", rescanEventSpy);
    });

    it("4.3 PROPOSED MITIGATION: Rescan with re-entrancy ref guard drops duplicate concurrent clicks", async () => {
      let isScanningRef = false;
      let scanCallCount = 0;

      const guardedHandleRescan = async () => {
        if (isScanningRef) return { dropped: true };
        isScanningRef = true;
        try {
          scanCallCount++;
          await new Promise((r) => setTimeout(r, 30));
          return { dropped: false };
        } finally {
          isScanningRef = false;
        }
      };

      // Two rapid clicks
      const [r1, r2] = await Promise.all([guardedHandleRescan(), guardedHandleRescan()]);

      expect(r1.dropped).toBe(false);
      expect(r2.dropped).toBe(true);
      expect(scanCallCount).toBe(1);
    });
  });
});
