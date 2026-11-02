import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
  providerConfig: vi.fn(),
  readImageRgba: vi.fn(),
  saliency: vi.fn(),
  repaint: vi.fn(),
  decode: vi.fn(),
  stopWatch: vi.fn(),
}));

vi.mock("../../src/canvas/model_route_resolver.js", () => ({
  resolveCanvasModelRouteFallbackChain: mocks.route,
}));
vi.mock("../../src/canvas/provider_client.js", () => ({
  getProviderConfig: mocks.providerConfig,
}));
vi.mock("../../src/canvas/components/bitmap_pixels.js", () => ({
  readImageRgba: mocks.readImageRgba,
  rgbaToPngDataUrl: () => "composite-data",
}));
vi.mock("../../src/canvas/editor/saliency_map.js", () => ({
  computeSaliencyMap: mocks.saliency,
  SALIENCY_ANALYSIS_MAX_EDGE: 128,
}));
vi.mock("../../src/canvas/editor/layer_repaint.js", () => ({
  repaintLayer: mocks.repaint,
}));
vi.mock("../../src/canvas/editor/bitmap_cache.js", () => ({
  decodeImageSource: mocks.decode,
}));
vi.mock("../../src/shared/local_backend_events.js", () => ({
  onLocalBackendStarting: () => mocks.stopWatch,
}));
vi.mock("../../src/canvas/rpc.js", () => ({
  callHost: vi.fn(),
  getEnvironment: () => ({ mode: "standalone" }),
}));
vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: { getState: () => ({ settings: {} }) },
}));

import { editorRouteChain, repaintChainReady } from "../../src/canvas/components/editor_hooks/raster-route-helpers.js";
import { createOutpaintAction } from "../../src/canvas/components/editor_hooks/raster-outpaint-action.js";
import { reportRasterFallback } from "../../src/canvas/components/editor_hooks/raster-fallback-diagnostics.js";

let warn;

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("raster fallback diagnostics", () => {
  it("retains an empty route chain and reports only a safe error name", async () => {
    const error = new Error("https://private.example/?token=secret");
    error.name = "QuotaExceededError";
    mocks.route.mockRejectedValue(error);

    await expect(editorRouteChain("repaint", "private-provider")).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("raster-fallback", {
      code: "model-route-unavailable",
      errorName: "QuotaExceededError",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|private|https/);
  });

  it("retains an unavailable provider when reading configuration fails", async () => {
    mocks.providerConfig.mockRejectedValue(new TypeError("credential=secret"));
    await expect(repaintChainReady({ locked: true, chain: [{ providerId: "private-provider" }] })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("raster-fallback", {
      code: "provider-config-unavailable",
      errorName: "TypeError",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|private/);
  });

  it("does not log successful or empty configuration reads", async () => {
    const chain = [{ providerId: "configured" }];
    mocks.route.mockResolvedValue(chain);
    mocks.providerConfig.mockResolvedValue({ configured: true });
    await expect(editorRouteChain("repaint")).resolves.toBe(chain);
    await expect(repaintChainReady({ locked: true, chain })).resolves.toBe(true);
    mocks.providerConfig.mockResolvedValue(null);
    await expect(repaintChainReady({ locked: true, chain })).resolves.toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("redacts custom names and non-error thrown values", () => {
    reportRasterFallback("model-route-unavailable", { name: "secret-provider-token" });
    reportRasterFallback("model-route-unavailable", "secret-provider-token");
    expect(warn.mock.calls).toEqual([
      ["raster-fallback", { code: "model-route-unavailable", errorName: "Error" }],
      ["raster-fallback", { code: "model-route-unavailable", errorName: "Error" }],
    ]);
  });
});

function outpaintContext() {
  const node = { id: "image", x: 0, y: 0, width: 2, height: 2 };
  const rect = { x: -1, y: 0, width: 4, height: 2 };
  const emitGeneratedOutput = vi.fn(async () => true);
  const context = {
    engine: {
      exportNodePng: () => "source-data",
      serialise: () => ({ width: 10, height: 10, nodes: [node] }),
    },
    repaintBusy: false,
    setMaskError: vi.fn(),
    setRepaintBusy: vi.fn(),
    setRepaintStatus: vi.fn(),
    emitGeneratedOutput,
    onMaterializeGeneratedOutput: vi.fn(),
    inFlightAbortRef: { current: null },
    isCurrent: () => true,
  };
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) }),
      });
      return canvas;
    },
  });
  mocks.decode.mockResolvedValue({ width: 2, height: 2 });
  mocks.route.mockResolvedValue([{ providerId: "configured" }]);
  mocks.repaint.mockResolvedValue("painted-data");
  return { context, node, rect };
}

describe("outpaint saliency fallback", () => {
  it("continues publishing the requested rect after saliency pixel read fails", async () => {
    const { context, node, rect } = outpaintContext();
    const error = new Error("private-image-url");
    error.name = "SecurityError";
    mocks.readImageRgba.mockImplementation(() => { throw error; });

    await expect(createOutpaintAction(context).runOutpaint(node, rect, "")).resolves.toBe(true);
    expect(context.emitGeneratedOutput).toHaveBeenCalledTimes(1);
    expect(context.emitGeneratedOutput.mock.calls[0][0].scenePatch).toMatchObject({
      nodeRect: { x: 0, y: 0, width: 4, height: 2 },
      documentGrowth: { width: 10, height: 10, shiftX: 1, shiftY: 0 },
    });
    expect(context.setMaskError.mock.calls).toEqual([[false]]);
    expect(mocks.stopWatch).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls).toEqual([["raster-fallback", {
      code: "outpaint-saliency-unavailable", errorName: "SecurityError",
    }]]);
  });

  it("does not log an unusable saliency map that was read successfully", async () => {
    const { context, node, rect } = outpaintContext();
    mocks.readImageRgba.mockReturnValue({ rgba: new Uint8ClampedArray(16), width: 2, height: 2 });
    mocks.saliency.mockReturnValue(null);

    await expect(createOutpaintAction(context).runOutpaint(node, rect, "")).resolves.toBe(true);
    expect(context.emitGeneratedOutput).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
