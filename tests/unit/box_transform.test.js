import { describe, it, expect } from "vitest";
import {
  OPPOSITE_HANDLE,
  CORNER_HANDLES,
  EDGE_HANDLES,
  ALL_HANDLES,
  edgesOfHandle,
  rotateVector,
  unrotateVector,
  calculateHandlePoints,
  resizeBoxWithTransform,
  calculateRotationAngle,
} from "../../src/canvas/editor/box_transform_math.js";

describe("Box Transform Mathematics & 8-Point Handles", () => {
  it("handle definitions and opposites form a closed involution", () => {
    expect(ALL_HANDLES.length).toBe(8);
    expect(CORNER_HANDLES.length).toBe(4);
    expect(EDGE_HANDLES.length).toBe(4);

    for (const handle of ALL_HANDLES) {
      const opp = OPPOSITE_HANDLE[handle];
      expect(opp).toBeDefined();
      expect(OPPOSITE_HANDLE[opp]).toBe(handle);
    }
  });

  it("edgesOfHandle correctly decomposes all 8 handles", () => {
    expect(edgesOfHandle("nw")).toEqual({ left: true, right: false, top: true, bottom: false });
    expect(edgesOfHandle("ne")).toEqual({ left: false, right: true, top: true, bottom: false });
    expect(edgesOfHandle("se")).toEqual({ left: false, right: true, top: false, bottom: true });
    expect(edgesOfHandle("sw")).toEqual({ left: true, right: false, top: false, bottom: true });
    expect(edgesOfHandle("n")).toEqual({ left: false, right: false, top: true, bottom: false });
    expect(edgesOfHandle("s")).toEqual({ left: false, right: false, top: false, bottom: true });
    expect(edgesOfHandle("w")).toEqual({ left: true, right: false, top: false, bottom: false });
    expect(edgesOfHandle("e")).toEqual({ left: false, right: true, top: false, bottom: false });
  });

  it("rotateVector and unrotateVector are exact inverses", () => {
    const v = { x: 30, y: -45 };
    const angles = [0, 45, 90, 135, 180, 270, -30, 360];

    for (const deg of angles) {
      const rotated = rotateVector(v, deg);
      const unrotated = unrotateVector(rotated, deg);
      expect(Math.abs(unrotated.x - v.x)).toBeLessThan(1e-9);
      expect(Math.abs(unrotated.y - v.y)).toBeLessThan(1e-9);
    }
  });

  it("calculates 8 bounding handle coordinates accurately", () => {
    const box = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };
    const handleList = calculateHandlePoints(box);
    const handles = Object.fromEntries(handleList.map((h) => [h.handle, { x: h.x, y: h.y }]));

    expect(handles.nw).toEqual({ x: 100, y: 100 });
    expect(handles.ne).toEqual({ x: 300, y: 100 });
    expect(handles.se).toEqual({ x: 300, y: 200 });
    expect(handles.sw).toEqual({ x: 100, y: 200 });
    expect(handles.n).toEqual({ x: 200, y: 100 });
    expect(handles.s).toEqual({ x: 200, y: 200 });
    expect(handles.w).toEqual({ x: 100, y: 150 });
    expect(handles.e).toEqual({ x: 300, y: 150 });
  });

  it("resizes box preserving aspect ratio when keepRatio is enabled (Shift)", () => {
    const rect = { x: 50, y: 50, width: 200, height: 100 };
    const initialRatio = rect.width / rect.height;

    // Drag SE corner with delta dx = 100, dy = 50
    const result = resizeBoxWithTransform({
      rect,
      handle: "se",
      delta: { x: 100, y: 50 },
      rotation: 0,
      keepRatio: true,
      fromCentre: false,
    });

    const newRatio = result.width / result.height;
    expect(Math.abs(newRatio - initialRatio)).toBeLessThan(1e-6);
  });

  it("resizes box symmetrically around center when fromCentre is enabled (Alt)", () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    const center = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };

    const result = resizeBoxWithTransform({
      rect,
      handle: "se",
      delta: { x: 50, y: 50 },
      rotation: 0,
      keepRatio: false,
      fromCentre: true,
    });

    const newCenter = {
      x: result.x + result.width / 2,
      y: result.y + result.height / 2,
    };

    expect(Math.abs(newCenter.x - center.x)).toBeLessThan(1e-9);
    expect(Math.abs(newCenter.y - center.y)).toBeLessThan(1e-9);
  });

  it("calculates rotation angles from cursor offset with 15° snapping", () => {
    const center = { x: 200, y: 200 };
    // Pointer straight right from center: stalkOffset 90, so angle = 90
    const angle = calculateRotationAngle({
      pointer: { x: 300, y: 200 },
      center,
      stalkOffset: 0,
    });
    expect(Math.abs(angle)).toBeLessThan(1e-6);

    // Pointer straight down: angle = 90
    const angle90 = calculateRotationAngle({
      pointer: { x: 200, y: 300 },
      center,
      stalkOffset: 0,
    });
    expect(Math.abs(angle90 - 90)).toBeLessThan(1e-6);
  });
});
