import { describe, it, expect } from "vitest";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";
import { buildFigContainer } from "../../../src/canvas/figma/voo-to-fig.js";
import { serialiseDocument, deserialiseDocument } from "../../../src/canvas/editor/scene_model_serialization.js";
import { resolvePaintStyle } from "../../../src/canvas/editor/render_basic_shapes.js";
import { serializeFigFile } from "../../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../../src/canvas/figma/figma-schema.js";
import { figBytesToVooFileStreaming } from "../../../src/canvas/figma/figma-to-voo.js";

export const fade = {
  type: "GRADIENT_LINEAR", opacity: 0.6, visible: true,
  transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
  stops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
    { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }],
};
const guid = (localID) => ({ sessionID: 0, localID });
export function maskMessage() {
  return { nodeChanges: [
    { guid: guid(0), type: "DOCUMENT" },
    { guid: guid(1), type: "CANVAS", parentIndex: { guid: guid(0), position: "!" } },
    ...[2, 3].map((id) => ({
      guid: guid(id), parentIndex: { guid: guid(1), position: String(id) }, type: "RECTANGLE",
      name: id === 2 ? "Gradient mask" : "Masked artwork", size: { x: 600, y: 300 },
      transform: { m02: 0, m12: 0 }, ...(id === 2 ? { mask: true } : {}),
      fillPaints: id === 2 ? [fade] : [{ type: "SOLID", color: { r: 0.1, g: 0.4, b: 1, a: 1 } }],
    })),
  ] };
}
describe("gradient mask regression", () => {
  it("links page-root masks without inserting an outer frame and survives save/reopen", () => {
    const page = figmaMessageToPages(maskMessage()).pages[0];
    expect(page.nodes).toHaveLength(2);
    expect(page.nodes[0].maskBase).toBe(true);
    expect(page.nodes[1].clipTo).toBe(page.nodes[0].id);
    expect(page.nodes.every((n) => !n.parentId)).toBe(true);
    const reopened = deserialiseDocument(serialiseDocument({ ...page, backgroundColor: "transparent" }));
    expect(reopened.nodes[0].fill).toContain("gradient");
    expect(reopened.nodes[0].fillOpacity).toBe(0.6);
    expect(reopened.nodes[1].clipTo).toBe(reopened.nodes[0].id);
  });
  it("sends transparent stops and paint opacity to the canvas gradient", () => {
    const mask = figmaMessageToPages(maskMessage()).pages[0].nodes[0];
    const stops = [];
    resolvePaintStyle({ createLinearGradient: () => ({ addColorStop: (...args) => stops.push(args) }) },
      mask.fill, 0, 0, 599, 301, mask.fillOpacity);
    expect(stops[0][1]).toMatch(/0\.6/);
    expect(stops[1][1]).toMatch(/, 0\)/);
  });
  it("retains a gradient on a vector mask and gradient-only frame background", () => {
    const message = maskMessage();
    message.nodeChanges[2].type = "VECTOR";
    expect(figmaMessageToPages(message).pages[0].nodes[0].fill).toContain("gradient");
    message.nodeChanges[2].type = "FRAME";
    message.nodeChanges[3].parentIndex.guid = guid(2);
    const nodes = figmaMessageToPages(message).pages[0].nodes;
    expect(nodes.find((n) => n.isFrameBackground).fill).toContain("gradient");
  });
  it("keeps mixed visible and hidden paints on one node", () => {
    const message = maskMessage();
    message.nodeChanges[3].fillPaints.push({ ...fade, visible: false, blendMode: "MULTIPLY" });
    const nodes = figmaMessageToPages(message).pages[0].nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[1].fills).toHaveLength(2);
    expect(nodes[1].fills[1]).toMatchObject({ visible: false, opacity: 0.6, blendMode: "multiply" });
  });
  it("survives real Kiwi encoding and streaming import without a page wrapper", async () => {
    const schema = await loadFigmaSchema();
    const page = figmaMessageToPages(maskMessage()).pages[0];
    const bytes = await serializeFigFile(buildFigContainer(page, { version: 106, schema, message: {} }));
    const chunks = [];
    const result = await figBytesToVooFileStreaming(bytes, { onChunk: (chunk) => chunks.push(...chunk.nodes) });
    const nodes = result.vooFile.document.pages[0].sceneDoc.nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[0].maskBase).toBe(true);
    expect(nodes[0].fill).toContain("gradient");
    expect(nodes[1].clipTo).toBe(nodes[0].id);
    expect(chunks[1].clipTo).toBe(chunks[0].id);
    expect(nodes.every((node) => !node.parentId)).toBe(true);
  });
  it("writes gradient masks back to native Figma records", () => {
    const page = figmaMessageToPages(maskMessage()).pages[0];
    const container = buildFigContainer(page, { version: 1, schema: {}, message: {} });
    const mask = container.message.nodeChanges.find((n) => n.mask);
    expect(mask.maskType).toBe("ALPHA");
    expect(mask.fillPaints[0]).toMatchObject({ type: "GRADIENT_LINEAR", opacity: 0.6 });
    const again = figmaMessageToPages(container.message).pages[0].nodes;
    expect(again[1].clipTo).toBe(again[0].id);
    expect(again[0].fill).toBe(page.nodes[0].fill);
  });
});
