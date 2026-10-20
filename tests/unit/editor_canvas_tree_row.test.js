import { describe, it, expect } from "vitest";
import { getCanvasTypeIcon } from "../../src/canvas/components/editor_canvas_tree_row.jsx";
import {
  IconFrame,
  IconComponent,
  IconBox3,
  IconFilm,
} from "../../src/canvas/icons.jsx";

describe("EditorCanvasTreeRow (Frame vs Component Icon & Tone)", () => {
  it("uses IconFrame for regular default frames", () => {
    const icon = getCanvasTypeIcon("design", false);
    expect(icon).toBe(IconFrame);
  });

  it("uses IconComponent for component objects", () => {
    const icon = getCanvasTypeIcon("design", true);
    expect(icon).toBe(IconComponent);
  });

  it("uses IconBox3 for 3D frames", () => {
    const icon = getCanvasTypeIcon("3d", false);
    expect(icon).toBe(IconBox3);
  });

  it("uses IconFilm for motion frames", () => {
    const icon = getCanvasTypeIcon("motion", false);
    expect(icon).toBe(IconFilm);
  });
});
