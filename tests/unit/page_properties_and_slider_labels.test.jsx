import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import ToolSliderField from "../../src/canvas/components/editor_properties/tool_slider_field.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("page properties and shared slider labels", () => {
  it("shows page background and existing document dimensions with no selection", () => {
    const markup = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.SELECT}
        docSize={{ width: 1440, height: 900 }}
        backgroundColor="#123456"
      />,
    );

    expect(markup).toContain('data-testid="editor-properties-panel"');
    expect(markup).toContain("editor.props.bgColor");
    expect(markup).toContain("1440 × 900");
    expect(markup).toContain("#123456");
    expect(markup).not.toContain("editor.pages.deleteCanvas");
  });

  it("allows long slider labels to wrap instead of truncating", () => {
    const markup = renderToStaticMarkup(
      <ToolSliderField
        label="BRUSH HARDNESS"
        value={50}
        min={0}
        max={100}
        onValueChange={vi.fn()}
      />,
    );

    expect(markup).toContain("whitespace-normal");
    expect(markup).toContain("leading-[10px]");
    expect(markup).not.toContain("truncate");
  });
});
