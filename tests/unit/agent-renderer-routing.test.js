import { describe, expect, it } from "vitest";
import { requiresWorkspaceCanvas2d } from "../../src/canvas/editor/workspace-artwork-routing.js";
import { elementFor } from "../../src/canvas/editor/skia_adapter_elements.js";

describe("agent-authored effects retain their visual rendering", () => {
  it.each([
    { effects: { shadow: { enabled: true, blur: 8 } } }, { layerBlur: 4 }, { backgroundBlur: 4 },
    { strokeDash: "dashed" }, { strokeDash: [4, 2] }, { strokeHidden: true },
  ])("routes unsupported GPU attributes to the authoritative compositor: %j", (patch) => {
    expect(requiresWorkspaceCanvas2d({ nodes: [{ id: "shape", kind: "rect", ...patch }] })).toBe(true);
  });
  it("keeps plain geometry and disabled effects on the fast path", () => {
    expect(requiresWorkspaceCanvas2d({ nodes: [{ id: "shape", kind: "rect", effects: { shadow: { enabled: false } }, strokeDash: "solid" }] })).toBe(false);
  });
  it("converts text line-height multipliers and preserves underline in CanvasKit input", () => {
    const element = elementFor({ id: "text", kind: "text", fontSize: 20, lineHeight: 1.5, underline: true }, 0, 0, 0, () => null);
    expect(element.lineHeight).toBe(30);
    expect(element.underline).toBe(true);
  });
});
