import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/canvas/agent/html_pipeline/pipeline.js", () => ({
  shouldUseHtmlPipeline: ({ userText }) => !/refine|edit/i.test(String(userText)),
  runHtmlPipeline: vi.fn(async ({ frame }) => ({
    html: "<html></html>",
    directionId: "axiom-direction",
    frameId: `frame-${frame.x}`,
    nodeCount: 4,
    trace: [],
  })),
}));

import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";
import { runHtmlPipeline } from "../../src/canvas/agent/html_pipeline/pipeline.js";
import { DESIGN_SYSTEMS } from "../../src/canvas/design_systems.js";
import { fromDesignSystemPreset } from "../../src/canvas/agent/design_system/from-preset.js";

const CONTRACT = fromDesignSystemPreset(DESIGN_SYSTEMS.axiom, { locale: "en", name: "AXIOM" });

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
}

describe("agent design-system wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installEditor();
  });
  afterEach(() => {
    delete globalThis.window.__vooEditor;
  });

  it("forwards the welcome-screen contract to the HTML pipeline", async () => {
    await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "做一个前卫科技落地页",
      tools: [],
      executeTool: vi.fn(),
      streamStep: vi.fn(),
      frame: { x: 0, y: 0, width: 1440, height: 900 },
      designSystem: CONTRACT,
      variantCount: 1,
    });
    expect(runHtmlPipeline).toHaveBeenCalledTimes(1);
    expect(runHtmlPipeline.mock.calls[0][0].designSystem).toBe(CONTRACT);
  });

  it("injects the contract into the tool-loop system prompt", async () => {
    const streamStep = vi.fn(async () => ({ text: "Done", toolCalls: [] }));
    await runAgentTurn({
      config: { model: "gpt-5" },
      history: [],
      userText: "refine the existing layout",
      tools: [],
      executeTool: vi.fn(),
      streamStep,
      designSystem: CONTRACT,
    });
    // quality-off would skip the block; force a normal turn and inspect messages.
    const system = streamStep.mock.calls[0][0].messages[0].content;
    expect(system).toContain("AXIOM");
    expect(system).toContain("hairline grid");
  });
});
