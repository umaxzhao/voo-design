import { RunError, runTextNode } from "../engine/executor.js";
import { RUN_STATUS } from "../nodes/types.js";
import { isInSidePanel } from "../rpc.js";
import { createAsyncFinalCommit } from "./async-final-commit.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/** Runs one AI text node and preserves every successful reply as a version. */
export async function generateNodeText(get, nodeId) {
  if (isWorkflowReadOnly(get())) return;
  const node = get().nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.data.status === RUN_STATUS.RUNNING) return;
  const finalCommit = createAsyncFinalCommit(get, "workflow.async.text");

  get().updateNodeData(nodeId, {
    status: RUN_STATUS.RUNNING,
    stage: "starting",
    error: null,
  });

  try {
    const text = await runTextNode({
      nodeId,
      getGraph: () => ({ nodes: get().nodes, edges: get().edges }),
      settings: get().settings,
      context: {
        inSidePanel: isInSidePanel(),
        hostPlatform: get().platform.id,
      },
    });
    const version = {
      id: `text-${crypto.randomUUID()}`,
      text,
      createdAt: Date.now(),
    };
    const current = get().nodes.find((candidate) => candidate.id === nodeId);
    if (current) finalCommit.commit();
    get().updateNodeData(nodeId, {
      text,
      versions: [...(current?.data.versions ?? []), version],
      selectedVersionId: version.id,
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
