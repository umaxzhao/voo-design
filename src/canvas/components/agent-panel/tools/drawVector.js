/**
 * Tool: draw_vector — draw a vector (pen) object in the open design editor.
 *
 * The design-editor pen-AI channel: asks the editor engine to add a pen
 * (bezier path) node from an SVG path string (M/L/C/Z) or an explicit anchors
 * array. This is the agent-side entry point corresponding to the
 * `add_pen_node` editor command. The engine parses the path and lands it as a
 * manipulable vector node; the bridge surfaces any structured reason
 * (ARGS_INVALID, EDITOR_NOT_OPEN, ...) as the receipt.
 *
 * Interaction path note: the dispatch + engine op are covered by unit tests;
 * the on-canvas interaction (the drawn vector being manipulated) needs
 * manual/browser verification (build:canvas + Chrome), per the repo's
 * interaction contract.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("add_pen_node", {
  name: "draw_vector",
  bridgeTool: "add_pen_node",
  presentCall(args) {
    const kind = args.svgD
      ? "svg path"
      : args.anchors
        ? "anchors"
        : args.prompt
          ? "prompt"
          : "path";
    return { title: `Draw vector (${kind})`, icon: "pen-tool" };
  },
  presentResult(_args, result) {
    if (!result) return { title: "draw_vector" };
    const summary = result.nodeId
      ? `node ${String(result.nodeId).slice(0, 8)}…`
      : result.ok
        ? "ok"
        : "";
    return { title: `Drew vector${summary ? ` — ${summary}` : ""}` };
  },
});
