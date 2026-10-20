/**
 * Tool: inspect_selection — inspect what is selected inside the open image
 * editor (layers/objects) and whether a pixel selection exists.
 *
 * Runs only when the design editor is open (an imageAsset node is being
 * edited). Returns the selected layer objects with name/type plus the pixel
 * selection state, so the agent can target edits precisely.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("get_selection", {
  name: "inspect_selection",
  bridgeTool: "get_selection",
  capabilities: {
    mutates: false,
    externalData: false,
    estimatedCost: 0,
    idempotent: true,
    reversible: null,
    timeout: 5000,
  },
  presentCall() {
    return { title: "Inspect editor selection", icon: "layers" };
  },
  presentResult(_args, result) {
    return {
      title: `${result.objectCount} layer(s) selected`,
      status: "completed",
    };
  },
});
