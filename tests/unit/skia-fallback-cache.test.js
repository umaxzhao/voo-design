import { expect, it } from "vitest";
import { requiresCanvas2dMediaFallback } from "../../src/canvas/editor/skia_scene_adapter.js";
it("reuses immutable routing checks and rechecks edited nodes and frame ancestry", () => {
  let reads = 0;
  const node = {
    id: "shape",
    kind: "rect",
    get effects() {
      reads++;
      return null;
    }
  };
  const doc = {
    nodes: [node]
  };
  expect(requiresCanvas2dMediaFallback(doc)).toBe(false);
  const checked = reads;
  expect(checked).toBeGreaterThan(0);
  expect(requiresCanvas2dMediaFallback(doc)).toBe(false);
  expect(requiresCanvas2dMediaFallback({
    nodes: [node]
  })).toBe(false);
  expect(reads).toBe(checked);
  const styled = {
    ...node,
    effects: {
      shadow: {
        enabled: true
      }
    }
  };
  expect(requiresCanvas2dMediaFallback({
    nodes: [styled]
  })).toBe(true);
  const child = {
    id: "child",
    kind: "rect",
    parentId: "frame"
  };
  expect(requiresCanvas2dMediaFallback({
    nodes: [child]
  })).toBe(false);
  expect(requiresCanvas2dMediaFallback({
    nodes: [child, {
      id: "frame",
      kind: "group",
      isFrame: true
    }]
  })).toBe(true);
});
