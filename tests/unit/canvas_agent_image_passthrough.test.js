if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { describe, it, expect, vi } from "vitest";
import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";

describe("runAgentTurn image pass-back", () => {
  it("attaches a tool result's dataUrl as image content for the model", async () => {
    const messagesSeen = [];
    const streamStep = vi.fn(async ({ messages }) => {
      messagesSeen.push(messages.slice());
      if (streamStep.mock.calls.length === 1) {
        return {
          text: "capturing",
          toolCalls: [{ id: "call_1", name: "capture_canvas", arguments: "{}" }],
        };
      }
      return { text: "looks good", toolCalls: [] };
    });

    const result = await runAgentTurn({
      config: { apiKey: "k", baseUrl: "https://api.example.com", model: "m" },
      history: [],
      userText: "verify the canvas",
      tools: [],
      executeTool: vi.fn(async () => ({
        ok: true,
        dataUrl: "data:image/png;base64,CAPTURE",
        width: 1024,
        height: 512,
      })),
      streamStep,
    });

    expect(result).toBe("looks good");
    const afterTool = messagesSeen[1];
    const toolMessage = afterTool.find((m) => m.role === "tool");
    // The base64 payload stays out of the JSON tool message…
    expect(toolMessage.content).not.toContain("CAPTURE");
    expect(JSON.parse(toolMessage.content)).toMatchObject({ ok: true, imageAttached: true });

    // …and rides along as multimodal image content instead.
    const imageMessage = afterTool.at(-1);
    expect(imageMessage).toEqual({
      role: "user",
      content: [
        { type: "text", text: expect.stringContaining("capture_canvas") },
        { type: "image_url", image_url: { url: "data:image/png;base64,CAPTURE" } },
      ],
    });
  });

  it("keeps plain tool results as JSON-only messages", async () => {
    const messagesSeen = [];
    const streamStep = vi.fn(async ({ messages }) => {
      messagesSeen.push(messages.slice());
      if (streamStep.mock.calls.length === 1) {
        return {
          text: "",
          toolCalls: [{ id: "call_2", name: "rename_layer", arguments: "{}" }],
        };
      }
      return { text: "ok", toolCalls: [] };
    });

    await runAgentTurn({
      config: { apiKey: "k", baseUrl: "https://api.example.com", model: "m" },
      history: [],
      userText: "rename",
      tools: [],
      executeTool: vi.fn(async () => ({ ok: true })),
      streamStep,
    });

    const toolMessage = messagesSeen[1].find((m) => m.role === "tool");
    expect(JSON.parse(toolMessage.content)).toEqual({ ok: true });
    const imageUsers = messagesSeen[1].filter((m) => m.role === "user" && Array.isArray(m.content));
    expect(imageUsers).toHaveLength(0);
  });

  it("reports tool failures back to the model as before", async () => {
    const messagesSeen = [];
    const streamStep = vi.fn(async ({ messages }) => {
      messagesSeen.push(messages.slice());
      if (streamStep.mock.calls.length === 1) {
        return {
          text: "",
          toolCalls: [{ id: "call_3", name: "create_path", arguments: "{}" }],
        };
      }
      return { text: "handled", toolCalls: [] };
    });

    await runAgentTurn({
      config: { apiKey: "k", baseUrl: "https://api.example.com", model: "m" },
      history: [],
      userText: "draw",
      tools: [],
      executeTool: vi.fn(async () => {
        const error = new Error("agentInvalidArgs");
        error.code = "agentInvalidArgs";
        throw error;
      }),
      streamStep,
    });

    const toolMessage = messagesSeen[1].find((m) => m.role === "tool");
    expect(JSON.parse(toolMessage.content)).toEqual({ error: "agentInvalidArgs" });
  });
});
