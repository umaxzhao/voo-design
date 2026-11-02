import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map();
vi.mock("../../src/shared/settings.js", () => ({
  getSetting: (key) => settings.get(key) ?? null,
  setSetting: async (key, value) => settings.set(key, value),
}));

const { DEFAULT_EDITOR_PANEL_LAYOUT, loadEditorPanelLayout, saveEditorPanelLayout } =
  await import("../../src/canvas/components/editor_panel_preferences.js");

describe("editor panel preferences", () => {
  beforeEach(() => settings.clear());

  it("restores a saved layout", async () => {
    await saveEditorPanelLayout({ swapped: true });
    expect(loadEditorPanelLayout()).toEqual({ swapped: true });
  });

  it("uses the default for an invalid stored value", () => {
    settings.set("voo.editor.panelLayout", { swapped: "left" });
    expect(loadEditorPanelLayout()).toEqual(DEFAULT_EDITOR_PANEL_LAYOUT);
  });

  it("uses the default when nothing has been saved", () => {
    expect(loadEditorPanelLayout()).toEqual(DEFAULT_EDITOR_PANEL_LAYOUT);
  });
});
