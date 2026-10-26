import { describe, it, expect } from "vitest";
import { consumePendingGeneration } from "../../src/canvas/components/pending_agent_intent.js";

function fakeStore(initial) {
  const state = {
    pendingGeneration: initial,
    clearPendingGeneration: () => {
      state.pendingGeneration = null;
    },
  };
  return { getState: () => state, state };
}

describe("pending generation handoff", () => {
  it("claims the welcome intent exactly once", () => {
    const store = fakeStore({ prompt: "Make a landing page", kind: "landing" });
    const send = [];
    expect(consumePendingGeneration(store, (intent) => send.push(intent))).toBe(true);
    expect(send).toHaveLength(1);
    expect(send[0].kind).toBe("landing");
    expect(store.state.pendingGeneration).toBeNull();

    expect(consumePendingGeneration(store, (intent) => send.push(intent))).toBe(false);
    expect(send).toHaveLength(1);
  });

  it("ignores an empty intent", () => {
    const store = fakeStore({ prompt: "   " });
    const send = [];
    expect(consumePendingGeneration(store, (intent) => send.push(intent))).toBe(false);
    expect(send).toHaveLength(0);
  });

  it("ignores a missing intent", () => {
    const store = fakeStore(null);
    expect(consumePendingGeneration(store, () => {})).toBe(false);
  });

  it("does not consume the editor context intent", () => {
    const store = fakeStore(null);
    store.state.pendingAgentIntent = { prompt: "edit this layer", node: {} };
    expect(consumePendingGeneration(store, () => {})).toBe(false);
    expect(store.state.pendingAgentIntent).toBeTruthy();
  });
});
