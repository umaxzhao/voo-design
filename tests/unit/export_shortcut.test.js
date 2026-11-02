import { describe, it, expect, vi } from "vitest";
import { handleExportShortcut } from "../../src/canvas/editor/export_shortcut.js";
describe("export shortcut", () => {
  it.each(["ctrlKey", "metaKey"])("exports once for %s+Shift+E", (modifier) => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("CustomEvent", class { constructor(type) { this.type = type; } });
    const event = { type: "keydown", code: "KeyE", [modifier]: true, shiftKey: true, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    expect(handleExportShortcut(event)).toBe(true);
    expect(handleExportShortcut({ ...event, type: "keyup" })).toBe(false);
    expect(handleExportShortcut({ ...event, repeat: true })).toBe(false);
    expect(handleExportShortcut({ ...event, [modifier]: false })).toBe(false);
    expect(handleExportShortcut({ ...event, [modifier]: false, shiftKey: false })).toBe(false);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
