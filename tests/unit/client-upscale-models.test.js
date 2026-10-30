import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { UPSCALE_MODELS } from "../../src/canvas/editor/upscale_models.js";
describe("shipped client super-resolution assets", () => {
  it("uses pinned, checksum-verified weights for every advertised upscale choice", async () => {
    const directory = new URL("../../vendor/client-models/", import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
    for (const model of UPSCALE_MODELS) {
      const asset = manifest.models.find(entry => entry.file === model.filename);
      expect(asset).toBeDefined();
      const bytes = await readFile(new URL(model.filename, directory));
      expect(bytes.length).toBe(asset.bytes);
      expect(bytes.length).toBe(model.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(asset.url).toMatch(/\/resolve\/[a-f0-9]{40}\/model\.onnx$/);
      expect(asset.license).toBe("BSD-3-Clause");
      expect([2, 4]).toContain(model.scale);
      expect(model.nativeScale ?? model.scale).toBe(4);
    }
    expect(await readFile(new URL("realesrgan-license.txt", directory), "utf8")).toContain("Copyright (c) 2021, Xintao Wang");
    expect(new Set(UPSCALE_MODELS.map(model => model.filename)).size).toBe(2);
  });
});
