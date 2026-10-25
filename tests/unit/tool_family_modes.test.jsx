import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ToolFamilyModes from "../../src/canvas/components/editor_properties/tool_family_modes.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

describe("ToolFamilyModes", () => {
  it.each([
    ["brush", { tool: "brush", brushMode: "smudge" }, "normal,smudge,blur,sharpen,dodge,burn,sponge"],
    ["marquee", { tool: "marquee", marqueeMode: "ellipse" }, "rect,ellipse"],
    ["healing", { tool: "healing", healingMode: "patch" }, "aiRepair,spot,patch,clone"],
  ])("shows %s choices in the properties control", (_name, props, expected) => {
    const markup = renderToStaticMarkup(
      <ToolFamilyModes {...props} onTool={vi.fn()} />,
    );
    for (const mode of expected.split(",")) {
      expect(markup).toContain(`data-testid="tool-family-mode-${mode}"`);
    }
  });
});
