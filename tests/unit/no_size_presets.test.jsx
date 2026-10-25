if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "zh", toggleLocale: () => {} }),
}));

import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("brush size controls", () => {
  it("omits quick size buttons while keeping the width slider and numeric field", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.BRUSH}
        toolProps={{ brushWidth: 24, onBrushWidth: () => {} }}
      />
    );

    expect(html).not.toMatch(/<button[^>]*>\s*(?:4|8|16|24|48|96|160)\s*<\/button>/);
    expect(html).not.toContain("editor.props.size");
    expect(html).toContain('type="range"');
    expect(html).toContain('type="number"');
    expect(html).toContain("editor.brushWidth");
  });
});
