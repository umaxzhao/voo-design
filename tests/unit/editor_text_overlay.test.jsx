import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EditorTextOverlay from "../../src/canvas/components/editor_text_overlay.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (_key, { family }) => `Missing font: ${family}` }),
}));

const node = { id: "text", x: 80, y: 100, width: 320, height: 48,
  fontSize: 36, text: "NBA BUSINESS", fontFamily: "'Unavailable Test Face', sans-serif",
  figmaFont: { family: "Unavailable Test Face", style: "Bold" }, fontMissing: true };
const render = (overrides = {}) => renderToStaticMarkup(<EditorTextOverlay
  node={{ ...node, ...overrides }} viewport={{ zoom: 1, panX: 0, panY: 0 }} onCommit={() => {}} />);

describe("missing-font text editing", () => {
  it("shows the original unavailable family while retaining an editable textarea", () => {
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain("Missing font: Unavailable Test Face");
    expect(html).toContain("<textarea");
    expect(html).toContain("NBA BUSINESS");
  });
  it("does not confuse an unavailable family with a bundled substring", () => {
    expect(render({ fontFamily: "'Interstate', sans-serif" })).toContain("Missing font: Interstate");
  });
  it("clears the warning when switching to a system font", () => {
    expect(render({ fontFamily: "system-ui, sans-serif" })).not.toContain('role="status"');
  });
  it("clears the warning when the user chooses an available family despite import metadata", () => {
    expect(render({ fontFamily: "'Inter', sans-serif" })).not.toContain('role="status"');
  });
});
