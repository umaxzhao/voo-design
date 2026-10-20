/**
 * Tool: layer_via_copy — Lift the current pixel selection onto its own layer.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("layer_via_copy", {
  presentCall: () => ({
    title: "Copy selection to its own layer",
    icon: "copy",
  }),
});
