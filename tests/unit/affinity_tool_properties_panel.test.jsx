// Polyfill window & Element for Node environment (must precede imports)
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock useI18n
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "zh",
    toggleLocale: () => {},
  }),
}));

import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("Affinity Parity: Dynamic Right Panel Tool Properties", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dedicated brush properties (Size, Presets, Pressure dynamics) when Brush tool is active", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.BRUSH}
        toolProps={{
          color: "#00ffcc",
          onColor: () => {},
          brushWidth: 24,
          onBrushWidth: () => {},
          brushHardness: 0.5,
          onBrushHardness: () => {},
          brushOpacity: 1,
          onBrushOpacity: () => {},
          brushFlow: 0.8,
          onBrushFlow: () => {},
          brushSmoothing: 0.2,
          onBrushSmoothing: () => {},
          brushMode: "normal",
          brushPreset: "medium_round",
          onBrushPreset: () => {},
          pressureSize: true,
          onPressureSize: () => {},
          pressureOpacity: false,
          onPressureOpacity: () => {},
        }}
      />
    );

    // Header badge
    // Options live in the right panel; no top option bar is rendered any more.
    expect(html).toContain("editor-properties-panel");
    expect(html).not.toContain("image-context-toolbar");
    expect(html).toContain("editor.tool.brush");

    // Quick size pills
    expect(html).toContain("16");
    expect(html).toContain("24");
    expect(html).toContain("48");
    expect(html).toContain("96");

    // Pressure dynamics switches
    expect(html).toContain("editor.pressureSize");
    expect(html).toContain("editor.pressureOpacity");

    // Brush presets
    expect(html).toContain("editor.brushes");
    expect(html).toContain("editor.brushPreset.soft_round");
    expect(html).toContain("editor.brushPreset.medium_round");
    expect(html).toContain("editor.brushPreset.hard_round");
    expect(html).toContain("+ .ABR");
  });

  it("renders dedicated typography properties (Font, Weight, Size pills, Alignment) when Text tool is active", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.TEXT}
        toolProps={{
          color: "#ffffff",
          onColor: () => {},
          fontFamily: "Inter",
          onFontFamily: () => {},
          fontWeight: 600,
          onFontWeight: () => {},
          fontSize: 32,
          onFontSize: () => {},
          align: "center",
          onAlign: () => {},
          lineHeight: 1.4,
          onLineHeight: () => {},
          letterSpacing: 0.05,
          onLetterSpacing: () => {},
        }}
      />
    );

    expect(html).toContain("editor.tool.text");
    expect(html).toContain("editor.props.textStyle");
    expect(html).toContain("editor.props.fontFamily");
    expect(html).toContain("editor.props.fontWeight");
    expect(html).toContain("editor.props.fontSize");
    expect(html).toContain("32");
    expect(html).toContain("48");
    expect(html).toContain("64");
  });

  it("renders shape geometry properties (Corner radius, Stroke pills) when Rect tool is active", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.RECT}
        toolProps={{
          color: "#ffffff",
          onColor: () => {},
          strokeWidth: 2,
          onStrokeWidth: () => {},
          cornerRadius: 12,
          onCornerRadius: () => {},
          cornerType: "round",
          onCornerType: () => {},
          strokeStyle: "solid",
          onStrokeStyle: () => {},
        }}
      />
    );

    expect(html).toContain("editor.shape.rect");
    expect(html).toContain("editor.strokeStyle.weight");
    expect(html).toContain("editor.props.cornerRadius");
    expect(html).toContain("editor.shape.cornerRound");
    expect(html).toContain("editor.shape.cornerStraight");
    expect(html).toContain("2px");
    expect(html).toContain("4px");
  });

  it("renders Star/Polygon geometry properties (Sides & Ratio) when Star tool is active", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.STAR}
        toolProps={{
          color: "#ffffff",
          onColor: () => {},
          strokeWidth: 1,
          onStrokeWidth: () => {},
          sides: 5,
          onSides: () => {},
          starRatio: 0.45,
          onStarRatio: () => {},
        }}
      />
    );

    expect(html).toContain("editor.shape.star");
    expect(html).toContain("editor.shape.points");
    expect(html).toContain("editor.shape.innerRadius");
  });

  it("renders Arrow tool properties (Arrowhead start, end, size) when Arrow tool is active", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.ARROW}
        toolProps={{
          color: "#ffffff",
          onColor: () => {},
          strokeWidth: 3,
          onStrokeWidth: () => {},
          arrowStart: false,
          onArrowStart: () => {},
          arrowEnd: true,
          onArrowEnd: () => {},
          arrowSize: 24,
          onArrowSize: () => {},
        }}
      />
    );

    expect(html).toContain("editor.tool.arrow");
    expect(html).toContain("editor.shape.arrowStart");
    expect(html).toContain("editor.shape.arrowEnd");
  });

  it("renders Gradient properties (Linear, Radial, Angular, Reverse) when Gradient tool is active", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.GRADIENT}
        toolProps={{
          color: "#ffffff",
          onColor: () => {},
          gradientType: "radial",
          onGradientType: () => {},
          onReverseGradient: () => {},
        }}
      />
    );

    expect(html).toContain("editor.tool.gradient");
    expect(html).toContain("editor.props.gradient.linear");
    expect(html).toContain("editor.props.gradient.radial");
    expect(html).toContain("editor.props.gradient.angular");
    expect(html).toContain("editor.gradient.reverse");
  });

  it("renders Selection tools (Marquee/Lasso/Wand) with modes and action shortcuts", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.MARQUEE}
        toolProps={{
          selectionMode: "replace",
          onSelectionMode: () => {},
          selectionFeather: 4,
          onFeatherSelection: () => {},
          hasSelection: true,
          onInvertSelection: () => {},
          onClearSelection: () => {},
          onSelectSubject: () => {},
        }}
      />
    );

    expect(html).toContain("editor.tool.selection");
    expect(html).toContain("editor.selection.modeNew");
    expect(html).toContain("editor.selection.invert");
    expect(html).toContain("editor.selection.deselect");
    // Quick feather pills
    expect(html).toContain("0px");
    expect(html).toContain("2px");
    expect(html).toContain("5px");
    expect(html).toContain("10px");
    expect(html).toContain("20px");
  });

  it("renders dedicated pen properties with quick stroke width pills", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.PEN}
        toolProps={{
          penMode: "shape",
          onPenMode: () => {},
          penStrokeWidth: 4,
          onPenStrokeWidth: () => {},
          penAnchorType: "smooth",
          onPenAnchorType: () => {},
        }}
      />
    );

    expect(html).toContain("editor.tool.pen");
    expect(html).toContain("editor.pen.mode");
    expect(html).toContain("editor.strokeStyle.weight");
    expect(html).toContain("1px");
    expect(html).toContain("2px");
    expect(html).toContain("4px");
    expect(html).toContain("8px");
    expect(html).toContain("16px");
  });

  it("prioritizes dedicated tool properties even when isBackground is true", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.BRUSH}
        isBackground={true}
        backgroundColor="#121212"
        toolProps={{
          brushWidth: 32,
          onBrushWidth: () => {},
          brushHardness: 0.8,
          onBrushHardness: () => {},
          brushOpacity: 1,
          onBrushOpacity: () => {},
          onPressureSize: () => {},
        }}
      />
    );

    // Shows brush tool properties, not background inspector
    expect(html).toContain("editor.tool.brush");
    expect(html).toContain("editor.pressureSize");
    expect(html).not.toContain("editor.layer.canvasBackground");
  });
});
