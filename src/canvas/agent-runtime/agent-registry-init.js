/**
 * Registry initialization for the agent loop: lazily build the default tool
 * registry, keep its pricing table fresh, and maintain the active tool set
 * (direct tools plus the mode's preactivated deferred tools).
 *
 * Extracted from useAgentLoop (AO3c). React-free.
 *
 * @module agent-runtime/agent-registry-init
 */

import { createDefaultRegistry } from "../components/agent-panel/toolRegistry.js";

export async function ensureAgentRegistry({
  registryRef,
  pricingTableRef,
  activeToolNamesRef,
  preactivateTools,
}) {
  if (!registryRef.current) {
    registryRef.current = await createDefaultRegistry();
  }
  if (pricingTableRef.current && registryRef.current?.setPricingTable) {
    registryRef.current.setPricingTable(pricingTableRef.current);
  }
  // Active tools start as the direct set; tool_search adds deferred ones.
  // reset()/setSessionState() null this — the next turn must re-init, or
  // getSchemasFor(null) crashes the turn with "X is not iterable".
  if (!activeToolNamesRef.current) {
    activeToolNamesRef.current = registryRef.current.getDirectToolNames();
  }
  // The mode's own tools join the active set every turn, not just the first:
  // switching modes mid-session must bring the new mode's pipeline along.
  for (const name of preactivateTools ?? []) {
    if (
      registryRef.current.get(name) &&
      !activeToolNamesRef.current.includes(name)
    ) {
      activeToolNamesRef.current.push(name);
    }
  }
  return registryRef.current;
}
