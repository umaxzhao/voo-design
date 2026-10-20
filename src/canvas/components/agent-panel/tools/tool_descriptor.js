/**
 * Shared tool descriptor layer for canvas/workflow tools.
 *
 * This is intentionally NOT the editor command table. Editor commands carry
 * editor semantics (undoable, historyLabel, error-code set, engine executor);
 * canvas/workflow tools operate on the node graph and only need an
 * agent-facing declaration: name, description, JSON Schema, approval level,
 * declarative requires, and capabilities.
 *
 * Boundary:
 * - Shared here: the schema/description/approval/requires/capabilities that
 *   every agent tool needs.
 * - Kept in each tool file: `execute` implementation and UI presenters.
 * - Kept in `command_table.js` only: editor command/undo semantics.
 *
 * Definitions are split by domain under ./tool_descriptor/ and merged here so
 * consumers keep importing this single module path.
 */

import { WORKFLOW_GRAPH_TOOL_DEFINITIONS } from "./tool_descriptor/workflow_graph.js";
import { CONTENT_GENERATION_TOOL_DEFINITIONS } from "./tool_descriptor/content_generation.js";
import { DESIGN_ASSET_MOUNT_TOOL_DEFINITION } from "./tool_descriptor/design_asset_mount.js";
import { DESIGN_SCENE_TOOL_DEFINITIONS } from "./tool_descriptor/design_scene.js";
import { PRESENTATION_TOOL_DEFINITIONS } from "./tool_descriptor/presentation.js";
import { IMAGE_LAYER_EDIT_TOOL_DEFINITION } from "./tool_descriptor/image_layer_edit.js";

export { CREATE_NODE_TYPES } from "./tool_descriptor/constants.js";

/** Canvas/workflow tool descriptors shared by the agent tool registry. */
export const WORKFLOW_TOOL_DEFINITIONS = {
  ...WORKFLOW_GRAPH_TOOL_DEFINITIONS,
  ...CONTENT_GENERATION_TOOL_DEFINITIONS,
  ...DESIGN_ASSET_MOUNT_TOOL_DEFINITION,
  ...DESIGN_SCENE_TOOL_DEFINITIONS,
  ...PRESENTATION_TOOL_DEFINITIONS,
  ...IMAGE_LAYER_EDIT_TOOL_DEFINITION,
};

export function getWorkflowToolDefinition(name) {
  return WORKFLOW_TOOL_DEFINITIONS[name] ?? null;
}

/**
 * Builds an agent tool handler from a descriptor plus tool-specific execute
 * and UI presenters. The returned shape matches the existing ToolRegistry
 * contract so migrated tools drop straight into the registry.
 */
export function createToolFromDescriptor(
  def,
  { execute, presentCall, presentResult },
) {
  if (!def) throw new Error("Missing workflow tool descriptor");
  return {
    spec: {
      name: def.name,
      description: def.description,
      parameters: def.params,
    },
    approvalLevel: def.approvalLevel,
    requires: def.requires,
    ...(def.capabilities ? { capabilities: def.capabilities } : {}),
    execute,
    presentCall,
    presentResult,
  };
}
