import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

describe("editor main window frame", () => {
  it("keeps the browser page flush and only fills the top-left notch", () => {
    expect(css).toContain('.app-root-frame:not([data-embed="true"]) {\n  padding: 0;\n}');
    const cornerRule = css.split(".app-root-frame:not([data-embed=\"true\"]) > .relative.flex.min-h-0.flex-1 {")[1] ?? "";
    expect(cornerRule).toContain("top left");
    expect(cornerRule).not.toContain("top right");
    expect(cornerRule).not.toContain("bottom right");
  });

  it("paints the frame stroke mint behind the inner sheet", () => {
    expect(css).toContain("background: #b2ffd6;");
    expect(css).toContain('.app-root-frame[data-embed="true"] .editor-shell');
  });

  it("gives the rounded desktop window a 4px inset but leaves the web page flush", () => {
    expect(css).toContain('.app-root-frame[data-desktop="true"]:not([data-embed="true"]) {\n  padding: 4px;\n}');
    expect(app).toContain('const isDesktopApp = typeof window !== "undefined" && Boolean(window.electronAPI);');
    expect(app).toContain('data-desktop={isDesktopApp ? "true" : undefined}');
  });
});
