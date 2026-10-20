/**
 * Standing-brief capture for a bound Agent Gen session.
 *
 * The brief is what "Run" feeds to the headless Agent turn, so a user who only
 * ever talks to the node must still end up with one. The first message in a
 * bound session becomes the brief; later messages never overwrite it (the user
 * or the model can still edit it deliberately).
 *
 * Pure logic — no React, no store import.
 */

import { NODE_TYPE } from "../../nodes/node_enums.js";

/**
 * @param {Object} store - Workflow store state (has `nodes` + `updateNodeData`).
 * @param {string|null} agentNodeId - The bound Agent Gen node, or null.
 * @param {string} text - The user's message text.
 * @returns {boolean} true when the brief was written.
 */
export function captureAgentBrief(store, agentNodeId, text) {
  if (!agentNodeId) return false;
  const agent = (store?.nodes ?? []).find(
    (node) => node.id === agentNodeId && node.type === NODE_TYPE.AGENT,
  );
  if (!agent) return false;
  if (String(agent.data?.brief ?? "").trim()) return false;
  const brief = String(text ?? "").trim();
  if (!brief) return false;
  if (typeof store.updateNodeData !== "function") return false;
  store.updateNodeData(agentNodeId, { brief });
  return true;
}
