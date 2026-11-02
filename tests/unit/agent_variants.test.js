import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/canvas/agent/html_pipeline/pipeline.js", () => ({
  shouldUseHtmlPipeline: ({ enabled = true } = {}) => enabled,
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

  it("reuses one generated visual reference across all variants", async () => {
    const reference = [{ name: "Visual reference", dataUrl: "data:image/png;base64,AAAA" }];
    runHtmlPipeline.mockImplementationOnce(async ({ frame }) => ({
      html: "<html></html>", directionId: "a", frameId: `frame-${frame.x}`,
      nodeCount: 3, trace: [], visualReferences: reference,
    }));
    await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "做一个音乐海报",
      tools: [],
      executeTool: vi.fn(),
      streamStep: vi.fn(),
      variantCount: 2,
      frame: { x: 0, y: 0, width: 600, height: 900 },
    });

    expect(runHtmlPipeline.mock.calls[0][0].visualReferences).toEqual([]);
    expect(runHtmlPipeline.mock.calls[1][0].visualReferences).toEqual(reference);
  });

  it("passes user-provided reference images to the non-HTML agent path", async () => {
    const reference = { name: "guide.png", dataUrl: "data:image/png;base64,AAAA" };
    const streamStep = vi.fn().mockResolvedValue({ text: "Done", toolCalls: [] });
    await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "Use this reference to create a screen",
      tools: [],
      executeTool: vi.fn(),
      streamStep,
      htmlPipeline: false,
      visualReferences: [reference],
    });

    expect(streamStep.mock.calls[0][0].messages.at(-1).content).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("Use this reference") }),
      { type: "image_url", image_url: { url: reference.dataUrl } },
    ]);
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
