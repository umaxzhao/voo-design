import { describe, it, expect } from "vitest";
import {
  TOOL_FAMILIES,
  getFamilyByTool,
} from "../../src/canvas/editor/tool_families.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("TOOL_FAMILIES.lasso.matchTool", () => {
  const lasso = TOOL_FAMILIES.lasso;

  it("matches the freehand lasso tool without a mode argument", () => {
    expect(lasso.matchTool(TOOL.LASSO)).toBe(true);
  });

  it("matches marquee only for poly/magnetic modes (no ReferenceError)", () => {
    // Pre-fix, `marqueeMode` was referenced without being a parameter and
    // evaluating this branch threw a ReferenceError.
    expect(lasso.matchTool(TOOL.MARQUEE, "poly")).toBe(true);
    expect(lasso.matchTool(TOOL.MARQUEE, "magnetic")).toBe(true);
    expect(lasso.matchTool(TOOL.MARQUEE, "rect")).toBe(false);
    expect(lasso.matchTool(TOOL.MARQUEE)).toBe(false);
  });

  it("does not match unrelated tools", () => {
    expect(lasso.matchTool(TOOL.BRUSH)).toBe(false);
    expect(lasso.matchTool(TOOL.SELECT)).toBe(false);
  });
});

describe("getFamilyByTool", () => {
  it("resolves each tool to its family without throwing", () => {
    expect(getFamilyByTool(TOOL.LASSO)?.id).toBe("lasso");
    expect(getFamilyByTool(TOOL.MARQUEE)?.id).toBe("marquee");
    expect(getFamilyByTool(TOOL.BRUSH)?.id).toBe("brush");
    expect(getFamilyByTool(TOOL.HEALING)?.id).toBe("healing");
    expect(getFamilyByTool(TOOL.SELECT)?.id).toBe("select");
    expect(getFamilyByTool(TOOL.PEN)?.id).toBe("pen");
    expect(getFamilyByTool(TOOL.RECT)?.id).toBe("shapes");
    expect(getFamilyByTool(TOOL.FILL)?.id).toBe("fill");
    expect(getFamilyByTool("no-such-tool")).toBe(null);
  });
});
