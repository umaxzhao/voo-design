import { afterEach, describe, expect, it, vi } from "vitest";
import { drawInnerShadowOverlay } from "../../src/canvas/editor/node_effects.js";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const read = vi.fn((x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }));
  const context = { save() {}, restore() {}, translate() {}, getImageData: read };
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
  const node = { kind: "path", visible: true, width: 20, height: 20, x: 0, y: 0, fill: "transparent" };
  const effect = { enabled: true, color: "#000000", opacity: 100, offsetX: 2, offsetY: 1, blur: 4 };
  const paint = vi.fn();
  return { node, effect, paint, read, render: (value = node) => drawInnerShadowOverlay(context, value, effect, paint) };
}

describe("empty static effect raster cache", () => {
  it("does not repaint or read pixels for the same empty vector silhouette", () => {
    const f = fixture();
    f.render(); f.render(); f.render();
    expect(f.paint).toHaveBeenCalledTimes(1);
    expect(f.read).toHaveBeenCalledTimes(1);
    f.render({ ...f.node, fill: "#ff0000" });
    expect(f.paint).toHaveBeenCalledTimes(2);
  });

  it("retries empty image and text bodies so asynchronous resources can appear", () => {
    const f = fixture();
    for (const node of [{ ...f.node, kind: "image", imageId: "pending" },
      { ...f.node, fill: "data:image/png;base64,pending" }, { ...f.node, kind: "text" }]) {
      f.render(node); f.render(node);
    }
    expect(f.paint).toHaveBeenCalledTimes(6);
    expect(f.read).toHaveBeenCalledTimes(6);
  });
});
