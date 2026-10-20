import { webRecoveryOperation } from "./web-recovery-operation.js";
import { estimateRunCalls } from "../engine/cost_estimate.js";
import { NODE_TYPE } from "../nodes/types.js";
import { API_MEDIA_TYPE, PROVIDER_ID } from "../../shared/providers.js";

export const DURABLE_RECOVERY_ACTION = Object.freeze({
  AUTO_RESUME: "auto-resume",
  REQUIRE_CONFIRMATION: "require-confirmation",
  BLOCKED: "blocked",
});

export const DURABLE_FAILURE_KIND = Object.freeze({
  TRANSIENT_NETWORK: "transient-network",
  SUBMISSION_UNCERTAIN: "submission-uncertain",
  QUOTA: "quota",
  AUTHORIZATION: "authorization",
  CONFIGURATION: "configuration",
  CONTENT_POLICY: "content-policy",
  PERMANENT: "permanent",
  UNKNOWN: "unknown",
});

const TRANSIENT_CODES = new Set([
  "providerNetworkError",
  "providerTimeout",
  "mediaUploadNetworkError",
]);
const QUOTA_CODES = new Set([
  "providerQuota",
  "insufficient_quota",
  "rateLimitQuota",
]);
const AUTHORIZATION_CODES = new Set([
  "providerUnauthorized",
  "providerKeyRequired",
  "providerKeyRequiredForBaseUrlChange",
]);
const CONFIGURATION_CODES = new Set([
  "providerNotConfigured",
  "providerStorageUnavailable",
  "providerModelRequired",
  "providerInvalidBaseUrl",
  "providerHostDenied",
  "providerUnsupported",
  "providerUnsupportedMedia",
]);
const CONTENT_POLICY_CODES = new Set([
  "contentPolicy",
  "moderationBlocked",
  "providerContentPolicy",
]);
const PERMANENT_CODES = new Set([
  "providerInvalidResponse",
  "providerJobFailed",
  "providerNoResult",
  "emptyPrompt",
  "nodeMissing",
  "cycle",
]);
const QUOTA_MESSAGE =
  /(?:insufficient[_\s-]*quota|quota\s+(?:exhausted|exceeded)|\b429\b)/i;

function failureResult(kind, automaticRetry, requiresUser) {
  return Object.freeze({ kind, automaticRetry, requiresUser });
}

/** Classifies recovery failures once so every scheduler uses one policy. */
export function classifyDurableFailure(error) {
  const code = error?.code ?? "generic";
  const message = error?.message ?? "";
  if (code === "providerSubmissionUncertain") {
    return failureResult(
      DURABLE_FAILURE_KIND.SUBMISSION_UNCERTAIN,
      false,
      true,
    );
  }
  if (QUOTA_CODES.has(code) || QUOTA_MESSAGE.test(message)) {
    return failureResult(DURABLE_FAILURE_KIND.QUOTA, false, true);
  }
  if (TRANSIENT_CODES.has(code)) {
    return failureResult(DURABLE_FAILURE_KIND.TRANSIENT_NETWORK, true, false);
  }
  if (AUTHORIZATION_CODES.has(code)) {
    return failureResult(DURABLE_FAILURE_KIND.AUTHORIZATION, false, true);
  }
  if (CONFIGURATION_CODES.has(code)) {
    return failureResult(DURABLE_FAILURE_KIND.CONFIGURATION, false, true);
  }
  if (CONTENT_POLICY_CODES.has(code)) {
    return failureResult(DURABLE_FAILURE_KIND.CONTENT_POLICY, false, true);
  }
  if (PERMANENT_CODES.has(code)) {
    return failureResult(DURABLE_FAILURE_KIND.PERMANENT, false, true);
  }
  return failureResult(DURABLE_FAILURE_KIND.UNKNOWN, false, true);
}

function failedRecordError(record) {
  if (record.error) return record.error;
  const remaining = new Set(remainingNodeIds(record));
  for (const [nodeId, node] of Object.entries(record.nodes ?? {})) {
    if (remaining.has(nodeId) && node.error) {
      return node.error;
    }
  }
  return (
    Object.values(record.nodes ?? {}).find((node) => node.error)?.error ?? null
  );
}

function remainingNodeIds(record) {
  return (record.requestedNodeIds ?? []).filter(
    (nodeId) => record.nodes?.[nodeId]?.status !== "success",
  );
}

function providerIdentity(node) {
  const mediaType =
    node.type === NODE_TYPE.API_VIDEO || node.type === NODE_TYPE.VIDEO
      ? API_MEDIA_TYPE.VIDEO
      : node.type === NODE_TYPE.API_AUDIO
        ? API_MEDIA_TYPE.AUDIO
        : API_MEDIA_TYPE.IMAGE;
  return {
    providerId: node.data?.providerId ?? PROVIDER_ID.AI_302,
    mediaType,
  };
}

function taskMatchesNode(remoteJob, node) {
  const completed =
    remoteJob?.status === "completed" && remoteJob?.urls?.length > 0;
  if ((!remoteJob?.taskId && !completed) || !node) return false;
  const expected = providerIdentity(node);
  return (
    remoteJob.providerId === expected.providerId &&
    remoteJob.mediaType === expected.mediaType
  );
}

/**
 * Decides whether recovery may proceed without creating an unapproved charge.
 * Existing task handles and local-only work are safe; every other paid path
 * stops before execution and asks the user.
 */
export function planDurableExecutionRecovery(record, { nodes, edges }) {
  const remaining = remainingNodeIds(record);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  if (remaining.some((nodeId) => !nodesById.has(nodeId))) {
    return Object.freeze({
      action: DURABLE_RECOVERY_ACTION.BLOCKED,
      reason: DURABLE_FAILURE_KIND.PERMANENT,
      remainingNodeIds: remaining,
      billableCount: 0,
    });
  }
  const failure = failedRecordError(record);
  const failurePolicy = failure ? classifyDurableFailure(failure) : null;
  const uncertainNode = remaining.find((nodeId) => {
    const attemptState = record.nodes?.[nodeId]?.attemptState;
    return (
      attemptState === "submitting" || attemptState === "submission-uncertain"
    );
  });

  if (
    uncertainNode ||
    failurePolicy?.kind === DURABLE_FAILURE_KIND.SUBMISSION_UNCERTAIN
  ) {
    return Object.freeze({
      action: DURABLE_RECOVERY_ACTION.REQUIRE_CONFIRMATION,
      reason: DURABLE_FAILURE_KIND.SUBMISSION_UNCERTAIN,
      remainingNodeIds: remaining,
      billableCount: 1,
    });
  }

  if (failurePolicy && !failurePolicy.automaticRetry) {
    return Object.freeze({
      action: DURABLE_RECOVERY_ACTION.BLOCKED,
      reason: failurePolicy.kind,
      remainingNodeIds: remaining,
      billableCount: 0,
    });
  }

  const estimate = estimateRunCalls(nodes, edges, { onlyNodeIds: remaining });
  const webOperations = new Map(
    remaining
      .map((nodeId) => [
        nodeId,
        webRecoveryOperation(record, nodesById.get(nodeId), nodesById, edges),
      ])
      .filter(([, operation]) => operation),
  );
  const webPlatforms = [
    ...new Set(
      [...webOperations.values()].map((operation) => operation.platform),
    ),
  ];
  const billableWithoutTask = estimate.nodes.filter(
    ({ nodeId }) =>
      !webOperations.has(nodeId) &&
      !taskMatchesNode(
        record.nodes?.[nodeId]?.remoteJob,
        nodesById.get(nodeId),
      ),
  );
  if (billableWithoutTask.length > 0) {
    return Object.freeze({
      action: DURABLE_RECOVERY_ACTION.REQUIRE_CONFIRMATION,
      reason: "new-paid-submit",
      remainingNodeIds: remaining,
      billableCount: billableWithoutTask.length,
      ...(webPlatforms.length ? { webPlatforms } : {}),
    });
  }

  return Object.freeze({
    action: DURABLE_RECOVERY_ACTION.AUTO_RESUME,
    reason: webPlatforms.length
      ? "existing-web-operation"
      : estimate.total > 0
        ? "existing-provider-task"
        : "local-only-recovery",
    remainingNodeIds: remaining,
    billableCount: 0,
    ...(webPlatforms.length ? { webPlatforms } : {}),
  });
}
