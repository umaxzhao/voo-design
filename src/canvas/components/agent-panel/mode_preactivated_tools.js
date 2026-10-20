/**
 * Per-mode preactivation of deferred tools.
 *
 * Deferred tools are not sent to the LLM in every request; instead,
 * each goal mode declares which deferred tools it needs up front.
 * Everything else stays discoverable through tool_search.
 *
 * Editor command-table tools are derived from the editor command table so
 * new commands are preactivated
 * automatically — no hardcoded name lists to maintain.
 */

import { COMMAND_DEFINITIONS } from "../../editor/command_table.js";

/** Editor command-table tool names (auto-derived, not hardcoded). */
export const editorCommandToolNames = Object.values(COMMAND_DEFINITIONS)
  .filter((def) => def.exposeAsTool !== false)
  .map((def) => def.id);

/**
 * Deferred tools each goal mode depends on, activated up front.
 *
 * Design and image modes preactivate every editor command-table tool so
 * the model can paint, select, fill, stroke, etc. without a tool_search
 * step. Workflow modes keep the lighter footprint (layout + analysis).
 */
export const MODE_PREACTIVATED_TOOLS = {
  workflow: ["align_layout", "analyze_canvas"],
  image: ["critique_design", "inspect_selection", ...editorCommandToolNames],
  video: [],
  audio: [],
  design: [
    "generate_layout",
    "search_templates",
    "critique_design",
    "inspect_selection",
    "pick_version",
    ...editorCommandToolNames,
  ],
};
