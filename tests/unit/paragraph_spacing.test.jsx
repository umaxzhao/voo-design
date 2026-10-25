// Paragraph spacing: hard breaks add a gap to layout offsets, bounds and paint.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import { getTextLayout, measureText } from "../../src/canvas/editor/text_metrics.js";
import TextSection from "../../src/canvas/components/editor_properties/text_section.jsx";

function mockCtx() {
  return {
    font: "",
    letterSpacing: "0px",
    save() {},
    restore() {},
    measureText(text) {
      return {
        width: String(text ?? "").length * 10,
        fontBoundingBoxAscent: 10,
        fontBoundingBoxDescent: 4,
      };
    },
  };
}

const node = (patch = {}) => ({
  id: "t1",
  kind: "text",
  text: "Line A\nLine B",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  fontSize: 20,
  lineHeight: 1.5,
  letterSpacing: 0,
  boxWidth: 0,
  ...patch,
});

describe("paragraph spacing", () => {
  it("adds the gap after a hard paragraph break", () => {
    const layout = getTextLayout(mockCtx(), node({ paragraphSpacing: 12 }));
    expect(layout.lines).toEqual(["Line A", "Line B"]);
    // 20 * 1.5 = 30 per line, plus 12 after the break.
    expect(layout.lineOffsets).toEqual([0, 42]);
    expect(measureText(mockCtx(), node({ paragraphSpacing: 12 })).height).toBe(72);
  });

  it("keeps the normal rhythm when unset", () => {
    expect(getTextLayout(mockCtx(), node()).lineOffsets).toEqual([0, 30]);
    expect(measureText(mockCtx(), node()).height).toBe(60);
  });

  it("shows the paragraph-spacing field for a text layer", () => {
    const object = node({ paragraphSpacing: 8, textCase: "original" });
    const html = renderToStaticMarkup(
      <TextSection
        object={object}
        selectedNodes={[object]}
        edit={() => {}}
        editAndCommit={() => {}}
        commitNow={() => {}}
      />,
    );
    expect(html).toContain("editor.props.paragraphSpacing");
  });
});
