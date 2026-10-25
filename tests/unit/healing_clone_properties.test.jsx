import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BrushProperties from "../../src/canvas/components/editor_properties/brush_properties.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

function renderHealing(healingMode, props = {}) {
  return renderToStaticMarkup(
    <BrushProperties tool={TOOL.HEALING} healingMode={healingMode} {...props} />,
  );
}

describe("healing and clone properties", () => {
  it("keeps AI repair to its supported width control", () => {
    const html = renderHealing("aiRepair", {
      onBrushWidth: vi.fn(),
      onBrushHardness: vi.fn(),
      onBrushOpacity: vi.fn(),
      onBrushFlow: vi.fn(),
    });

    expect(html).toContain("editor.brushWidth");
    expect(html).not.toContain("editor.brushHardness");
    expect(html).not.toContain("editor.brushOpacity");
    expect(html).not.toContain("editor.brushFlow");
  });

  it("shows patch direction and diffusion controls", () => {
    const html = renderHealing("patch");

    expect(html).toContain("editor.patch.source");
    expect(html).toContain("editor.patch.destination");
    expect(html).toContain("editor.patch.diffusion");
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows clone flow, source status, and the aligned checked state", () => {
    const html = renderHealing("clone", {
      onBrushWidth: vi.fn(),
      onBrushHardness: vi.fn(),
      onBrushOpacity: vi.fn(),
      onBrushFlow: vi.fn(),
      onCloneAligned: vi.fn(),
      cloneAligned: true,
      cloneSource: { point: { x: 1, y: 2 } },
    });

    expect(html).toContain("editor.brushFlow");
    expect(html).toContain("editor.clone.sourceSet");
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
  });
});
