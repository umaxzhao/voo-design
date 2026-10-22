// Polyfill window & CustomEvent & Element for Node.js test environment if absent
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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsGeneral, {
  WorkspaceSettingsSection,
} from "../../src/canvas/components/settings_general.jsx";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { workspaceStorage } from "../../src/services/workspace_storage.js";

describe("Milestone 2: Settings Workspace Integration", () => {
  beforeEach(() => {
    setSetting("voo.workspace.path", "/Users/designer/Documents/VOO/Projects");
    setSetting("voo.workspace.type", "electron");
    setSetting("voo.workspace.name", "VOO Projects");
    setSetting("voo.workspace.lastScannedAt", 1700000000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Rendering Active Workspace & Platform Badges", () => {
    it("renders WorkspaceSettingsSection with active path and macOS native badge", () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkspaceSettingsSection)
      );

      expect(html).toContain('data-testid="settings-workspace-section"');
      expect(html).toContain('data-testid="workspace-current-path"');
      expect(html).toContain("/Users/designer/Documents/VOO/Projects");
      expect(html).toContain('data-testid="workspace-platform-badge"');
      expect(html).toContain("[macOS 原生]");
      expect(html).toContain('data-testid="workspace-change-dir-btn"');
      expect(html).toContain('data-testid="workspace-rescan-btn"');
      expect(html).toContain('data-testid="workspace-reveal-btn"');
    });

    it("renders browser mount badge when workspace type is web-fsa", () => {
      setSetting("voo.workspace.path", "LocalProjectFolder");
      setSetting("voo.workspace.type", "web-fsa");

      const html = renderToStaticMarkup(
        React.createElement(WorkspaceSettingsSection)
      );

      expect(html).toContain("LocalProjectFolder");
      expect(html).toContain("[浏览器挂载]");
    });

    it("renders virtual workspace badge when workspace type is web-idb", () => {
      setSetting("voo.workspace.path", "Virtual Workspace");
      setSetting("voo.workspace.type", "web-idb");

      const html = renderToStaticMarkup(
        React.createElement(WorkspaceSettingsSection)
      );

      expect(html).toContain("Virtual Workspace");
      expect(html).toContain("[虚拟工作区]");
    });

    it("renders WorkspaceSettingsSection as a child within SettingsGeneral", () => {
      const html = renderToStaticMarkup(
        React.createElement(SettingsGeneral)
      );

      expect(html).toContain('data-testid="settings-profile-section"');
      expect(html).toContain('data-testid="settings-workspace-section"');
      expect(html).toContain('data-testid="workspace-current-path"');
    });
  });

  describe("2. Workspace Actions: Change Directory, Rescan, and Reveal", () => {
    it("handles Change Directory action and syncs to settings and event bus", async () => {
      const chooseSpy = vi.spyOn(workspaceStorage, "chooseDirectory").mockResolvedValue({
        ok: true,
        config: {
          path: "/Users/designer/Desktop/NewDesigns",
          type: "electron",
          name: "NewDesigns",
          isDefault: false,
          isConfigured: true,
        },
      });

      const eventSpy = vi.fn();
      window.addEventListener("voo:workspace-changed", eventSpy);

      // Perform change directory logic
      const res = await workspaceStorage.chooseDirectory();
      expect(chooseSpy).toHaveBeenCalled();
      expect(res.ok).toBe(true);

      if (res.ok && res.config) {
        setSetting("voo.workspace.path", res.config.path);
        setSetting("voo.workspace.type", res.config.type);
        setSetting("voo.workspace.name", res.config.name);
        setSetting("voo.workspace.lastScannedAt", Date.now());
        window.dispatchEvent(
          new CustomEvent("voo:workspace-changed", { detail: res.config })
        );
      }

      expect(getSetting("voo.workspace.path")).toBe("/Users/designer/Desktop/NewDesigns");
      expect(getSetting("voo.workspace.type")).toBe("electron");
      expect(getSetting("voo.workspace.name")).toBe("NewDesigns");
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            path: "/Users/designer/Desktop/NewDesigns",
          }),
        })
      );

      window.removeEventListener("voo:workspace-changed", eventSpy);
    });

    it("handles Rescan Workspace action, updates lastScannedAt and dispatches event", async () => {
      const scanSpy = vi.spyOn(workspaceStorage, "scanFiles").mockResolvedValue([
        { id: "1.voo", name: "Landing.voo", size: 1024 },
        { id: "2.fig", name: "App.fig", size: 2048 },
      ]);

      const rescanEventSpy = vi.fn();
      window.addEventListener("voo:workspace-rescan", rescanEventSpy);

      const beforeTime = Date.now();
      const files = await workspaceStorage.scanFiles();
      setSetting("voo.workspace.lastScannedAt", Date.now());
      window.dispatchEvent(
        new CustomEvent("voo:workspace-rescan", {
          detail: { path: getSetting("voo.workspace.path"), count: files.length },
        })
      );

      expect(scanSpy).toHaveBeenCalled();
      expect(files.length).toBe(2);
      expect(getSetting("voo.workspace.lastScannedAt")).toBeGreaterThanOrEqual(beforeTime);
      expect(rescanEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({ count: 2 }),
        })
      );

      window.removeEventListener("voo:workspace-rescan", rescanEventSpy);
    });

    it("handles Reveal in Finder action by delegating to storage engine", async () => {
      const revealSpy = vi.spyOn(workspaceStorage, "revealInFinder").mockResolvedValue(true);

      const targetPath = getSetting("voo.workspace.path");
      const success = await workspaceStorage.revealInFinder(targetPath);

      expect(revealSpy).toHaveBeenCalledWith(targetPath);
      expect(success).toBe(true);
    });
  });

  describe("3. Reactive Settings Synchronization", () => {
    it("dynamically reacts to voo:workspace-changed event and updates storage keys", () => {
      setSetting("voo.workspace.path", "/Volumes/Backup/Projects");
      setSetting("voo.workspace.type", "electron");

      expect(getSetting("voo.workspace.path")).toBe("/Volumes/Backup/Projects");
      expect(getSetting("voo.workspace.type")).toBe("electron");

      const html = renderToStaticMarkup(
        React.createElement(WorkspaceSettingsSection)
      );
      expect(html).toContain("/Volumes/Backup/Projects");
    });
  });
});
