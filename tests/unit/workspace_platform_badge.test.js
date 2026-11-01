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
import {
  getWorkspacePlatformBadge,
  getPlatformBadge,
  WorkspaceSettingsSection,
} from "../../src/canvas/components/settings_general.jsx";
import {
  getDetectedPlatform,
  isMacPlatform,
  isWindowsPlatform,
  isLinuxPlatform,
} from "../../src/canvas/use_window_controls.js";
import { setSetting } from "../../src/shared/settings.js";
import { t, loadLocale, setLocale } from "../../src/shared/i18n.js";
import zhDictionary from "../../src/shared/i18n/zh.js";
import enDictionary from "../../src/shared/i18n/en.js";
import welcomeZhDictionary from "../../src/shared/i18n/welcome-zh.js";
import welcomeEnDictionary from "../../src/shared/i18n/welcome-en.js";

describe("Workspace Platform Badge Dynamic Resolution", () => {
  const originalVooDesktop = globalThis.vooDesktop;
  const originalElectronAPI = globalThis.electronAPI;

  beforeEach(() => {
    delete globalThis.vooDesktop;
    delete globalThis.electronAPI;
    setSetting("voo.workspace.path", "/home/user/projects/VooDesigns");
    setSetting("voo.workspace.type", "electron");
    setSetting("voo.workspace.name", "VooDesigns");
  });

  afterEach(async () => {
    delete globalThis.vooDesktop;
    delete globalThis.electronAPI;
    if (originalVooDesktop !== undefined) {
      globalThis.vooDesktop = originalVooDesktop;
    }
    if (originalElectronAPI !== undefined) {
      globalThis.electronAPI = originalElectronAPI;
    }
    await setLocale("zh");
    vi.restoreAllMocks();
  });

  describe("1. Platform Detection Helpers", () => {
    it("detects Linux via globalThis.vooDesktop.platform", () => {
      globalThis.vooDesktop = { platform: "linux" };
      expect(getDetectedPlatform()).toBe("linux");
      expect(isLinuxPlatform()).toBe(true);
      expect(isMacPlatform()).toBe(false);
      expect(isWindowsPlatform()).toBe(false);
    });

    it("detects Windows via globalThis.vooDesktop.platform", () => {
      globalThis.vooDesktop = { platform: "win32" };
      expect(getDetectedPlatform()).toBe("windows");
      expect(isWindowsPlatform()).toBe(true);
      expect(isLinuxPlatform()).toBe(false);
      expect(isMacPlatform()).toBe(false);
    });

    it("detects macOS via globalThis.vooDesktop.platform", () => {
      globalThis.vooDesktop = { platform: "darwin" };
      expect(getDetectedPlatform()).toBe("mac");
      expect(isMacPlatform()).toBe(true);
      expect(isLinuxPlatform()).toBe(false);
      expect(isWindowsPlatform()).toBe(false);
    });

    it("detects platform via globalThis.electronAPI.platform when vooDesktop is absent", () => {
      globalThis.electronAPI = { platform: "linux" };
      expect(getDetectedPlatform()).toBe("linux");
      expect(isLinuxPlatform()).toBe(true);

      globalThis.electronAPI = { platform: "win32" };
      expect(getDetectedPlatform()).toBe("windows");
      expect(isWindowsPlatform()).toBe(true);

      globalThis.electronAPI = { platform: "darwin" };
      expect(getDetectedPlatform()).toBe("mac");
      expect(isMacPlatform()).toBe(true);
    });

    it("detects platform via navigator when desktop bridges are absent", () => {
      const origNav = globalThis.navigator;

      vi.stubGlobal("navigator", {
        userAgentData: { platform: "Linux" },
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        platform: "Linux x86_64",
      });
      expect(getDetectedPlatform()).toBe("linux");
      expect(isLinuxPlatform()).toBe(true);

      vi.stubGlobal("navigator", {
        userAgentData: { platform: "Windows" },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        platform: "Win32",
      });
      expect(getDetectedPlatform()).toBe("windows");
      expect(isWindowsPlatform()).toBe(true);

      vi.stubGlobal("navigator", {
        userAgentData: { platform: "macOS" },
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
      });
      expect(getDetectedPlatform()).toBe("mac");
      expect(isMacPlatform()).toBe(true);

      vi.stubGlobal("navigator", origNav);
    });
  });

  describe("2. getWorkspacePlatformBadge Resolution", () => {
    it("returns Linux native badge on Linux platform", () => {
      globalThis.vooDesktop = { platform: "linux" };
      const zhBadge = getWorkspacePlatformBadge("electron", (key) => zhDictionary[key] ?? key);
      expect(zhBadge).toBe("[Linux 原生]");

      const enBadge = getWorkspacePlatformBadge("electron", (key) => enDictionary[key] ?? key);
      expect(enBadge).toBe("[Linux Native]");
    });

    it("returns Windows native badge on Windows platform", () => {
      globalThis.vooDesktop = { platform: "win32" };
      const zhBadge = getWorkspacePlatformBadge("electron", (key) => zhDictionary[key] ?? key);
      expect(zhBadge).toBe("[Windows 原生]");

      const enBadge = getWorkspacePlatformBadge("electron", (key) => enDictionary[key] ?? key);
      expect(enBadge).toBe("[Windows Native]");
    });

    it("returns macOS native badge on macOS platform", () => {
      globalThis.vooDesktop = { platform: "darwin" };
      const zhBadge = getWorkspacePlatformBadge("electron", (key) => zhDictionary[key] ?? key);
      expect(zhBadge).toBe("[macOS 原生]");

      const enBadge = getWorkspacePlatformBadge("electron", (key) => enDictionary[key] ?? key);
      expect(enBadge).toBe("[macOS Native]");
    });

    it("returns browser mount badge for web-fsa across platforms", () => {
      const zhBadge = getWorkspacePlatformBadge("web-fsa", (key) => zhDictionary[key] ?? key);
      expect(zhBadge).toBe("[浏览器挂载]");

      const enBadge = getWorkspacePlatformBadge("web-fsa", (key) => enDictionary[key] ?? key);
      expect(enBadge).toBe("[Browser Mount]");
    });

    it("returns virtual workspace badge for web-idb across platforms", () => {
      const zhBadge = getWorkspacePlatformBadge("web-idb", (key) => zhDictionary[key] ?? key);
      expect(zhBadge).toBe("[虚拟工作区]");

      const enBadge = getWorkspacePlatformBadge("web-idb", (key) => enDictionary[key] ?? key);
      expect(enBadge).toBe("[Virtual Workspace]");
    });

    it("falls back gracefully when translation keys are missing", () => {
      globalThis.vooDesktop = { platform: "linux" };
      const missingKeyTranslate = (key) => key;
      expect(getWorkspacePlatformBadge("electron", missingKeyTranslate)).toBe("[Linux 原生]");

      globalThis.vooDesktop = { platform: "win32" };
      expect(getWorkspacePlatformBadge("electron", missingKeyTranslate)).toBe("[Windows 原生]");

      globalThis.vooDesktop = { platform: "darwin" };
      expect(getWorkspacePlatformBadge("electron", missingKeyTranslate)).toBe("[macOS 原生]");
    });

    it("getPlatformBadge alias works identically to getWorkspacePlatformBadge", () => {
      globalThis.vooDesktop = { platform: "linux" };
      expect(getPlatformBadge("electron", (key) => zhDictionary[key] ?? key)).toBe("[Linux 原生]");
    });
  });

  describe("3. i18n Dictionary Integrity", () => {
    it("contains all workspace badge keys in zh and en dictionaries", () => {
      expect(zhDictionary["settings.workspace.badgeDesktopMac"]).toBe("[macOS 原生]");
      expect(zhDictionary["settings.workspace.badgeDesktopLinux"]).toBe("[Linux 原生]");
      expect(zhDictionary["settings.workspace.badgeDesktopWin"]).toBe("[Windows 原生]");
      expect(zhDictionary["settings.workspace.badgeDesktop"]).toBe("[macOS 原生]");

      expect(enDictionary["settings.workspace.badgeDesktopMac"]).toBe("[macOS Native]");
      expect(enDictionary["settings.workspace.badgeDesktopLinux"]).toBe("[Linux Native]");
      expect(enDictionary["settings.workspace.badgeDesktopWin"]).toBe("[Windows Native]");
      expect(enDictionary["settings.workspace.badgeDesktop"]).toBe("[macOS Native]");
    });

    it("contains all workspace badge keys in welcome-zh and welcome-en dictionaries", () => {
      expect(welcomeZhDictionary["welcome.workspace.badgeDesktopMac"]).toBe("[macOS 原生]");
      expect(welcomeZhDictionary["welcome.workspace.badgeDesktopLinux"]).toBe("[Linux 原生]");
      expect(welcomeZhDictionary["welcome.workspace.badgeDesktopWin"]).toBe("[Windows 原生]");
      expect(welcomeZhDictionary["welcome.workspace.badgeDesktop"]).toBe("[macOS 原生]");

      expect(welcomeEnDictionary["welcome.workspace.badgeDesktopMac"]).toBe("[macOS Native]");
      expect(welcomeEnDictionary["welcome.workspace.badgeDesktopLinux"]).toBe("[Linux Native]");
      expect(welcomeEnDictionary["welcome.workspace.badgeDesktopWin"]).toBe("[Windows Native]");
      expect(welcomeEnDictionary["welcome.workspace.badgeDesktop"]).toBe("[macOS Native]");
    });
  });

  describe("4. Component Rendering with WorkspaceSettingsSection", () => {
    it("renders Linux native badge on Linux host", () => {
      globalThis.vooDesktop = { platform: "linux" };
      const html = renderToStaticMarkup(React.createElement(WorkspaceSettingsSection));
      expect(html).toContain('data-testid="workspace-platform-badge"');
      expect(html).toContain("[Linux 原生]");
      expect(html).not.toContain("[macOS 原生]");
    });

    it("renders Windows native badge on Windows host", () => {
      globalThis.vooDesktop = { platform: "win32" };
      const html = renderToStaticMarkup(React.createElement(WorkspaceSettingsSection));
      expect(html).toContain('data-testid="workspace-platform-badge"');
      expect(html).toContain("[Windows 原生]");
      expect(html).not.toContain("[macOS 原生]");
    });

    it("renders macOS native badge on macOS host", () => {
      globalThis.vooDesktop = { platform: "darwin" };
      const html = renderToStaticMarkup(React.createElement(WorkspaceSettingsSection));
      expect(html).toContain('data-testid="workspace-platform-badge"');
      expect(html).toContain("[macOS 原生]");
    });

    it("renders English badges when locale is set to en", async () => {
      await loadLocale("en");
      await setLocale("en");

      globalThis.vooDesktop = { platform: "linux" };
      const htmlLinux = renderToStaticMarkup(React.createElement(WorkspaceSettingsSection));
      expect(htmlLinux).toContain("[Linux Native]");

      globalThis.vooDesktop = { platform: "win32" };
      const htmlWin = renderToStaticMarkup(React.createElement(WorkspaceSettingsSection));
      expect(htmlWin).toContain("[Windows Native]");

      globalThis.vooDesktop = { platform: "darwin" };
      const htmlMac = renderToStaticMarkup(React.createElement(WorkspaceSettingsSection));
      expect(htmlMac).toContain("[macOS Native]");
    });
  });
});
