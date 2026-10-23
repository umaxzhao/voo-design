import { useDesignStore } from "../../store/design_store.js";

/**
 * Dispatches agent requests to Zustand store and custom DOM events.
 */
export function dispatchToAgent({
  prompt = "",
  intent = "",
  tool = null,
  context = null,
  autoSend = true,
}) {
  const normalizedPrompt = (prompt || intent || "").trim();
  const normalizedIntent = (intent || prompt || "").trim();

  const payload = {
    prompt: normalizedPrompt,
    intent: normalizedIntent,
    tool: tool || null,
    context: context || null,
    autoSend,
  };

  let queued = false;

  // 1. Dispatch into Zustand store if available
  try {
    const store = useDesignStore?.getState?.();
    if (store?.dispatchToAgent) {
      store.dispatchToAgent(payload);
      queued = true;
    } else if (store?.dispatchAgentIntent) {
      store.dispatchAgentIntent({
        prompt: normalizedPrompt,
        action: payload.tool || payload.intent || "custom",
        node: payload.context,
      });
      queued = true;
    }
    if (store?.setAgentPanelOpen) {
      store.setAgentPanelOpen(true);
    }
    if (store?.setAgentOpen) {
      store.setAgentOpen(true);
    }
  } catch (_e) {
    // Graceful fallback for isolated test environments
  }

  // 2. Fire custom DOM events for maximum reliability
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("voo:agent-dispatch", { detail: payload })
    );
    window.dispatchEvent(
      new CustomEvent("voo:open-agent-panel", { detail: { context: payload.context } })
    );
    if (payload.prompt && !queued) {
      window.dispatchEvent(
        new CustomEvent("voo:agent-prompt", {
          detail: {
            prompt: payload.prompt,
            intent: payload.intent,
            tool: payload.tool,
            context: payload.context,
            autoSend,
          },
        })
      );
    }
  }

  return payload;
}

