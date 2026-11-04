import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const setupMenu = createRequire(import.meta.url)("../../electron/native-menu.cjs");

function install(platform = "linux") {
  const dispatchMenuAction = vi.fn();
  let template = null;
  const Menu = {
    buildFromTemplate: vi.fn((value) => {
      template = value;
      return { items: value };
    }),
    setApplicationMenu: vi.fn(),
  };
  setupMenu({
    app: { name: "VOO Design", getLocale: () => "en-US" },
    Menu,
    dispatchMenuAction,
    platform,
  });
  const find = (items, label) => {
    for (const item of items ?? []) {
      if (item.label === label) return item;
      const nested = find(item.submenu, label);
      if (nested) return nested;
    }
    return null;
  };
  const findSubmenu = (label) => template.find((item) => item.label === label)?.submenu ?? [];
  return { template, Menu, dispatchMenuAction, find, findSubmenu };
}

describe("Linux application menu while its bar is hidden", () => {
  it("still installs the application menu", () => {
    const { Menu, template } = install();
    expect(Menu.setApplicationMenu).toHaveBeenCalledOnce();
    expect(template.map((item) => item.label)).toEqual(["File", "Edit", "View", "Window", "Help"]);
  });

  it("keeps the menu accelerator bindings that shortcuts rely on", () => {
    const { findSubmenu } = install();
    const accelerators = {
      "New Document": "CmdOrCtrl+N",
      "Open...": "CmdOrCtrl+O",
      Save: "CmdOrCtrl+S",
      "Save As...": "CmdOrCtrl+Shift+S",
      "Export PNG...": "CmdOrCtrl+Shift+E",
      Undo: "CmdOrCtrl+Z",
      Redo: "CmdOrCtrl+Shift+Z",
      Duplicate: "CmdOrCtrl+D",
      Delete: "Backspace",
      "Select All": "CmdOrCtrl+A",
      "Fit to Screen": "CmdOrCtrl+0",
      "Actual Size (100%)": "CmdOrCtrl+1",
      "Zoom to Selection": "CmdOrCtrl+2",
      "Zoom In": "CmdOrCtrl+Plus",
      "Zoom Out": "CmdOrCtrl+-",
    };
    for (const [label, accelerator] of Object.entries(accelerators)) {
      const item = findSubmenu("File").concat(findSubmenu("Edit"), findSubmenu("View"))
        .find((entry) => entry.label === label);
      expect(item, `missing menu item ${label}`).toBeTruthy();
      expect(item.accelerator, `${label} accelerator`).toBe(accelerator);
    }
  });

  it("routes the New Document item to the same renderer action", () => {
    const { findSubmenu, dispatchMenuAction } = install();
    const item = findSubmenu("File").find((entry) => entry.label === "New Document");
    item.click();
    expect(dispatchMenuAction).toHaveBeenCalledWith("file:new");
  });

  it("keeps the macOS application menu shape unchanged", () => {
    const { template } = install("darwin");
    expect(template[0].label).toBe("VOO Design");
    expect(template.find((item) => item.label === "Window").submenu.map((item) => item.role)).toContain("front");
  });
});
