import { describe, expect, it } from "vitest";
import { INITIAL_RASTER_STATE, rasterActionReducer, rasterStateSetters } from "../../src/canvas/components/editor_hooks/raster-action-state.js";
import { nextRetouchFailure, explicitRouteSelection, repaintFailureCode } from "../../src/canvas/components/editor_hooks/use_editor_raster.js";
import { resolveRepaintChain, makeSelectionRepaintPaint } from "../../src/canvas/components/editor_hooks/raster-route-helpers.js";

describe("raster action state and public routing contracts", () => {
  it("preserves functional progress updates and unrelated action state", () => {
    let state = { ...INITIAL_RASTER_STATE };
    const setters = rasterStateSetters(action => { state = rasterActionReducer(state, action); });
    setters.setMaskBusy(true);
    setters.setMattingDownload({ phase: "downloading", progress: 10 });
    setters.setMattingDownload(current => ({ ...current, progress: 50 }));
    setters.setRetouchFailure(current => nextRetouchFailure(current, "failed"));
    setters.setRetouchFailure(current => nextRetouchFailure(current, "failed"));
    expect(state).toMatchObject({ maskBusy: true, mattingDownload: { phase: "downloading", progress: 50 },
      retouchFailure: { code: "failed", seq: 2 }, repaintBusy: false });
    const same = state;
    setters.setMaskBusy(true);
    expect(state).toBe(same);
    expect(() => rasterActionReducer(state, { key: "unknown", value: 1 })).toThrow("Unknown raster state field");
  });

  it("keeps inferred routes unlocked and an explicit model pair exact", async () => {
    expect(explicitRouteSelection({ providerId: "gateway", modelId: "model" })).toEqual({});
    expect(explicitRouteSelection({ providerId: "gateway", modelId: "model", providerTouched: true })).toEqual({ providerId: "gateway", modelId: "model" });
    const candidates = [{ providerId: "gateway", modelId: "model" }];
    expect(await resolveRepaintChain({ routeId: "repaint" }, { routeChain: async () => candidates })).toEqual({ locked: false, chain: candidates });
    expect(await resolveRepaintChain({ routeId: "repaint", providerId: "gateway", modelId: "specific" }, { routeChain: () => { throw new Error("must not fall back"); } })).toEqual({ locked: true, chain: [{ providerId: "gateway", modelId: "specific" }] });
  });

  it("retains the API painter contract and cancellation through the deferred provider", async () => {
    const shouldStop = () => false;
    const onStatus = () => {};
    let received;
    const paint = makeSelectionRepaintPaint({ route: { route: "api" }, providers: [{ providerId: "gateway" }],
      routeId: "selection", shouldStop, onStatus }, { loadRepaintLayer: async () => ({ repaintLayer: async input => { received = input; return "painted"; } }) });
    expect(await paint({ dataUrl: "source", maskDataUrl: "mask", width: 4, height: 3, prompt: "edit" })).toBe("painted");
    expect(received).toMatchObject({ dataUrl: "source", maskDataUrl: "mask", width: 4, height: 3, prompt: "edit", routeId: "selection", shouldStop, onStatus });
    expect(received.providers).toEqual([{ providerId: "gateway" }]);
    expect(repaintFailureCode({ code: "localBackend.unavailable" })).toBe("noRepaintRouteAvailable");
    expect(repaintFailureCode({ status: 402 })).toBe("insufficientCredits");
  });
});
