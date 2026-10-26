import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/canvas/agent/html_pipeline/pipeline.js", () => ({
  shouldUseHtmlPipeline: () => true,
  runHtmlPipeline: vi.fn(async ({ frame, chooseDirection }) => {
    const choices = [{ id: "a" }, { id: "b" }];
    const choice = chooseDirection ? await chooseDirection(choices, {}) : "auto";
    return {
      html: "<html></html>",
      directionId: choice,
      frameId: `frame-${frame.x}`,
      nodeCount: 3,
      trace: [],
    };
  }),
}));

import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";
import { runHtmlPipeline } from "../../src/canvas/agent/html_pipeline/pipeline.js";

function installEditor() {
  const doc = { width: 1440, height: 900, nodes: [] };
  globalThis.window = globalThis.window ?? {};
  globalThis.window.__vooEditor = {
    getDocument: () => doc,
    getDoc: () => doc,
    beginBatch: () => {},
    endBatch: () => {},
    commit: () => {},
    serialise: () => "doc",
  };
  return doc;
}

describe("agent variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installEditor();
  });
  afterEach(() => {
    delete globalThis.window.__vooEditor;
  });

  it("runs the HTML pipeline once per variant with an offset frame", async () => {
    const onVariant = vi.fn();
    const reply = await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "做一个精品咖啡 landing page",
      tools: [],
      executeTool: vi.fn(),
      streamStep: vi.fn(),
      variantCount: 3,
      frame: { x: 0, y: 0, width: 1440, height: 900 },
      chooseDirection: (choices, { variantIndex = 0 } = {}) =>
        Promise.resolve(choices[variantIndex % choices.length].id),
      onVariant,
    });
    expect(runHtmlPipeline).toHaveBeenCalledTimes(3);
    const frames = runHtmlPipeline.mock.calls.map(([options]) => options.frame);
    expect(frames.map((frame) => frame.x)).toEqual([0, 1520, 3040]);
    expect(frames.every((frame) => frame.width === 1440 && frame.height === 900)).toBe(true);
    expect(onVariant).toHaveBeenCalledTimes(3);
    expect(onVariant.mock.calls.map(([variant]) => variant.frameId)).toEqual([
      "frame-0",
      "frame-1520",
      "frame-3040",
    ]);
    expect(reply).toContain("3 variants");
  });

  it("keeps the single-page reply for one variant", async () => {
    const reply = await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "做一个落地页",
      tools: [],
      executeTool: vi.fn(),
      streamStep: vi.fn(),
      variantCount: 1,
      frame: { x: 0, y: 0, width: 1440, height: 900 },
    });
    expect(runHtmlPipeline).toHaveBeenCalledTimes(1);
    expect(reply).toContain("Created page with 3 editable layers");
  });

  it("clamps the variant count to four", async () => {
    await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "做一个落地页",
      tools: [],
      executeTool: vi.fn(),
      streamStep: vi.fn(),
      variantCount: 99,
      frame: { x: 0, y: 0, width: 1440, height: 900 },
    });
    expect(runHtmlPipeline).toHaveBeenCalledTimes(4);
  });
});
