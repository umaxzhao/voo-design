import { describe, expect, it } from "vitest";
import { serializeFigFile } from "../../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../../src/canvas/figma/figma-schema.js";
import { figBytesToVooFile, figBytesToVooFileStreaming } from "../../../src/canvas/figma/figma-to-voo.js";

const guid = (localID) => ({ sessionID: 0, localID });

function change(localID, parentLocalID, position, props) {
  return {
    guid: guid(localID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID), position } }),
    ...props,
  };
}

/**
 * A document written through the real Figma Kiwi schema, then read back. This
 * exercises the .fig container, compression and decoding end to end; only the
 * source of the bytes is synthetic.
 */
async function buildFigBytes(nodeChanges) {
  const schema = await loadFigmaSchema();
  return serializeFigFile({
    version: 106,
    schema,
    message: { nodeChanges },
  });
}

describe(".fig round trip into voo_design", () => {
  it("opens a written .fig file as pages and layers", async () => {
    const bytes = await buildFigBytes([
      change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
      change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
      change(2, 1, "!", {
        type: "FRAME",
        name: "Home",
        transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
        size: { x: 320, y: 240 },
        fillPaints: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }],
      }),
      change(3, 2, "!", {
        type: "RECTANGLE",
        name: "Box",
        transform: { m00: 1, m01: 0, m02: 12, m10: 0, m11: 1, m12: 16 },
        size: { x: 80, y: 40 },
        fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
      }),
    ]);

    const { vooFile, layerCount, warnings } = await figBytesToVooFile(bytes);
    const home = vooFile.document.pages[0];
    expect(home.sceneDoc.isCanvasRoot).toBe(true);
    const streamed = await figBytesToVooFileStreaming(bytes);
    const streamedDoc = streamed.vooFile.document.pages[0].sceneDoc;
    expect(streamedDoc.isCanvasRoot).toBe(true);
    expect(streamedDoc.nodes.filter((node) => !node.parentId).map((node) => node.name)).toEqual(["Home"]);
    expect(streamedDoc.nodes.find((node) => node.name === "Home").frame).toBe(true);
    const box = home.sceneDoc.nodes.find((node) => node.name === "Box");

    expect(vooFile.document.pages.map((page) => page.label)).toEqual(["Page 1"]);
    // The Home frame container, its background layer, and the Box child layer.
    expect(layerCount).toBe(3);
    const homeFrame = home.sceneDoc.nodes.find((node) => node.name === "Home");
    expect(homeFrame).toBeDefined();
    expect(homeFrame.frame).toBe(true);
    expect(box.parentId).toBe(homeFrame.id);
    expect(warnings).toEqual([]);
    expect({ x: box.x, y: box.y, width: box.width, height: box.height }).toEqual({
      x: 12,
      y: 16,
      width: 80,
      height: 40,
    });
    expect(box.fill).toBe("#ff0000");
  });

  it("rejects a .fig file with nothing to map", async () => {
    const bytes = await buildFigBytes([change(0, null, "", { type: "DOCUMENT", name: "Doc" })]);

    await expect(figBytesToVooFile(bytes)).rejects.toThrow("figma-no-layers");
  });
});
