import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { exportFormatForMenuAction } from "../../src/shared/editor_menu_actions.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

describe("native File > Export menu actions", () => {
  it("maps each menu entry to the existing export dialog format", () => {
    expect(exportFormatForMenuAction("export:png")).toBe("png");
    expect(exportFormatForMenuAction("export:svg")).toBe("svg");
    expect(exportFormatForMenuAction("export:psd")).toBe("psd");
    expect(exportFormatForMenuAction("file:save")).toBeNull();
    expect(exportFormatForMenuAction("export:unknown")).toBeNull();
  });

  it("routes the action into the editor export event instead of the empty default branch", () => {
    const app = read("../../src/App.jsx");
    expect(app).toContain("exportFormatForMenuAction");
    expect(app).toContain('new CustomEvent("voo:editor-export", { detail: { format } })');

    const hook = read("../../src/canvas/components/editor_hooks/use_editor_apply.js");
    expect(hook).toContain("event?.detail?.format");
    expect(hook).toContain("setExportFormat?.(format)");
    const editor = read("../../src/canvas/components/image_editor.jsx");
    expect(editor).toContain("setExportFormat,");
  });
});
