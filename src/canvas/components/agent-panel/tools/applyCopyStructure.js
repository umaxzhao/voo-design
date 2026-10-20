/**
 * Tool: apply_copy_structure — land a structured copy hierarchy as text nodes.
 *
 * The design-editor text-layout channel: takes a copy structure (an array of
 * text blocks, or { blocks: [...] }) from the model and stacks it as editable
 * text nodes into the open design editor — the programmatic counterpart to
 * generate_layout's HTML stream. Each block can carry its own
 * fontSize/fontFamily/weight/fill/align/letterSpacing/lineHeight/width so the
 * agent can produce typographic structure for text objects.
 *
 * Interaction path note: the dispatch + engine op are covered by unit tests;
 * the on-canvas interaction (styled text nodes appearing and being edited)
 * needs manual/browser verification (build:canvas + Chrome), per the repo's
 * interaction contract.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("apply_copy_structure", {
  presentCall() {
    return { title: "Apply copy structure", icon: "type" };
  },
  presentResult(_args, result) {
    if (!result) return { title: "apply_copy_structure" };
    if (Number.isFinite(result.objectCount)) {
      return {
        title: `${result.objectCount} text object${result.objectCount === 1 ? "" : "s"}`,
        status: "completed",
      };
    }
    const count = Array.isArray(result.nodes) ? result.nodes.length : 0;
    return {
      title: `${count} text object${count === 1 ? "" : "s"}`,
      status: "completed",
    };
  },
});
