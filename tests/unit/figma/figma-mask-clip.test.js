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

const solid = { type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true };

/** A frame: a gradient mask at the bottom, then a photo and a badge above it. Figma masks what sits above. */
function maskedFrame() {
  return {
    nodeChanges: [
      change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
      change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
      change(2, 1, "!", {
        type: "FRAME",
        name: "Cover",
        transform: { m02: 0, m12: 0 },
        size: { x: 400, y: 300 },
        fillPaints: [],
      }),
      change(3, 2, '"', {
        type: "RECTANGLE",
        name: "Photo",
        transform: { m02: 0, m12: 0 },
        size: { x: 400, y: 300 },
        fillPaints: [solid],
      }),
      change(4, 2, "!", {
        type: "ROUNDED_RECTANGLE",
        name: "Fade mask",
        mask: true,
        transform: { m02: 0, m12: 150 },
        size: { x: 400, y: 150 },
        fillPaints: [solid],
      }),
      change(5, 2, "#", {
        type: "RECTANGLE",
        name: "Badge",
        transform: { m02: 10, m12: 10 },
        size: { x: 40, y: 40 },
        fillPaints: [solid],
      }),
    ],
  };
}

function flatNodes(message) {
  return figmaMessageToPages(message).pages.flatMap((page) => page.nodes);
}

describe("Figma mask import", () => {
  it("clips every sibling above the mask to it", () => {
    const nodes = flatNodes(maskedFrame());
    const mask = nodes.find((node) => node.name === "Fade mask");
    const photo = nodes.find((node) => node.name === "Photo");
    const badge = nodes.find((node) => node.name === "Badge");

    expect(mask.maskBase).toBe(true);
    expect(photo.clipTo).toBe(mask.id);
    expect(badge.clipTo).toBe(mask.id);
    expect(nodes.indexOf(mask)).toBeLessThan(nodes.indexOf(photo));
  });

  it("does not turn a frame's own clip flag into a mask", () => {
    const message = maskedFrame();
    message.nodeChanges[4].mask = false;
    const nodes = flatNodes(message);
    expect(nodes.some((node) => node.maskBase)).toBe(false);
    expect(nodes.some((node) => node.clipTo)).toBe(false);
  });
});
