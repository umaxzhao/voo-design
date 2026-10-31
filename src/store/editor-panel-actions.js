/** Publish visibility atomically so Browser and Agent never share the side rail. */
export function sidePanelVisibility(panel, open) {
  if (panel !== "agent" && panel !== "browser") throw new Error("Unknown editor side panel");
  const activeKey = panel === "agent" ? "agentPanelOpen" : "browserDrawerOpen";
  const inactiveKey = panel === "agent" ? "browserDrawerOpen" : "agentPanelOpen";
  return open ? { [activeKey]: true, [inactiveKey]: false } : { [activeKey]: false };
}

/** UI, shortcut, legacy Agent aliases and queued requests share one operation. */
export function createEditorPanelActions(set) {
  const updatePanel = (panel, open, changes = {}) => set({ ...sidePanelVisibility(panel, Boolean(open)), ...changes });
  const openAgent = open => updatePanel("agent", open);
  return {
    setAgentPanelOpen: openAgent,
    setAgentOpen: openAgent,
    setBrowserDrawerOpen: open => updatePanel("browser", open),
    dispatchAgentIntent: ({ prompt = "", action = "custom", node = null } = {}) => {
      updatePanel("agent", true, {
        pendingAgentIntent: { prompt: (prompt || "").trim(), action, node, timestamp: Date.now() },
      });
    },
    dispatchToAgent: payload => {
      updatePanel("agent", true, {
        pendingAgentIntent: {
          prompt: (payload?.prompt || payload?.intent || "").trim(),
          action: payload?.tool || payload?.intent || "custom",
          node: payload?.context || null,
          timestamp: Date.now(),
        },
      });
    },
    clearPendingAgentIntent: () => set({ pendingAgentIntent: null }),
    setPendingGeneration: pendingGeneration => updatePanel("agent", pendingGeneration, { pendingGeneration }),
    clearPendingGeneration: () => set({ pendingGeneration: null }),
  };
}
