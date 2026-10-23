import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ dispatchToAgent: vi.fn(), dispatchAgentIntent: vi.fn(), setAgentPanelOpen: vi.fn() }));
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: { getState: () => state } }));
import { dispatchToAgent } from "../../src/canvas/components/dispatch_to_agent.js";
describe("agent dispatch", () => {
  it("queues welcome generation once without also sending a prompt event", () => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("CustomEvent", class { constructor(type, options) { this.type = type; this.detail = options.detail; } });
    const payload = { prompt: "Generate a dashboard", intent: "generate", tool: "canvas_generate", context: { fromWelcomeDashboard: true }, autoSend: true };
    dispatchToAgent(payload);
    expect(state.dispatchToAgent).toHaveBeenCalledOnce();
    expect(state.dispatchToAgent).toHaveBeenCalledWith(payload);
    expect(state.dispatchAgentIntent).not.toHaveBeenCalled();
    expect(window.dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(["voo:agent-dispatch", "voo:open-agent-panel"]);
    vi.unstubAllGlobals();
  });
});
