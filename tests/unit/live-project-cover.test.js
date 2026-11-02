import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLiveProjectCover } from "../../src/canvas/previews/live-project-cover.js";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const frame = { id: "frame", kind: "group", isFrame: true, clipContent: true,
    x: -100, y: -200, width: 1600, height: 800 };
  let doc = { isCanvasRoot: true, nodes: [frame] }, stamp = { resources: [{}, 0] };
  const canvas = { width: 0, height: 0, toDataURL: vi.fn(() => "data:image/png;base64,AA==") };
  vi.stubGlobal("document", { createElement: () => canvas });
  const engine = { getDocument: () => doc, getArtworkStamp: () => stamp,
    renderLayerPass: vi.fn((target, ids, surface) => { target.width = surface.stageWidth; target.height = surface.stageHeight; }) };
  return { engine, canvas, setDoc: value => { doc = value; }, setStamp: value => { stamp = value; } };
}

describe("bounded live draft covers", () => {
  it("renders a small signed-world surface at DPR1 and reuses unchanged pixels", () => {
    const f = fixture(), originalDoc = f.engine.getDocument();
    expect(captureLiveProjectCover(f.engine)).toContain("data:image/png");
    expect(f.engine.renderLayerPass).toHaveBeenCalledWith(f.canvas, ["frame"], {
      dpr: 1, stageWidth: 512, stageHeight: 256, viewport: { zoom: .32, panX: 32, panY: 64 },
    });
    expect(f.canvas.width).toBe(0); expect(f.canvas.height).toBe(0);
    expect(f.engine.getDocument()).toBe(originalDoc);
    captureLiveProjectCover(f.engine);
    expect(f.engine.renderLayerPass).toHaveBeenCalledOnce();
    f.setStamp({ resources: [{}, 1] }); captureLiveProjectCover(f.engine);
    expect(f.engine.renderLayerPass).toHaveBeenCalledTimes(2);
  });

  it("falls back for loose content, incomplete assets, unavailable stamp or engine", () => {
    const f = fixture();
    const original = f.engine.getDocument();
    f.setDoc({ ...original, nodes: [...original.nodes, { id: "image", kind: "image", parentId: "frame" }] });
    expect(captureLiveProjectCover(f.engine)).toBeNull();
    f.setDoc({ ...original, nodes: [{ ...original.nodes[0], fills: [{ imageId: "picture" }] }] });
    expect(captureLiveProjectCover(f.engine)).toBeNull();
    f.setDoc(original);
    f.setStamp(null); expect(captureLiveProjectCover(f.engine)).toBeNull();
    f.setDoc({ isCanvasRoot: true, nodes: [{ id: "rect", kind: "rect" }] });
    expect(captureLiveProjectCover(f.engine)).toBeNull();
    expect(captureLiveProjectCover(null)).toBeNull();
    expect(f.engine.renderLayerPass).not.toHaveBeenCalled();
  });

  it("discards a render when its resource revision changes and frees its canvas on failure", () => {
    const f = fixture();
    f.engine.renderLayerPass.mockImplementationOnce(() => f.setStamp({ resources: [{}, 2] }));
    expect(captureLiveProjectCover(f.engine)).toBeNull();
    f.engine.renderLayerPass.mockImplementationOnce(() => { throw new Error("render failed"); });
    expect(() => captureLiveProjectCover(f.engine)).toThrow("render failed");
    expect(f.canvas.width).toBe(0); expect(f.canvas.height).toBe(0);
  });
});
