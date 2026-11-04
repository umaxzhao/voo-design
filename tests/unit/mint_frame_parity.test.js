import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const compact = (css) => css.replace(/\s+/g, " ");

/** The declarations of the first rule whose selector matches `selector`. */
function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = compact(css).match(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing CSS rule ${selector}`).not.toBeNull();
  return match[1].trim();
}

describe("mint frame parity with the hosted editor", () => {
  it("paints the window black so the shell border is the only mint edge", () => {
    const app = read("src/App.jsx");
    expect(app).toContain('style={{ background: "#000" }}');
    expect(app).not.toContain("linear-gradient(90deg, #b2ffd6 0 4px");
    expect(app).not.toContain("linear-gradient(90deg, #b2ffd6 0 6px");
  });

  it("keeps the hosted editor's title bar gradient in the component, not a second CSS copy", () => {
    expect(read("src/app_title_bar.jsx")).toContain(
      "linear-gradient(-90deg, rgb(0, 0, 0) 70.123%, rgb(178, 255, 214) 89.855%)",
    );
    expect(rule(read("src/index.css"), ".app-title-bar")).toBe("-webkit-app-region: drag;");
  });

  it("keeps one 2px mint border at the window edge, with mint behind the inner corners", () => {
    const css = read("src/index.css");
    const shell = rule(css, ".editor-shell");
    expect(shell).toContain("border: 2px solid #b2ffd6");
    expect(shell).toContain("border-radius: 16px");
    expect(shell).toContain("background: #b2ffd6");

    // The live editor drops the old 4px safe-area inset at desktop width; the
    // shell's border is flush with the window, so both sides are exactly 2px.
    expect(rule(css, ".app-root-frame:not([data-embed=\"true\"])")).toContain("padding: 0");

    // Only the top-left corner needs the title bar's mint behind the rounded
    // shell; every other window pixel stays black, not a second green rail.
    const workspace = rule(css, ".app-root-frame:not([data-embed=\"true\"]) > .relative.flex.min-h-0.flex-1");
    expect(workspace).toContain("radial-gradient(circle at 0 0, #b2ffd6 0 20px, transparent 20.5px) top left / 21px 21px no-repeat");
    expect(workspace).toContain("#000");
    expect(workspace).not.toContain("linear-gradient");
    expect(rule(css, ".app-root-frame[data-embed=\"true\"] > .relative.flex.min-h-0.flex-1")).toContain("background: #000");
  });

  it("does not add light-theme frame rules while light mode is out of scope", () => {
    const light = read("src/theme-light.css");
    expect(light).not.toContain(".app-root-frame");
    expect(light).not.toContain("radial-gradient");
  });

  it("leaves the narrow layout on the hosted editor's gradient instead of changing it", () => {
    const css = read("src/canvas/components/editor_mobile_layout.css");
    const narrow = rule(css.slice(css.indexOf("@media (max-width: 768px)")), ".app-root-frame");
    expect(narrow).toContain("linear-gradient( 90deg, #b2ffd6 0 6px");
    expect(narrow).not.toContain("background: #000 !important");
  });
});
