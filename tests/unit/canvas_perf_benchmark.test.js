import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  renderConsoleSummary,
  resolveBenchmarkPhase,
  runCanvasBenchmarks,
  softGateFailures,
  writeBenchmarkArtifacts,
} from "./canvas_perf_harness.js";

const phase = resolveBenchmarkPhase();

describe("canvas performance benchmark", () => {
  it(
    `records ${phase.toUpperCase()} metrics for 1k / 5k / 20k and image-heavy documents`,
    () => {
      const result = runCanvasBenchmarks();
      const files = writeBenchmarkArtifacts(result, { phase });

      console.log(`\n${renderConsoleSummary(result)}\n`);

      expect(fs.existsSync(files.jsonPath)).toBe(true);
      expect(fs.existsSync(files.markdownPath)).toBe(true);
      expect(softGateFailures(result)).toEqual([]);
    },
    180000,
  );
});
