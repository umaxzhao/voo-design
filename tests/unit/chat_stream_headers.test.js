import { describe, it, expect } from "vitest";
import { buildChatHeaders } from "../../src/canvas/agent/chat_stream.js";

describe("buildChatHeaders", () => {
  it("adds the Anthropic browser opt-in only for the Anthropic host", () => {
    const anthropic = buildChatHeaders({ apiKey: "k", baseUrl: "https://api.anthropic.com/v1", model: "m" });
    expect(anthropic["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(anthropic.Authorization).toBe("Bearer k");
  });

  it("does not add the Anthropic header for OpenAI or Gemini", () => {
    const openai = buildChatHeaders({ apiKey: "k", baseUrl: "https://api.openai.com/v1", model: "m" });
    const gemini = buildChatHeaders({
      apiKey: "k",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "m",
    });
    expect(openai["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
    expect(gemini["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
  });
});
