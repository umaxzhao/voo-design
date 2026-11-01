import { describe, expect, it } from "vitest";
import { layoutTextLines, measureLineWidth } from "../../src/canvas/editor/text_metrics.js";

describe("native letter-spacing capability probe", () => {
  it("restores native state when the browser getter is empty and rejects empty assignments", () => {
    let spacing = 1;
    const stack = [];
    const context = {
      font: "24px Arial",
      get letterSpacing() { return ""; },
      set letterSpacing(value) { if (/^\d+px$/.test(value)) spacing = parseFloat(value); },
      save() { stack.push(spacing); },
      restore() { spacing = stack.pop(); },
      measureText(text) { return { width: text.length * (6 + spacing) }; },
    };
    const node = { text: "Canvas type", fontFamily: "Arial", fontSize: 24,
      letterSpacing: 1, boxWidth: 77 };
    expect(layoutTextLines(context, node)).toEqual(["Canvas type"]);
    expect(measureLineWidth(context, node.text, 1)).toBe(77);
    expect(spacing).toBe(1);
  });
});
