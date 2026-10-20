/**
 * Thin facade composing the group-action sub-factories.
 *
 * Split from the original monolith along three seams — output-group
 * ownership/materialisation, the commit-bound grouped write pipeline, and
 * manual/auto-layout group shape — each in its own module under the 400-line
 * budget. This file stays the single public entry so importers (workflow_store,
 * tests) and the undo-action-contracts source metadata do not change.
 *
 * The (set, get) Zustand closure contract is preserved: cross-method calls
 * go through get(), so the merged actions behave identically to the original.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_group_actions
 */

import { createWorkflowGroupOutputActions } from "./workflow_group_output_actions.js";
import { createWorkflowGroupMutationActions } from "./workflow_group_mutation_actions.js";
import { createWorkflowGroupShapeActions } from "./workflow_group_shape_actions.js";

/** Grouping and ungrouping node actions. */
export function createWorkflowGroupActions(set, get) {
  return {
    ...createWorkflowGroupOutputActions(set, get),
    ...createWorkflowGroupMutationActions(set, get),
    ...createWorkflowGroupShapeActions(set, get),
  };
}
