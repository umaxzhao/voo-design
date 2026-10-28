import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.stubEnv("VITE_MODEL_BASE_URL", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("local model distribution endpoints", () => {
  it("defaults to the deployed editor model directory", async () => {
    const { MODEL_BASE_URL } = await import("../../src/shared/app_endpoints.js");
    const { MATTING_MODELS } = await import("../../src/canvas/editor/matting_models.js");
    const { UPSCALE_MODELS } = await import("../../src/canvas/editor/upscale_models.js");
    expect(MODEL_BASE_URL).toBe("https://voo.run/editor/models");
    expect(MATTING_MODELS[0].url).toBe(`${MODEL_BASE_URL}/rmbg-1.4-fp16.onnx`);
    expect(UPSCALE_MODELS.every(model => model.url.startsWith(`${MODEL_BASE_URL}/`))).toBe(true);
  });

  it("retains custom model hosting overrides and removes trailing slashes", async () => {
    vi.stubEnv("VITE_MODEL_BASE_URL", "https://models.example.test/weights///");
    const { MODEL_BASE_URL } = await import("../../src/shared/app_endpoints.js");
    const { MATTING_MODELS } = await import("../../src/canvas/editor/matting_models.js");
    expect(MODEL_BASE_URL).toBe("https://models.example.test/weights");
    expect(MATTING_MODELS[0].url).toBe("https://models.example.test/weights/rmbg-1.4-fp16.onnx");
  });
});
