import { describe, it, expect } from "vitest";
import { createVideoNode, isVideoNode, normalizeVideoNode } from "../../src/canvas/editor/scene-video.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";

describe("video layer model", () => {
  it("creates a boxed video layer with default playback settings", () => {
    const node = createVideoNode({ box: { x: 10, y: 20, width: 640, height: 360 }, src: "blob:clip" });
    expect(node.kind).toBe(NODE_KIND.VIDEO);
    expect(isVideoNode(node)).toBe(true);
    expect(node.width).toBe(640);
    expect(node.media).toEqual({ inPoint: 0, outPoint: null, volume: 1, muted: false, loop: true });
  });

  it("clamps invalid playback values instead of trusting them", () => {
    const node = normalizeVideoNode({
      ...createVideoNode({ src: "x" }),
      media: { inPoint: -5, outPoint: -1, volume: 3, muted: 1 },
    });
    expect(node.media.inPoint).toBe(0);
    expect(node.media.outPoint).toBe(0);
    expect(node.media.volume).toBe(1);
    expect(node.media.muted).toBe(true);
  });
});
