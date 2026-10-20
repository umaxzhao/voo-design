/**
 * Single commit-bound grouped write pipeline for Group output state.
 *
 * All entry points (generation, editor AI adapter, agent tools, manual drag)
 * normalise to applyGroupMutation before touching Group data. One history
 * entry per mutating call; no-op when the state does not change.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_group_mutation_actions
 */

import { NODE_TYPE, ensureValidParentNodes } from "../nodes/types.js";
import {
  applyCandidateRemoval,
  applyOutputBatch,
  applySelectionChange,
} from "../nodes/output_group_schema.js";
import { commitWorkflowHistory } from "../undo-action-contracts.js";
import { scheduleSave } from "./persistence.js";
import { addNodesToGroup } from "./workflow_group_membership.js";
import { reflowAutoLayoutGroups } from "./workflow_group_reflow.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/**
 * The one commit boundary for workflow-level commands. Computes the full next
 * state first, only pushes history when the state actually changes, then does
 * one set() and one scheduleSave().
 */
function commitWorkflowCommand({
  reduce,
  get,
  set,
  commitHistory,
  scheduleSaveAction,
}) {
  if (isWorkflowReadOnly(get())) return null;
  const next = reduce();
  if (!next) return null;
  commitHistory();
  set(next);
  scheduleSaveAction(get);
  return next;
}

export function createWorkflowGroupMutationActions(set, get) {
  return {
    /**
     * The single grouped write pipeline for Group output state. All entry
     * points (generation, editor AI adapter, agent tools, manual drag) must
     * normalise to this command before touching Group data.
     */
    applyGroupMutation(command) {
      const {
        groupId,
        outputBatch,
        outputBatches,
        addedEdges = [],
        selectionChange,
        candidateRemoval,
        additions,
        newGroup,
        foldSourceNodeId,
      } = command ?? {};
      const nodes = get().nodes;
      const edges = get().edges;
      let group = nodes.find(
        (node) => node.id === groupId && node.type === NODE_TYPE.GROUP,
      );
      if (
        !group &&
        newGroup &&
        newGroup.id === groupId &&
        newGroup.type === NODE_TYPE.GROUP
      ) {
        // A freshly-minted output Group that has not been committed yet.
        group = newGroup;
      }
      if (!group) throw new Error(`Group not found: ${groupId}`);

      const batches = outputBatches ?? (outputBatch ? [outputBatch] : null);
      if (batches) {
        if (!Array.isArray(batches) || batches.length === 0) {
          throw new Error(
            "applyGroupMutation requires at least one output batch",
          );
        }
        return commitWorkflowCommand({
          get,
          set,
          commitHistory: () =>
            commitWorkflowHistory(get, "workflow.group.outputBatch"),
          scheduleSaveAction: scheduleSave,
          reduce: () => {
            let workingNodes = nodes;
            let workingGroup = group;
            // Include the freshly-created Group and fold the source node into
            // it, all inside this single atomic commit.
            if (newGroup && !nodes.some((node) => node.id === newGroup.id)) {
              workingGroup = newGroup;
              workingNodes = [...nodes, newGroup];
              if (foldSourceNodeId) {
                workingNodes =
                  addNodesToGroup({
                    nodes: workingNodes,
                    groupId: newGroup.id,
                    nodeIds: [foldSourceNodeId],
                  }) ?? workingNodes;
                workingGroup = workingNodes.find(
                  (node) => node.id === newGroup.id,
                );
              }
            }
            for (const batch of batches) {
              const result = applyOutputBatch({
                group: workingGroup,
                nodes: workingNodes,
                ...batch,
              });
              workingNodes = result.nodes;
              workingGroup = result.group;
            }
            return {
              nodes: reflowAutoLayoutGroups(
                ensureValidParentNodes(workingNodes),
                [groupId],
              ),
              ...(addedEdges.length > 0
                ? { edges: [...edges, ...addedEdges] }
                : {}),
            };
          },
        });
      }

      if (additions) {
        if (!Array.isArray(additions) || additions.length === 0) {
          throw new Error("applyGroupMutation requires at least one addition");
        }
        const nodeIds = additions.map((addition) => {
          if (!addition?.existingNodeId) {
            throw new Error("Group addition requires existingNodeId");
          }
          return addition.existingNodeId;
        });
        return commitWorkflowCommand({
          get,
          set,
          commitHistory: () =>
            commitWorkflowHistory(get, "workflow.group.connectMember"),
          scheduleSaveAction: scheduleSave,
          reduce: () => {
            const nextNodes = addNodesToGroup({ nodes, groupId, nodeIds });
            if (!nextNodes && addedEdges.length === 0) return null;
            return {
              nodes: reflowAutoLayoutGroups(nextNodes ?? nodes, [groupId]),
              ...(addedEdges.length > 0
                ? { edges: [...edges, ...addedEdges] }
                : {}),
            };
          },
        });
      }

      if (selectionChange) {
        return commitWorkflowCommand({
          get,
          set,
          commitHistory: () =>
            commitWorkflowHistory(get, "workflow.group.selectCandidate"),
          scheduleSaveAction: scheduleSave,
          reduce: () => {
            const result = applySelectionChange({
              group,
              nodes,
              ...selectionChange,
            });
            if (!result) return null;
            return {
              nodes: ensureValidParentNodes(
                nodes.map((node) =>
                  node.id === group.id ? result.group : node,
                ),
              ),
            };
          },
        });
      }

      if (candidateRemoval) {
        return commitWorkflowCommand({
          get,
          set,
          commitHistory: () =>
            commitWorkflowHistory(get, "workflow.group.deleteCandidate"),
          scheduleSaveAction: scheduleSave,
          reduce: () => {
            const result = applyCandidateRemoval({
              group,
              nodes,
              ...candidateRemoval,
            });
            return result
              ? {
                  nodes: reflowAutoLayoutGroups(
                    ensureValidParentNodes(result.nodes),
                    [groupId],
                  ),
                }
              : null;
          },
        });
      }

      throw new Error(
        "applyGroupMutation requires outputBatch(es), additions, selectionChange or candidateRemoval",
      );
    },
  };
}
