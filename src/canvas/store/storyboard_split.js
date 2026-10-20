import { RunError } from "../engine/executor.js";
import { RUN_STATUS } from "../nodes/types.js";
import { isInSidePanel } from "../rpc.js";
import { createAsyncFinalCommit } from "./async-final-commit.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/**
 * Splits a storyboard's upstream story into shots, replacing its shot list.
 * Async-final like a text node: one undo restores the previous shot list.
 */
export async function generateStoryboardShots(get, nodeId) {
  if (isWorkflowReadOnly(get())) return;
  const node = get().nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.data.status === RUN_STATUS.RUNNING) return;
  const finalCommit = createAsyncFinalCommit(
    get,
    "workflow.async.storyboardSplit",
  );

  get().updateNodeData(nodeId, {
    status: RUN_STATUS.RUNNING,
    stage: "storyboardSplitting",
    error: null,
  });

  try {
    const { requestStoryboardSplit } =
      await import("../engine/storyboard_run.js");
    const shots = await requestStoryboardSplit({
      nodeId,
      getGraph: () => ({ nodes: get().nodes, edges: get().edges }),
      settings: get().settings,
      context: {
        inSidePanel: isInSidePanel(),
        hostPlatform: get().platform.id,
      },
    });
    const current = get().nodes.find((candidate) => candidate.id === nodeId);
    if (current) finalCommit.commit();
    get().updateNodeData(nodeId, {
      shots,
      status: RUN_STATUS.SUCCESS,
      stage: null,
      error: null,
    });
  } catch (error) {
    const failure =
      error instanceof RunError
        ? error
        : new RunError(error.message ?? "generic", nodeId);
    get().updateNodeData(nodeId, {
      status: RUN_STATUS.ERROR,
      stage: null,
      error: { code: failure.code, message: failure.message },
    });
  }
}
