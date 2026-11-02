// The panel header names the active sub-mode, not just the tool family:
// "Smudge" rather than "Brush", "Clone" rather than "Healing", and so on.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import PropertiesPanelHeader from "../../src/canvas/components/editor_properties/properties_panel_header.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const render = (props) =>
  renderToStaticMarkup(
    <PropertiesPanelHeader
      isToolActive
      t={(key) => key}
      onToggleSide={() => {}}
      {...props}
    />,
  );

describe("tool panel header sub-mode", () => {
  it("names the brush sub-mode", () => {
    expect(render({ tool: TOOL.BRUSH, brushMode: "smudge" })).toContain(
      "editor.brushMode.smudge",
    );
    expect(render({ tool: TOOL.BRUSH, brushMode: "normal" })).toContain(
      "editor.tool.brush",
    );
  });

  it("names the healing mode", () => {
    expect(render({ tool: TOOL.HEALING, healingMode: "clone" })).toContain(
      "editor.tool.clone",
    );
    expect(render({ tool: TOOL.HEALING, healingMode: "spot" })).toContain(
      "editor.tool.spotHealing",
    );
    expect(render({ tool: TOOL.HEALING, healingMode: "aiRepair" })).toContain(
      "editor.tool.aiRepair",
    );
  });

  it("names the pen and shape sub-tools", () => {
    expect(render({ tool: TOOL.CURVATURE_PEN })).toContain(
      "editor.tool.curvaturePen",
    );
    expect(render({ tool: TOOL.FREE_PEN })).toContain("editor.tool.freePen");
    expect(render({ tool: TOOL.STAR })).toContain("editor.tool.star");
    expect(render({ tool: TOOL.ARROW })).toContain("editor.tool.arrow");
  });
});
