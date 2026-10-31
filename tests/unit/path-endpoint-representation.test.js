import { describe, expect, it } from "vitest";
import { isEndpointEditable } from "../../src/canvas/editor/shape_geometry.js";

const line = { kind: "path", line: true, x: 100, y: 180, width: 120, height: 80, points: [[0, 0], [120, 80]] };
describe("primitive endpoints versus editable Bezier anchors", () => {
  it("keeps primitive line endpoint grips available", () => {
    expect(isEndpointEditable(line)).toBe(true);
  });
  it.each(["line", "arrow"])("never routes a converted %s into array-only endpoint grips", flag => {
    const converted = { ...line, [flag]: true, pen: true, points: [{ x: 0, y: 0 }, { x: 120, y: 80, in: [100, 70] }] };
    expect(isEndpointEditable(converted)).toBe(false);
  });
  it("rejects legacy object-point data even if its pen flag is missing", () => {
    expect(isEndpointEditable({ ...line, points: [{ x: 0, y: 0 }, { x: 120, y: 80 }] })).toBe(false);
  });
});
