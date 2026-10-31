import { describe, expect, it } from "vitest";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import { textCreationFill } from "../../src/canvas/editor/text-creation-fill.js";

const frame = fill => ({ id: "frame", kind: "group", isFrame: true, fill, x: 0, y: 0, width: 500, height: 400 });
describe("initial interactive text contrast", () => {
  it.each([["#ffffff", "#000000"], ["#fff", "#000000"], ["#171717", "#ffffff"], ["#525252", "#ffffff"]])(
    "selects legible ink on a solid %s Frame", (fill, expected) => {
      const host = frame(fill);
      expect(textCreationFill({ nodes: [host] }, host)).toBe(expected);
    });
  it("uses the parent surface when the inner Frame has a transparent fill", () => {
    const outer = frame("#ffffff"), inner = { ...frame("#00000000"), id: "inner", parentId: "frame" };
    expect(textCreationFill({ nodes: [outer, inner] }, inner)).toBe("#000000");
  });
  it("preserves explicit ink and non-interactive creation defaults", () => {
    let doc = { width: 600, height: 500, nodes: [frame("#fff")] };
    const api = createDrawingShapesApi({ getDoc: () => doc, setDoc: next => { doc = next; } });
    const point = { x: 30, y: 40 }, interactive = { intoFrame: true, useToolDefaults: true };
    expect(api.addTextAt(point, "Visible", interactive).fill).toBe("#000000");
    expect(api.addTextAt(point, "Explicit", { ...interactive, fill: "#ff0000" }).fill).toBe("#ff0000");
    expect(api.addTextAt(point, "Agent", { intoFrame: true }).fill).toBe("#ffffff");
  });
});
