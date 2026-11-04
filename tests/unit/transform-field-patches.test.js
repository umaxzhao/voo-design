import { describe, expect, it } from "vitest";
import { anchorDocPoint } from "../../src/canvas/editor/scene_geometry.js";
import { dimensionFieldPatch, positionFieldPatch, positionFieldPatchInFrame, positionPointInFrame } from "../../src/canvas/components/editor_properties/transform-field-patches.js";
const box = {
  kind: "rect",
  x: 100,
  y: 80,
  width: 120,
  height: 60
};
describe("inspector geometry field boundaries", () => {
  it("positions the chosen anchor without including unrelated fields", () => {
    expect(positionFieldPatch(box, "x", 300, "center")).toEqual({
      x: 240
    });
    expect(positionFieldPatch(box, "y", 200, "center")).toEqual({
      y: 170
    });
  });
  it("resizes one unlocked dimension and keeps the center anchor fixed", () => {
    const patch = dimensionFieldPatch(box, "width", 240, {
      anchor: "center",
      lockRatio: false
    });
    expect(patch).not.toHaveProperty("height");
    const resized = {
      ...box,
      ...patch
    };
    expect(resized.height).toBe(60);
    expect(resized.width).toBe(240);
    expect(anchorDocPoint(resized, "center")).toEqual(anchorDocPoint(box, "center"));
  });
  it("uses the latest ratio for sequential changes and pins a rotated anchor", () => {
    const original = {
      ...box,
      rotation: 30
    };
    const first = {
      ...original,
      ...dimensionFieldPatch(original, "width", 240, {
        anchor: "se",
        lockRatio: true
      })
    };
    const second = {
      ...first,
      ...dimensionFieldPatch(first, "height", 180, {
        anchor: "se",
        lockRatio: true
      })
    };
    expect([second.width, second.height]).toEqual([360, 180]);
    const expected = anchorDocPoint(original, "se"),
      actual = anchorDocPoint(second, "se");
    expect(actual.x).toBeCloseTo(expected.x);
    expect(actual.y).toBeCloseTo(expected.y);
  });
  it("changes a fixed text box width without forcing its measured height", () => {
    const text = {
      ...box,
      kind: "text",
      boxWidth: 120,
      fontSize: 20
    };
    expect(dimensionFieldPatch(text, "width", 240, {
      anchor: "nw",
      lockRatio: false
    })).toEqual({
      x: 100,
      boxWidth: 240
    });
    expect(dimensionFieldPatch(text, "height", 100, {
      anchor: "nw",
      lockRatio: false
    })).toBeNull();
  });
  it("scales point text through font size while preserving its anchor", () => {
    const text = {
      ...box,
      kind: "text",
      fontSize: 20
    };
    expect(dimensionFieldPatch(text, "width", 240, {
      anchor: "center",
      lockRatio: false
    })).toEqual({
      x: 40,
      y: 50,
      fontSize: 40
    });
  });
  it("does not calculate a scale from a zero-sized node", () => {
    expect(dimensionFieldPatch({
      ...box,
      width: 0
    }, "width", 200, {
      anchor: "nw",
      lockRatio: true
    })).toBeNull();
  });
});

describe("frame-relative inspector coordinates", () => {
  const frame = {
    id: "frame",
    kind: "group",
    isFrame: true,
    x: 800,
    y: 600,
    width: 400,
    height: 300,
  };
  const child = {
    ...box,
    id: "child",
    parentId: "frame",
    x: 1000,
    y: 750,
  };

  it("reports a direct child's anchor in the frame's local space", () => {
    expect(positionPointInFrame(child, frame)).toEqual({ x: 200, y: 150 });
    expect(positionPointInFrame(child, frame, "se")).toEqual({ x: 320, y: 210 });
    // No frame keeps the document-space contract.
    expect(positionPointInFrame(child, null)).toEqual({ x: 1000, y: 750 });
  });

  it("writes a local X/Y back as absolute geometry", () => {
    expect(positionFieldPatchInFrame(child, "x", 250, "nw", frame)).toEqual({
      x: 1050,
    });
    expect(positionFieldPatchInFrame(child, "y", 90, "nw", frame)).toEqual({
      y: 690,
    });
  });

  it("converts local edits through a rotated frame on both document axes", () => {
    const rotatedFrame = { ...frame, rotation: 90 };
    const centered = {
      ...child,
      x: 1000,
      y: 750,
    };
    expect(positionPointInFrame(centered, rotatedFrame)).toEqual({
      x: 200,
      y: 150,
    });
    // Local +X points down the document, so the absolute Y moves and X stays.
    expect(
      positionFieldPatchInFrame(centered, "x", 300, "nw", rotatedFrame),
    ).toEqual({ y: 850 });
    // Local +Y points left along the document, so only absolute X moves.
    expect(
      positionFieldPatchInFrame(centered, "y", 250, "nw", rotatedFrame),
    ).toEqual({ x: 900 });
  });

  it("leaves the frame and the unedited axis untouched", () => {
    const snapshot = JSON.stringify([frame, child]);
    positionFieldPatchInFrame(child, "x", 250, "nw", frame);
    expect(JSON.stringify([frame, child])).toBe(snapshot);
  });
});
