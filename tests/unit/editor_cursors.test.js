import { describe, expect, it } from "vitest";
import { cursorForHandle } from "../../src/canvas/editor/scene_geometry_anchors.js";
import { rotationCursorForAngle } from "../../src/canvas/editor/editor-cursors.js";
import {
  DIAGONAL_NESW_CURSOR,
  DIAGONAL_NWSE_CURSOR,
  HORIZONTAL_SCALE_CURSOR,
  ROTATE_CURSOR,
  VERTICAL_SCALE_CURSOR,
} from "../../src/canvas/editor/cursor_assets.js";

describe("editor cursors", () => {
  it("uses the supplied horizontal/vertical resize cursors", () => {
    expect(cursorForHandle("e", 0)).toBe(HORIZONTAL_SCALE_CURSOR);
    expect(cursorForHandle("w", 0)).toBe(HORIZONTAL_SCALE_CURSOR);
    expect(cursorForHandle("n", 0)).toBe(VERTICAL_SCALE_CURSOR);
    expect(cursorForHandle("s", 0)).toBe(VERTICAL_SCALE_CURSOR);
  });

  it("uses the supplied diagonal cursors for corner handles", () => {
    expect(cursorForHandle("nw", 0)).toBe(DIAGONAL_NWSE_CURSOR);
    expect(cursorForHandle("se", 0)).toBe(DIAGONAL_NWSE_CURSOR);
    expect(cursorForHandle("ne", 0)).toBe(DIAGONAL_NESW_CURSOR);
    expect(cursorForHandle("sw", 0)).toBe(DIAGONAL_NESW_CURSOR);
    expect(DIAGONAL_NESW_CURSOR).toContain("data:image/svg+xml");
  });

  it("uses the supplied rotate cursor for the rotation grip", () => {
    expect(rotationCursorForAngle(0)).toBe(ROTATE_CURSOR);
    expect(rotationCursorForAngle(45)).not.toBe(rotationCursorForAngle(0));
    expect(decodeURIComponent(rotationCursorForAngle(45))).toContain("rotate(45 148 21)");
    expect(ROTATE_CURSOR).toContain("data:image/svg+xml");
  });
});
