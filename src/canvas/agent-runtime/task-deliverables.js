/** Structured task requirements and a live projection of workflow receipts. */

import { NODE_TYPE } from "../nodes/node_enums.js";
import {
  canonicalDeliverableType,
  FILE_MEDIA_TYPES,
  receiptFileArtifacts,
} from "./task-file-artifacts.js";
import { layoutHtmlOf } from "../store/layout_versions.js";

const MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "model3d",
  "slides",
  ...FILE_MEDIA_TYPES,
]);
const HOLDER_TYPES = {
  image: NODE_TYPE.IMAGE_EDITOR,
  video: NODE_TYPE.COMBINE_VIDEO,
  audio: NODE_TYPE.API_AUDIO,
  model3d: NODE_TYPE.MODEL_3D,
};

function matchesDeliverableMediaType(node, mediaType) {
  if (!node) return false;
  const target = canonicalDeliverableType(mediaType);
  if (node.type === NODE_TYPE.PREVIEW) {
    if (
      target === "html" &&
      (node.data?.html || node.data?.layoutHtml || layoutHtmlOf(node))
    ) {
      return true;
    }
    const explicit = canonicalDeliverableType(node.data?.mediaType);
    if (explicit) return explicit === target;
    if (target === "slides" && (node.data?.slides || node.data?.pages)) return true;
    if (target === "video" && node.data?.videoId) return true;
    if (target === "audio" && node.data?.audioId) return true;
    if (target === "image" && (node.data?.imageId || node.data?.assetId)) return true;
    return false;
  }
  return node.type === HOLDER_TYPES[target];
}

/** Only a structured declaration can establish a task-level count. */
export function normalizeDeliverableRequirements(input) {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("deliverables must be a non-empty array");
  }
  const seen = new Set();
  return input.map((item) => {
    const mediaType = canonicalDeliverableType(item?.mediaType);
    if (!MEDIA_TYPES.has(mediaType)) {
      throw new Error("deliverables.mediaType is invalid");
    }
    if (!Number.isInteger(item.count) || item.count < 1) {
      throw new Error("deliverables.count must be a positive integer");
    }
    if (seen.has(mediaType)) {
      throw new Error("deliverables.mediaType must be unique");
    }
    seen.add(mediaType);
    return {
      mediaType,
      count: item.count,
      requireVerification: item.requireVerification === true,
      requireExport: item.requireExport === true,
    };
  });
}

function layoutArtifacts(receipt, nodes) {
  if (
    receipt.toolName !== "generate_layout" ||
    !["committed", "accepted", "pending_review"].includes(receipt.status)
  ) {
    return [];
  }
  if (receipt.result?.channel !== "layout") return [];
  const node = nodes.find(
    (entry) =>
      entry.id === receipt.result.nodeId &&
      (entry.type === NODE_TYPE.IMAGE_EDITOR ||
        entry.type === NODE_TYPE.PREVIEW),
  );
  const html =
    (node && layoutHtmlOf(node)) ||
    (typeof node?.data?.html === "string" ? node.data.html : null) ||
    (typeof node?.data?.layoutHtml === "string" ? node.data.layoutHtml : null);
  if (typeof html !== "string" || !html.trim()) return [];
  return [
    {
      key: `layout:${node.id}`,
      name: node.data?.label || node.data?.title || node.id,
      memberNodeId: node.id,
      html,
    },
  ];
}

/** Follow persisted resume links without counting a run twice. */
export function getRunLineage(run, runs) {
  const byId = new Map((runs ?? []).map((entry) => [entry.id, entry]));
  const seen = new Set([run?.id]);
  const lineage = [];
  let parentId = run?.resumedFromRunId;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    lineage.unshift(parent);
    seen.add(parentId);
    parentId = parent.resumedFromRunId;
  }
  return lineage;
}

function assetIds(node) {
  const data = node?.data;
  if (!data) return [];
  return [
    data.assetId,
    data.imageId,
    data.videoId,
    data.audioId,
    ...(Array.isArray(data.results) ? data.results : []),
    ...(Array.isArray(data.assetIds) ? data.assetIds : []),
    ...(Array.isArray(data.imageIds) ? data.imageIds : []),
  ].filter(Boolean);
}

function receiptsForRun(run) {
  return (run?.changeSets ?? []).filter(
    (entry) =>
      entry.toolName === "run_workflow" &&
      entry.status !== "reverted" &&
      Array.isArray(entry.result?.nodes),
  );
}

function selectedOutputKeys(sourceId, resultIds, nodes, mediaType) {
  const matching = nodes.filter((node) => {
    const group = nodes.find((entry) => entry.id === node.parentNode);
    const batchId = node.data?.outputRef?.batchId;
    const batchSource =
      group?.data?.outputState?.batches?.[batchId]?.sourceNodeId;
    return (
      (node.data?.sourceNodeId === sourceId || batchSource === sourceId) &&
      matchesDeliverableMediaType(node, mediaType) &&
      assetIds(node).some((id) => resultIds.includes(id)) &&
      (!node.parentNode || group)
    );
  });
  const selectedSlots = new Map();
  for (const node of matching) {
    const slotId = node.data?.outputRef?.slotId;
    if (!slotId) continue;
    const group = nodes.find((entry) => entry.id === node.parentNode);
    if (group?.data?.outputState?.selectedNodeIdBySlot?.[slotId] === node.id) {
      selectedSlots.set(`${sourceId}:${node.parentNode}:${slotId}`, node);
    }
  }
  if (selectedSlots.size > 0) return [...selectedSlots];
  // Legacy Group members have no slot metadata. One producer is one deliverable;
  // several returned assets may just be variants of that same deliverable.
  const legacy = matching.find((node) => !node.data?.outputRef?.slotId);
  return legacy ? [[sourceId, legacy]] : [];
}

function verificationState(receipts, requireVerification) {
  if (receipts.some((entry) => entry.status === "pending_review")) {
    return "pending_review";
  }
  if (!requireVerification) return "not_required";
  const statuses = receipts.map(
    (entry) => entry.verificationStatus ?? "unverified",
  );
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("needs_human_judgment")) return "needs_human_judgment";
  if (statuses.includes("unverifiable")) return "unverifiable";
  return statuses.every((status) => status === "verified")
    ? "verified"
    : "unverified";
}

/** Recomputes from current nodes so deletion and review decisions remain visible. */
export function projectTaskDeliverables(
  run,
  nodes = [],
  lineage = [],
  { projectRoot = null } = {},
) {
  const requirements = run?.deliverableRequirements ?? null;
  if (!requirements?.length) {
    return { status: "unspecified", items: [], completed: false };
  }
  const runs = [...lineage, run].filter(Boolean);
  const receipts = runs.flatMap(receiptsForRun);
  const items = requirements.map((requirement) => {
    const candidates = new Map();
    for (const receipt of receipts) {
      for (const nodeReceipt of receipt.result.nodes) {
        if (
          nodeReceipt.status !== "success" ||
          !nodeReceipt.resultIds?.length
        ) {
          continue;
        }
        const keys = selectedOutputKeys(
          nodeReceipt.nodeId,
          nodeReceipt.resultIds,
          nodes,
          requirement.mediaType,
        );
        for (const [key, member] of keys) {
          const entry = candidates.get(key) ?? [];
          entry.push({
            receipt,
            sourceNodeId: nodeReceipt.nodeId,
            memberNodeId: member.id,
            resultId: assetIds(member).find((id) =>
              nodeReceipt.resultIds.includes(id),
            ),
            name: member.data?.label || member.data?.title || member.id,
            html:
              layoutHtmlOf(member) ||
              (typeof member.data?.html === "string" ? member.data.html : null) ||
              (typeof member.data?.layoutHtml === "string"
                ? member.data.layoutHtml
                : null),
          });
          candidates.set(key, entry);
        }
      }
    }
    if (FILE_MEDIA_TYPES.includes(requirement.mediaType)) {
      for (const sourceRun of runs) {
        for (const receipt of sourceRun.changeSets ?? []) {
          const artifacts =
            requirement.mediaType === "html"
              ? layoutArtifacts(receipt, nodes)
              : [];
          artifacts.push(
            ...receiptFileArtifacts(
              receipt,
              requirement.mediaType,
              projectRoot,
            ),
          );
          for (const artifact of artifacts) {
            const entry = candidates.get(artifact.key) ?? [];
            entry.push({
              receipt,
              sourceNodeId: receipt.result?.nodeId ?? null,
              memberNodeId: artifact.memberNodeId ?? null,
              resultId: artifact.id ?? null,
              name: artifact.name,
              html: artifact.html ?? null,
              path: artifact.path ?? null,
            });
            candidates.set(artifact.key, entry);
          }
        }
      }
    }
    const generated = candidates.size;
    const verified = [...candidates.values()].filter((entries) => {
      const state = verificationState(
        entries.map((entry) => entry.receipt),
        requirement.requireVerification,
      );
      return state === "verified" || state === "not_required";
    }).length;
    const pendingReview = [...candidates.values()].filter(
      (entries) =>
        verificationState(
          entries.map((entry) => entry.receipt),
          requirement.requireVerification,
        ) === "pending_review",
    ).length;
    const verificationStates = [...candidates.values()].map((entries) =>
      verificationState(
        entries.map((entry) => entry.receipt),
        requirement.requireVerification,
      ),
    );
    const verificationStatus = !requirement.requireVerification
      ? "not_required"
      : ([
          "pending_review",
          "failed",
          "needs_human_judgment",
          "unverifiable",
          "unverified",
        ].find((status) => verificationStates.includes(status)) ??
        (verified >= requirement.count ? "verified" : "unverified"));
    // Browser download initiation cannot prove that the file was saved.
    const exportStatus = requirement.requireExport
      ? "unconfirmed"
      : "not_required";
    return {
      ...requirement,
      generated,
      verified,
      pendingReview,
      verificationStatus,
      missing: Math.max(0, requirement.count - generated),
      exportStatus,
      evidence: [...candidates.values()].map((entries) => {
        const latest = entries.at(-1);
        const sourceRun =
          runs.find((entry) => entry.id === latest.receipt.runId) ?? run;
        return {
          changeSetId: latest.receipt.id,
          toolCallId: latest.receipt.toolCallId ?? null,
          agentStepId: latest.receipt.stepId ?? null,
          planStepId:
            sourceRun?.plan?.steps?.find((step) =>
              step.toolCallIds?.includes(latest.receipt.toolCallId),
            )?.id ?? null,
          executionId: latest.receipt.result?.executionId ?? null,
          sourceNodeId: latest.sourceNodeId,
          memberNodeId: latest.memberNodeId,
          resultId: latest.resultId,
          name: latest.name,
          html: latest.html,
          path: latest.path,
          verificationStatus: latest.receipt.verificationStatus ?? "unverified",
        };
      }),
      complete:
        generated >= requirement.count &&
        verified >= requirement.count &&
        !requirement.requireExport,
    };
  });
  return {
    status: items.every((item) => item.complete) ? "complete" : "incomplete",
    items,
    completed: items.every((item) => item.complete),
  };
}
