import { describe, it, expect, vi } from "vitest";
import { consumePendingAgentIntent } from "../../src/canvas/components/pending_agent_intent.js";
describe("pending agent intent", () => {
  it("consumes a queued mount intent once with its node context", () => {
    const node = { nodeId: "canvas" };
    const state = { pendingAgentIntent: { prompt: "Generate UI", node }, clearPendingAgentIntent: () => { state.pendingAgentIntent = null; } };
    const store = { getState: () => state };
    const send = vi.fn(() => expect(state.pendingAgentIntent).toBeNull());
    expect(consumePendingAgentIntent(store, send)).toBe(true);
    expect(consumePendingAgentIntent(store, send)).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("Generate UI", node);
    state.pendingAgentIntent = { prompt: "  " };
    expect(consumePendingAgentIntent(store, send)).toBe(false);
  });
});
