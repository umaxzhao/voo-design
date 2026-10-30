import { describe, expect, it } from "vitest";
import { selectionColours } from "../../src/canvas/components/editor_properties/selection_colors_section.jsx";
import { formatDiamondGradient } from "../../src/canvas/color_picker/diamond_gradient.js";
import { formatMeshGradient } from "../../src/canvas/color_picker/mesh_gradient.js";

const LINEAR = "linear-gradient(90deg, #FFFFFF 0%, #A3E635 100%)";

describe("page and selection paint collection", () => {
  it("keeps complete gradients and counts each matching layer once", () => {
    const colours = selectionColours([
      { id: "a", fill: LINEAR, stroke: LINEAR },
      { id: "b", fills: [{ fill: LINEAR }, { fill: "#ffffff" }] },
    ]);
    expect(colours).toEqual([
      { colour: LINEAR, gradient: true, nodes: ["a", "b"] },
      { colour: "#FFFFFF", gradient: false, nodes: ["b"] },
    ]);
  });

  it("includes visible secondary fills and strokes but excludes hidden paints and images", () => {
    const colours = selectionColours([
      {
        id: "a",
        fill: "#FF0000",
        fills: [
          { fill: "#FF0000", visible: false },
          { fill: LINEAR },
          { fill: 'url("photo.png")' },
        ],
        strokeFills: [{ fill: "#ffffff" }, { fill: "#000000" }],
      },
    ]);
    expect(colours.map((entry) => entry.colour)).toEqual([
      LINEAR,
      "#FFFFFF",
      "#000000",
    ]);
  });

  it("does not merge gradients with different directions or stops", () => {
    expect(
      selectionColours([
        { id: "a", fill: LINEAR },
        { id: "b", fill: LINEAR.replace("90deg", "180deg") },
        { id: "c", fill: LINEAR.replace("#A3E635", "#000000") },
      ]),
    ).toHaveLength(3);
  });

  it.each([
    "radial-gradient(circle, #FFFFFF, #000000)",
    "conic-gradient(from 45deg, #FFFFFF, #000000)",
    formatDiamondGradient("45deg"),
    formatMeshGradient(),
  ])("preserves supported gradient previews: %#", (gradient) => {
    expect(selectionColours([{ id: "a", fill: gradient }])).toEqual([
      { colour: gradient, gradient: true, nodes: ["a"] },
    ]);
  });
});
