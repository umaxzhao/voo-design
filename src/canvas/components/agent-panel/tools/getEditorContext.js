/**
 * Tool: get_editor_context — read the open design editor's current context.
 *
 * A read-only "head of the loop" inquiry: which layer kinds are on the page,
 * which objects are selected (with their kind and pen flag), whether a pixel
 * selection exists, and which editor actions are available right now. Call
 * this before issuing an editor command so the selection-driven Agent UI
 * (free generation / object repaint / selection repaint) can pick the right
 * action. Unlike inspect_selection (which reads get_selection only), this
 * returns the actions the model is allowed to take for the current state.
 *
 * Interaction path note: the command itself is unit-tested (pure + mock
 * engine). Its use by the selection-driven agent input switching is an
 * editor-UI path that needs manual/browser verification (build:canvas +
 * Chrome), per the repo's interaction contract.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("get_editor_context", {
  presentCall() {
    return { title: "Read editor context", icon: "inspect" };
  },
});
