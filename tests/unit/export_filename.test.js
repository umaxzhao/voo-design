import { describe, expect, it } from "vitest";
import { exportFilename, exportTargetName } from "../../src/canvas/editor/export_filename.js";

describe("export filenames", () => {
  it.each([
    ["Design", "png", 1, "Design.png"],
    ["Frame", "jpeg", 2, "Frame@2x.jpg"],
    ["Selection.svg", "pdf", 3, "Selection@3x.pdf"],
    ["你好 🎨", "svg", 1, "你好 🎨.svg"],
    ['a/b\\c:d*e?f"g<h>i|j\u0000', "png", 1, "a_b_c_d_e_f_g_h_i_j_.png"],
    ["  Design...  ", "png", 1, "Design.png"],
    ["... ", "png", 1, "Untitled.png"],
    [undefined, "png", 1, "Untitled.png"],
    ["", "png", 1, "Untitled.png"],
    ["CON", "png", 1, "_CON.png"],
    ["nul.txt", "png", 1, "_nul.txt.png"],
    ["Lpt9", "png", 1, "_Lpt9.png"],
    ["COM¹", "png", 1, "_COM¹.png"],
    ["CONsole", "png", 1, "CONsole.png"],
    ["Design", "png", NaN, "Design.png"],
  ])("sanitizes %s", (name, format, scale, expected) => {
    expect(exportFilename(name, format, scale)).toBe(expected);
  });
  it.each(["x", "界", "🎨"])("caps long %s names including suffix without splitting Unicode", (char) => {
    const filename = exportFilename(char.repeat(200), "png", 3);
    expect(new TextEncoder().encode(filename).length).toBeLessThanOrEqual(120);
    expect(filename).toMatch(/@3x\.png$/);
    expect(filename).not.toContain("�");
  });
  it("uses a selected frame name or a group selection fallback", () => {
    const nodes = [{ id: "f", name: "Hero" }, { id: "r", label: "Logo" }];
    expect(exportTargetName("Page", "frame", nodes, ["f"])).toBe("Page");
    expect(exportTargetName("Page", "selection", nodes, ["f"])).toBe("Hero");
    expect(exportTargetName("Page", "selection", nodes, ["r"])).toBe("Logo");
    expect(exportTargetName("Page", "selection", nodes, ["f", "r"])).toBe("Selection");
    expect(exportTargetName("Page", "selection", nodes, ["missing"])).toBe("Selection");
  });
});
