import { checkIdentityCompliance } from "../editor/identity_compliance.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

function collectBatchImageCandidates(memberIds, nodes, images) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const candidates = [];
  for (const memberId of memberIds) {
    const results = byId.get(memberId)?.data?.results;
    if (!Array.isArray(results)) continue;
    for (const imageId of results) {
      const source = images?.[imageId];
      if (!source) continue;
      candidates.push({ memberId, imageId, source });
    }
  }
  return candidates;
}

/**
 * Runs the post-run identity check for a Batch and records the outcome on the
 * Batch node as `data.identityCompliance`.
 *
 * The pixel reader is injected (`readIdentitySamples(candidates, {maxEdge})`):
 * the store is DOM-free, so decoding each stored source into a bitmap stays in
 * the component layer. A reader that throws — or a check that cannot measure
 * anything — is recorded as `"unknown"`, never silently dropped as a pass.
 *
 * @returns {Promise<{status: string, issues: Array, reason?: string}|null>}
 *   the recorded result, or null when there was no still to check.
 */
export async function recordBatchIdentityCompliance({
  get,
  batchNodeId,
  memberIds,
  lock,
  readIdentitySamples,
  maxEdge,
}) {
  const state = get();
  const workflowId = state.workflowId;
  const workflowHistories = state.workflowHistories;
  const isCurrent = () => {
    const current = get();
    return (
      current.workflowId === workflowId &&
      current.workflowHistories === workflowHistories &&
      !isWorkflowReadOnly(current) &&
      current.nodes.some((node) => node.id === batchNodeId)
    );
  };
  const candidates = collectBatchImageCandidates(
    memberIds,
    state.nodes,
    state.images,
  );
  if (candidates.length === 0) return null;

  let compliance;
  try {
    const samples = await readIdentitySamples(candidates, {
      maxEdge,
    });
    compliance = checkIdentityCompliance({ samples, lock });
  } catch (error) {
    compliance = {
      status: "unknown",
      issues: [],
      reason: String(error?.message ?? error ?? "sampleReadFailed"),
    };
  }
  // Sampling can outlive a project switch, reopen, or deleted Batch node.
  // Never write the old verdict into a different live document.
  if (!isCurrent()) return null;
  get().updateNodeData(batchNodeId, { identityCompliance: compliance });
  return compliance;
}
