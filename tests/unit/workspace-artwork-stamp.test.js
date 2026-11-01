import { describe, expect, it, vi } from "vitest";
import { createArtworkReadApi } from "../../src/canvas/editor/workspace-artwork-stamp.js";

const font = vi.hoisted(() => ({ revision: 0 }));
vi.mock("../../src/canvas/editor/text_metrics.js", () => ({ textMetricsRevision: () => font.revision }));

describe("workspace artwork identity", () => {
  it("retains camera-independent identity but invalidates every live raster source", () => {
    let doc = { nodes: [{ id: "image", kind: "image", imageId: "asset", maskId: "mask" }] };
    let bitmap, mask, bypass = false;
    const api = createArtworkReadApi({ getDocument: () => doc, getBitmap: () => bitmap,
      getPaintBitmap: () => bitmap, getMask: () => mask, getBypass: () => bypass });
    let stamp = api.getArtworkStamp();
    expect(api.getArtworkStamp()).toBe(stamp);
    for (const change of [() => { bitmap = {}; }, () => { bitmap.__warpTextureVersion = 1; },
      () => { mask = {}; }, () => { mask.__warpTextureVersion = 1; },
      () => { bypass = true; }, () => { font.revision++; }, () => { doc = { ...doc }; }]) {
      change();
      expect(api.getArtworkStamp()).not.toBe(stamp);
      stamp = api.getArtworkStamp();
      expect(api.getArtworkStamp()).toBe(stamp);
    }
    expect(api.getNodeBitmap(doc.nodes[0])).toBe(bitmap);
    expect(api.getNodeMask(doc.nodes[0])).toBe(mask);
  });

  it("tracks independent image fills and refuses to freeze video playback", () => {
    const first = {}, second = {};
    let resource = second;
    let doc = { nodes: [{ id: "paint", kind: "rect", fills: [
      { fill: "data:image/png;base64,one" }, { fill: "data:image/png;base64,two" }] }] };
    const api = createArtworkReadApi({ getDocument: () => doc, getBitmap: () => null,
      getPaintBitmap: node => node.src.endsWith("one") ? first : resource, getMask: () => null, getBypass: () => false });
    const before = api.getArtworkStamp();
    resource = {};
    expect(api.getArtworkStamp()).not.toBe(before);
    doc = { nodes: [{ kind: "video" }] };
    expect(api.getArtworkStamp()).toBeNull();
    doc = { nodes: [], timeline: {} };
    expect(api.getArtworkStamp()).toBeNull();
  });

  it("invalidates a live matte before a mask asset id has been committed", () => {
    const doc = { nodes: [{ kind: "image", imageId: "asset" }] }, bitmap = {};
    let matte;
    const api = createArtworkReadApi({ getDocument: () => doc, getBitmap: () => bitmap,
      getPaintBitmap: () => bitmap, getMask: () => matte, getBypass: () => false });
    const original = api.getArtworkStamp();
    matte = {};
    expect(api.getArtworkStamp()).not.toBe(original);
    const painting = api.getArtworkStamp();
    matte.__warpTextureVersion = 1;
    expect(api.getArtworkStamp()).not.toBe(painting);
  });
});
