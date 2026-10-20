/**
 * Workflow and node execution engine facade.
 *
 * Re-exports:
 *  - RunError & TEXT_EDIT_CONTRACT from ./executor_errors.js
 *  - runTextNode from ./executor_text_node.js
 *  - runWorkflow from ./executor_workflow.js
 */

export { RunError, TEXT_EDIT_CONTRACT } from "./executor_errors.js";
export { runTextNode } from "./executor_text_node.js";
export { runWorkflow } from "./executor_workflow.js";
