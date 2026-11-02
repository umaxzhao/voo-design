import { describe, expect, it } from "vitest";
import { aiProgressPct, aiProgressLabel } from "../../src/canvas/components/editor_ai_progress.js";

const translate = (key, params) => ({ key, params });

describe("editor model progress copy", () => {
  it("reports determinate downloads and clamps completed transfers", () => {
    expect(aiProgressPct({ phase: "downloading", loaded: 1, total: 3 })).toBe(33);
    expect(aiProgressPct({ phase: "downloading", loaded: 5, total: 3 })).toBe(100);
    expect(aiProgressPct({ phase: "cached" })).toBe(100);
    expect(aiProgressPct({ phase: "downloading", loaded: 1, total: 0 })).toBe(null);
    expect(aiProgressPct(null)).toBe(null);
  });

  it("keeps indeterminate download and tile counts meaningful", () => {
    expect(aiProgressLabel({ phase: "downloading", loaded: 4, total: 0 }, translate)).toEqual({ key: "editor.aiProgress.downloading", params: { pct: "…" } });
    expect(aiProgressLabel({ phase: "tiling", tile: 2, tiles: 8 }, translate)).toEqual({ key: "editor.aiProgress.tiling", params: { tile: 2, tiles: 8 } });
    expect(aiProgressLabel({ phase: "fallback", providerName: "Local", providerId: "other" }, translate)).toEqual({ key: "editor.aiProgress.fallback", params: { provider: "Local" } });
    expect(aiProgressLabel({ phase: "starting" }, translate)).toEqual({ key: "stage.starting", params: undefined });
  });
});
