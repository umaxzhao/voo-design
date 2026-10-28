import { describe, expect, it, vi } from "vitest";

describe("Skia surface resize lifecycle", () => {
  it("M3.6: SkiaHost resize guard prevents surface recreation during pan/zoom", async () => {
    // Mock CanvasKit runtime in Node test environment
    if (typeof globalThis.window === "undefined") {
      globalThis.window = {};
    }
    const prevCanvasKitInit = globalThis.window.CanvasKitInit;
    globalThis.window.CanvasKitInit = async () => ({
      GetWebGLContext: () => 1,
      MakeWebGLContext: () => ({ delete: () => {} }),
      MakeOnScreenGLSurface: () => ({
        getCanvas: () => ({
          clear: () => {},
          save: () => {},
          restore: () => {},
          scale: () => {},
          translate: () => {},
        }),
        delete: () => {},
      }),
      MakeSWCanvasSurface: () => ({
        getCanvas: () => ({
          clear: () => {},
          save: () => {},
          restore: () => {},
          scale: () => {},
          translate: () => {},
        }),
        delete: () => {},
      }),
      ColorSpace: { SRGB: {} },
      ParagraphStyle: class {},
      FontCollection: class {},
      TextStyle: class {},
      TypefaceFontProvider: {
        Make: () => ({
          registerFont: () => {},
          delete: () => {},
        }),
      },
      ParagraphBuilder: {
        MakeFromFontProvider: () => ({
          build: () => ({ layout: () => {} }),
        }),
      },
      Paint: class {
        setAntiAlias() {}
        setColor() {}
        setStyle() {}
        setShader() {}
        setImageFilter() {}
        setMaskFilter() {}
        setBlendMode() {}
        setStrokeWidth() {}
        setStrokeJoin() {}
        delete() {}
      },
      PaintStyle: { Fill: 0, Stroke: 1 },
      Path: {
        MakeFromSVGString: () => ({ delete: () => {} }),
      },
      StrokeJoin: { Round: 1, Miter: 0, Bevel: 2 },
      BlendMode: {},
      ClipOp: { Intersect: 0 },
      FontWeight: { Bold: 700, SemiBold: 600, Medium: 500, Normal: 400, Light: 300, ExtraLight: 200 },
      FontSlant: { Italic: 1, Upright: 0 },
      TextDirection: { LTR: 0, RTL: 1 },
      parseColorString: () => [0, 0, 0, 1],
    });

    const { createSkiaHost } = await import(
      "../../src/canvas/editor/skia_host.js"
    );

    const mockCanvas = {
      width: 1000,
      height: 800,
      style: {},
      getContext: () => null,
    };

    try {
      const host = await createSkiaHost(mockCanvas);
      const resizeSpy = vi.spyOn(host.instance, "resize");

      // First initial resize with stage dimensions
      host.resize(1000, 800, 1);
      expect(resizeSpy).toHaveBeenCalledTimes(1);

      // Repeated resize calls with identical dimensions (simulating pan/zoom frames)
      for (let i = 0; i < 20; i += 1) {
        host.resize(1000, 800, 1);
      }
      // resizeSpy count must remain 1: zero surface destruction or reallocation!
      expect(resizeSpy).toHaveBeenCalledTimes(1);

      // Changing actual stage dimension triggers resize
      host.resize(1200, 900, 1);
      expect(resizeSpy).toHaveBeenCalledTimes(2);

      host.dispose();
    } finally {
      if (prevCanvasKitInit) {
        globalThis.window.CanvasKitInit = prevCanvasKitInit;
      } else {
        delete globalThis.window.CanvasKitInit;
      }
    }
  });

});
