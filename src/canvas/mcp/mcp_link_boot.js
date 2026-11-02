import { NATIVE_AGENT_CLI_IDS } from "../../shared/cli_bridge_protocol.js";

/** localStorage switch: "on" always links the page, "off" never does. */
export const MCP_LINK_STORAGE_KEY = "voo.mcpLink";
/** Fired when the user asks for something that needs the loopback bridge. */
export const MCP_LINK_WANTED_EVENT = "voo:mcp-link-wanted";

const AGENT_PROVIDER_KEY = "voo.agent.llmProvider";

/**
 * External MCP clients that still need this page linked to the loopback
 * bridge. DeepSeek Harness is not a native CLI we spawn, but its VOO plugin
 * drives the canvas through the same bridge, so selecting it is an opt-in.
 */
const EXTERNAL_MCP_AGENT_IDS = Object.freeze(["deepseek-harness"]);

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Whether the user picked an agent that reaches the canvas through the local
 * bridge: a native CLI (Codex, Claude, ...) or an external MCP client with a
 * VOO plugin (DeepSeek Harness).
 */
function hasBridgeAgentSelected() {
  const stored = readStorage(AGENT_PROVIDER_KEY);
  if (!stored) return false;
  // Settings mirror values as JSON strings; tolerate a bare id as well.
  let provider = stored;
  try {
    provider = JSON.parse(stored);
  } catch {
    // bare id
  }
  return (
    NATIVE_AGENT_CLI_IDS.includes(provider) ||
    EXTERNAL_MCP_AGENT_IDS.includes(provider)
  );
}

/**
 * Desktop keeps the link on unless switched off. A plain browser would only
 * log a refused loopback connection, so it links after explicit opt-in:
 * the storage switch or a selected bridge-backed agent.
 */
export function isMcpLinkWanted({ desktop = Boolean(window.vooDesktop) } = {}) {
  const switchValue = readStorage(MCP_LINK_STORAGE_KEY);
  if (switchValue === "off") return false;
  if (desktop || switchValue === "on") return true;
  if (typeof window !== "undefined" && window.location) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("embed") || params.has("minimal")) return true;
    } catch {}
  }
  return hasBridgeAgentSelected();
}

let stopLink = null;

/** Starts the page link once; later calls are no-ops. */
export async function ensureCanvasMcpLink() {
  if (stopLink) return;
  stopLink = () => {};
  const { startCanvasMcpLink } = await import("./canvas_mcp_link.js");
  const { useDesignStore } = await import("../../store/design_store.js");
  stopLink = startCanvasMcpLink({
    getContext: () => ({ documentId: useDesignStore.getState().activeDocumentId }),
    subscribeContext: listener => useDesignStore.subscribe((state, previous) => {
      if (state.activeDocumentId !== previous.activeDocumentId) listener();
    }),
    executeTool: async (name, args) => {
      const { executeCanvasTool } = await import("../agent/canvas_tools.js");
      return executeCanvasTool(name, args);
    },
  });
  window.addEventListener("pagehide", stopLink, { once: true });
  if (import.meta.hot) import.meta.hot.dispose(stopLink);
}

/** Boot hook: link now when wanted, or later when a bridge-backed flow is opened. */
export function bootCanvasMcpLink() {
  if (isMcpLinkWanted()) {
    void ensureCanvasMcpLink();
    return;
  }
  window.addEventListener(
    MCP_LINK_WANTED_EVENT,
    () => {
      if (readStorage(MCP_LINK_STORAGE_KEY) !== "off") void ensureCanvasMcpLink();
    },
    { once: true },
  );
}
