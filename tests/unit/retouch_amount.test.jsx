// Dodge/Burn scale their exposure by Flow, Sponge scales by Opacity, and the
// other modes keep drawing from their own independent field.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import { retouchModeAmount } from "../../src/canvas/editor/editor_paint_retouch.js";
import BrushProperties from "../../src/canvas/components/editor_properties/brush_properties.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const paint = (mode, patch) => ({ mode, strength: 0.5, exposure: 0.4, flow: 1, opacity: 1, ...patch });

describe("retouch force", () => {
  it("scales dodge and burn exposure by flow", () => {
    expect(retouchModeAmount(paint("dodge", { flow: 1 }))).toBeCloseTo(0.4);
    expect(retouchModeAmount(paint("dodge", { flow: 0.5 }))).toBeCloseTo(0.2);
    expect(retouchModeAmount(paint("burn", { flow: 0.25 }))).toBeCloseTo(0.1);
  });

  it("scales sponge flow by opacity", () => {
    expect(retouchModeAmount(paint("sponge", { flow: 0.8, opacity: 1 }))).toBeCloseTo(0.8);
    expect(retouchModeAmount(paint("sponge", { flow: 0.8, opacity: 0.5 }))).toBeCloseTo(0.4);
  });

  it("leaves strength-based modes independent of flow and opacity", () => {
    expect(retouchModeAmount(paint("smudge", { flow: 0.2, opacity: 0.2 }))).toBeCloseTo(0.5);
    expect(retouchModeAmount(paint("blur", { flow: 0.2, opacity: 0.2 }))).toBeCloseTo(0.5);
  });
});

describe("brush panel exposure", () => {
  const render = (props) =>
    renderToStaticMarkup(
      <BrushProperties
        tool={TOOL.BRUSH}
        brushMode="dodge"
        onBrushWidth={() => {}}
        onBrushHardness={() => {}}
        onBrushOpacity={() => {}}
        onBrushFlow={() => {}}
        onBrushExposure={() => {}}
        onBrushSmoothing={() => {}}
        {...props}
      />,
    );

  it("shows Flow for dodge and burn", () => {
    expect(render({ brushMode: "dodge" })).toContain("editor.brushFlow");
    expect(render({ brushMode: "burn" })).toContain("editor.brushFlow");
  });

  it("shows Flow and Opacity for sponge", () => {
    const html = render({
      tool: TOOL.SPONGE,
      brushMode: "normal",
      onBrushOpacity: () => {},
    });
    expect(html).toContain("editor.brushFlow");
    expect(html).toContain("editor.brushOpacity");
  });
});
