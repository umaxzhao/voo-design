import { EDITOR_KIND, resolveEditorKind } from "../../nodes/editor_routing.js";

const WORKFLOW_AGENT_MODE_IDS = new Set([
  "workflow",
  "image",
  "video",
  "audio",
  "design",
]);

/**
 * Workflow and Design Editor share the same mode list and conversation.
 * A caller can still request a narrow list for a dedicated editor surface.
 */
export function getAgentModesForContext(modes, lockedMode = null) {
  if (!Array.isArray(modes)) {
    throw new TypeError("Agent modes must be an array.");
  }

  if (lockedMode) {
    return modes.filter((mode) => mode.id === lockedMode);
  }

  return modes.filter((mode) => WORKFLOW_AGENT_MODE_IDS.has(mode.id));
}

/**
 * Resolve the fixed agent used by the editor currently covering the canvas.
 *
 * The mode follows the editor the node type actually opens (editor_routing),
 * not the node's family: the Design editor runs the design agent, and a node
 * that opens no editor locks nothing.
 */
export function resolveEditorAgentMode(editingNode) {
  if (!editingNode) return null;
  return resolveEditorKind(editingNode.type, editingNode) === EDITOR_KIND.DESIGN
    ? "design"
    : null;
}

/** Entering an editor only suggests its mode while the conversation is idle. */
export function modeOnEditorEntry(currentMode, preferredMode, isRunning) {
  return preferredMode && !isRunning && currentMode === "workflow"
    ? preferredMode
    : currentMode;
}
