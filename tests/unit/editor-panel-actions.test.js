import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDesignStore } from "../../src/store/design_store.js";

const initial = useDesignStore.getState();
const reset = () => useDesignStore.setState({ agentPanelOpen: false, browserDrawerOpen: false, pendingGeneration: null, pendingAgentIntent: null });
beforeEach(reset);
afterEach(() => useDesignStore.setState({ agentPanelOpen: initial.agentPanelOpen, browserDrawerOpen: initial.browserDrawerOpen,
  pendingGeneration: initial.pendingGeneration, pendingAgentIntent: initial.pendingAgentIntent }));

describe("exclusive browser and Agent panels", () => {
  it("opens Browser and closes Agent in a single state publication", () => {
    useDesignStore.getState().setAgentPanelOpen(true);
    const observed = [];
    const unsubscribe = useDesignStore.subscribe(state => observed.push([state.agentPanelOpen, state.browserDrawerOpen]));
    useDesignStore.getState().setBrowserDrawerOpen(true);
    unsubscribe();
    expect(observed).toEqual([[false, true]]);
  });
  it.each(["setAgentPanelOpen", "setAgentOpen"])("%s closes Browser when opening Agent", action => {
    const store = useDesignStore.getState();
    store.setBrowserDrawerOpen(true);
    store[action](true);
    expect(useDesignStore.getState()).toMatchObject({ agentPanelOpen: true, browserDrawerOpen: false });
    store.setBrowserDrawerOpen(false);
    expect(useDesignStore.getState().agentPanelOpen).toBe(true);
  });
  it.each(["dispatchAgentIntent", "dispatchToAgent"])("%s also owns panel exclusivity and preserves the request", action => {
    const store = useDesignStore.getState();
    store.setBrowserDrawerOpen(true);
    store[action]({ prompt: "  Inspect selection  ", action: "inspect", node: { id: "node" } });
    expect(useDesignStore.getState()).toMatchObject({ agentPanelOpen: true, browserDrawerOpen: false,
      pendingAgentIntent: { prompt: "Inspect selection" } });
  });
  it("queued generation closes Browser and clearing it never reopens a panel", () => {
    const intent = { id: "fixture-generation", prompt: "Create a poster" };
    const store = useDesignStore.getState();
    store.setBrowserDrawerOpen(true);
    store.setPendingGeneration(intent);
    expect(useDesignStore.getState()).toMatchObject({ agentPanelOpen: true, browserDrawerOpen: false, pendingGeneration: intent });
    store.setBrowserDrawerOpen(true);
    store.setPendingGeneration(null);
    expect(useDesignStore.getState()).toMatchObject({ agentPanelOpen: false, browserDrawerOpen: true });
  });
  it("closing either panel does not reopen the other or discard queued work", () => {
    const store = useDesignStore.getState();
    store.dispatchAgentIntent({ prompt: "Keep my request" });
    store.setBrowserDrawerOpen(true);
    store.setAgentPanelOpen(false);
    expect(useDesignStore.getState()).toMatchObject({ agentPanelOpen: false, browserDrawerOpen: true,
      pendingAgentIntent: { prompt: "Keep my request" } });
    store.setBrowserDrawerOpen(false);
    expect(useDesignStore.getState()).toMatchObject({ agentPanelOpen: false, browserDrawerOpen: false });
  });
});
