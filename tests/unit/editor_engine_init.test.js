import { describe, expect, it, vi } from "vitest";
import { createEngineInitController } from "../../src/canvas/editor/editor_engine_init.js";
import { ensureFontLoaded } from "../../src/canvas/editor/font_loader.js";
import { measureText } from "../../src/canvas/editor/scene_renderer.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

vi.mock("../../src/canvas/editor/font_loader.js", () => ({
  ensureFontLoaded: vi.fn(),
}));
vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({
  ensureImagePyramid: vi.fn(),
  measureText: vi.fn((ctx, node) => ({ width: node.width, height: node.height })),
}));

describe("editor engine font loading", () => {
  it("re-measures at most once per family when setDoc re-queues cached promises", async () => {
    const loaded = Promise.resolve(true);
    ensureFontLoaded.mockReturnValue(loaded);
    let doc = {
      nodes: ["Inter", "Inter", "Roboto"].map((fontFamily, id) => ({
        id, kind: NODE_KIND.TEXT, fontFamily, text: "Hello", width: 40, height: 20,
      })),
    };
    let controller;
    const setDoc = vi.fn((next) => {
      doc = next;
      // Bound re-entry so a regression fails assertions instead of hanging.
      if (setDoc.mock.calls.length < 10) controller.queueFontLoads(next);
    });
    const requestRender = vi.fn();
    const notify = vi.fn();
    controller = createEngineInitController({
      ctx: {}, getDoc: () => doc, setDoc,
      isDisposed: () => false,
      getAppliedSnapshot: () => "clean", snapshotDoc: () => "clean",
      setAppliedSnapshot: vi.fn(), requestRender, notify,
    });

    controller.queueFontLoads(doc);
    controller.queueFontLoads(doc);
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    controller.queueFontLoads(doc);
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();

    expect(ensureFontLoaded.mock.calls).toEqual([["Inter"], ["Roboto"]]);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(measureText).toHaveBeenCalledTimes(6);
    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
