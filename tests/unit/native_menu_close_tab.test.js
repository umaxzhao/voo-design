import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const setupMenu = require("../../electron/native-menu.cjs");

function installMenu(platform) {
  const actions = [];
  let template = null;
  const menu = { platform };
  setupMenu({
    app: { name: "VOO Design", getLocale: () => "en" },
    Menu: {
      buildFromTemplate: (nextTemplate) => {
        template = nextTemplate;
        return menu;
      },
      setApplicationMenu: vi.fn(),
    },
    dispatchMenuAction: (action) => actions.push(action),
    platform,
  });
  const items = [];
  const walk = (entries) => {
    for (const entry of entries) {
      items.push(entry);
      if (Array.isArray(entry.submenu)) walk(entry.submenu);
    }
  };
  walk(template);
  return { actions, items };
}

describe("native menu tab-close binding", () => {
  it.each(["linux", "darwin"])("binds Ctrl/Cmd+W to closing the current tab on %s", (platform) => {
    const { actions, items } = installMenu(platform);
    expect(items.some((item) => item.role === "close")).toBe(false);
    const closeTab = items.filter((item) => item.accelerator === "CmdOrCtrl+W");
    expect(closeTab).toHaveLength(1);
    expect(closeTab[0].label).toBe("Close Tab");
    closeTab[0].click();
    expect(actions).toEqual(["file:closeTab"]);
  });

  it("keeps Quit on Linux and the macOS app menu while window controls stay usable", () => {
    const linux = installMenu("linux");
    expect(linux.items.some((item) => item.role === "quit")).toBe(true);
    const mac = installMenu("darwin");
    expect(mac.items.some((item) => item.role === "quit")).toBe(true);
    for (const platform of ["linux", "darwin"]) {
      const { items } = installMenu(platform);
      expect(items.some((item) => item.role === "minimize")).toBe(true);
      expect(items.some((item) => item.role === "zoom")).toBe(true);
    }
  });
});
