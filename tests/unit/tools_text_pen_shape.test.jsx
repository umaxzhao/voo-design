import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

import TextToolProperties from "../../src/canvas/components/editor_properties/text_tool_properties.jsx";
import PenProperties from "../../src/canvas/components/editor_properties/pen_properties.jsx";
import ShapeProperties from "../../src/canvas/components/editor_properties/shape_properties.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("text, pen, and shape tool properties", () => {
  it("uses the canonical regular weight and the same labelled Lucide controls for text creation", () => {
    const html = renderToStaticMarkup(<TextToolProperties fontWeight={400} />);
    expect(html).toContain("editor.props.weight.normal");
    expect(html).toContain(">editor.props.fontSize</span>");
    expect(html).toContain(">editor.props.lineHeight</span>");
    expect(html).toContain(">editor.props.letterSpacing</span>");
    expect(html).toContain("lucide-a-large-small");
    expect(html).toContain("lucide-move-vertical");
    expect(html).toContain("lucide-move-horizontal");
    expect(html).not.toContain(">↕</span>");
    expect(html).not.toContain(">↔</span>");
  });

  it("renders one pen Weight control with anchor choices available when supplied", () => {
    const html = renderToStaticMarkup(
      <PenProperties onPenStrokeWidth={() => {}} onPenAnchorType={() => {}} />,
    );
    expect(html.match(/>editor\.strokeStyle\.weight</g)).toHaveLength(1);
    expect(html).toContain("editor.pen.anchorType");
  });

  it("keeps shape width on its slider and labels both stroke style controls", () => {
    const html = renderToStaticMarkup(
      <ShapeProperties tool={TOOL.RECT} onStrokeWidth={() => {}} onStrokeStyle={() => {}} />,
    );
    expect(html).toContain('aria-label="editor.strokeStyle.solid"');
    expect(html).toContain('aria-label="editor.strokeStyle.dashed"');
    expect(html).not.toContain("editor.props.stroke");
  });

  it("uses the shorter ratio label for a star inner radius", () => {
    const html = renderToStaticMarkup(
      <ShapeProperties tool={TOOL.STAR} onStarRatio={() => {}} />,
    );
    expect(html).toContain('aria-label="editor.shape.ratio"');
    expect(html).not.toContain('aria-label="editor.shape.innerRadius"');
  });
});
