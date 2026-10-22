import { describe, expect, it } from "vitest";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";

const guid = (localID) => ({ sessionID: 0, localID });

function change(localID, parentLocalID, position, props) {
  return {
    guid: guid(localID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID), position } }),
    ...props,
  };
}

function gradientRect(paint) {
  return {
    nodeChanges: [
      change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
      change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
      change(2, 1, "!", {
        type: "FRAME",
        name: "Home",
        transform: { m02: 0, m12: 0 },
        size: { x: 400, y: 300 },
        fillPaints: [],
      }),
      change(3, 2, "!", {
        type: "RECTANGLE",
        name: "Hero",
        transform: { m02: 10, m12: 20 },
        size: { x: 200, y: 100 },
        fillPaints: [paint],
      }),
    ],
  };
}

const stops = [
  { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 },
  { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 },
];

function rectFill(paint) {
  const pages = figmaMessageToPages(gradientRect(paint));
  const hero = JSON.stringify(pages).match(/"fill":"([^"]*gradient[^"]*)"/);
  return hero ? hero[1] : null;
}

describe("Figma gradient paints", () => {
  it("imports a linear gradient as an editor linear-gradient along its axis", () => {
    const fill = rectFill({
      type: "GRADIENT_LINEAR",
      visible: true,
      opacity: 1,
      gradientStops: stops,
      transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
    });
    expect(fill).toMatch(/^linear-gradient\(90deg, #ff0000 0%, #0000ff 100%\)/);
    expect(fill).toContain("voo-gradient-line: 0% 50% 100% 50%");
  });

  it("imports a radial gradient as an editor radial-gradient", () => {
    const fill = rectFill({
      type: "GRADIENT_RADIAL",
      visible: true,
      opacity: 1,
      gradientStops: stops,
      transform: { m00: 0.5, m01: 0, m02: 0.5, m10: 0, m11: 0.5, m12: 0.5 },
    });
    expect(fill).toMatch(/^radial-gradient\(ellipse 50% 50% at 75% 75%/);
  });

  it("reads the decoded stops field that Figma files use", () => {
    const fill = rectFill({
      type: "GRADIENT_LINEAR",
      visible: true,
      opacity: 1,
      stops,
      transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
    });
    expect(fill).toMatch(/^linear-gradient\(90deg, #ff0000 0%, #0000ff 100%\)/);
  });

  it("keeps the solid fill when a paint has no gradient stops", () => {
    const fill = rectFill({ type: "GRADIENT_LINEAR", visible: true, gradientStops: [] });
    expect(fill).toBeNull();
  });

  it("skips hidden gradient paints", () => {
    const fill = rectFill({
      type: "GRADIENT_LINEAR",
      visible: false,
      gradientStops: stops,
      transform: { m00: 1, m11: 1 },
    });
    expect(fill).toBeNull();
  });
});
