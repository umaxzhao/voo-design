// Public facade for layout generation, parsing, and reference-image actions.
import { createLayoutParsingActions } from "./layout_action_parsing.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";
import { RUN_STATUS } from "../nodes/node_enums.js";
import { t } from "../../shared/i18n.js";
import {
  StreamingLayoutFilter,
  ensureRemoteImagePermission,
} from "./layout_action_helpers.js";

export { StreamingLayoutFilter, ensureRemoteImagePermission };

/**
 * Design-node layout actions, spread into the workflow store.
 *
 * Keep this facade stable: workflow store and editor consumers import the
 * public action factory and streaming filter from this module.
 */
export function createLayoutActions(set, get) {
  let generationActions;
  return {
    async generateLayout(nodeId, ...args) {
      const initial = get();
      if (isWorkflowReadOnly(initial)) return false;
      const target = initial.nodes.find((node) => node.id === nodeId);
      if (!target || target.data?.status === RUN_STATUS.RUNNING) return false;
      const { workflowId, workflowHistories } = initial;
      // Reopening A after visiting B retains its ID but replaces its history
      // owner. A pending import must not start a request in that new session.
      const isCurrent = () => {
        const state = get();
        return (
          state.workflowId === workflowId &&
          state.workflowHistories === workflowHistories &&
          !isWorkflowReadOnly(state) &&
          state.nodes.some((node) => node.id === nodeId)
        );
      };
      const superseded = () =>
        Object.assign(new Error(t("error.layoutRequestSuperseded")), {
          code: "OPERATION_ABORTED",
        });
      // Workflow startup needs the action contract, not the generation pipeline.
      // Keep the factory scoped to this store while sharing the module import.
      try {
        const { createLayoutGenerationActions } =
          await import("./layout_action_generation.js");
        if (!isCurrent()) throw superseded();
        generationActions ??= createLayoutGenerationActions(set, get);
      } catch (error) {
        if (!isCurrent()) throw superseded();
        console.error("[layout] generation module failed to load", error);
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: {
            code: "layoutModuleLoad",
            message: t("error.layoutModuleLoad"),
          },
        });
        return false;
      }
      return generationActions.generateLayout(nodeId, ...args);
    },
    ...createLayoutParsingActions(set, get),
  };
}
