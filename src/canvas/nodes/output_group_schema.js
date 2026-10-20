/**
 * Group output state schema and pure reducers.
 *
 * This module owns the cross-candidate relationship model:
 *   Group.data.outputState → batches / slots / selectedNodeIdBySlot / activeSlotId
 *   candidateNode.data.outputRef → batchId / slotId / variantIndex / derivedFromNodeId
 *
 * It deliberately does NOT know about scene_model documents. A single image
 * candidate's canvas/layers stay in its own IMAGE_EDITOR child's editorDoc.
 */
import { NODE_TYPE } from "./node_enums.js";

export const OUTPUT_GROUP_SCHEMA_VERSION = 1;

/** Media → the node type that should hold one generated candidate. */
export const OUTPUT_GROUP_HOLDER_TYPES = Object.freeze({
  image: NODE_TYPE.PREVIEW,
  video: NODE_TYPE.PREVIEW,
  audio: NODE_TYPE.PREVIEW,
  model3d: NODE_TYPE.PREVIEW,
});

/** Media kinds a Group can currently accept as output. */
export const OUTPUT_GROUP_MEDIA_TYPES = Object.freeze([
  "image",
  "video",
  "audio",
  "model3d",
]);

/** Layout constants shared by Group output placement and fit-to-members. */
export const OUTPUT_GROUP_LAYOUT = Object.freeze({
  cols: 4,
  gap: 24,
  pad: 24,
  padTop: 56,
  cellW: 280,
  cellH: 220,
});

export function createEmptyOutputState() {
  return {
    schemaVersion: OUTPUT_GROUP_SCHEMA_VERSION,
    activeSlotId: null,
    selectedNodeIdBySlot: {},
    batches: {},
  };
}

export function createOutputRef({
  batchId,
  slotId,
  variantIndex,
  derivedFromNodeId = null,
}) {
  if (!batchId) throw new Error("outputRef.batchId is required");
  if (!slotId) throw new Error("outputRef.slotId is required");
  if (!Number.isInteger(variantIndex) || variantIndex < 0) {
    throw new Error("outputRef.variantIndex must be a non-negative integer");
  }
  return { batchId, slotId, variantIndex, derivedFromNodeId };
}

export function createBatch({
  batchId,
  sourceNodeId,
  operation,
  outputMode = "variants",
  parameters = {},
  createdAt = Date.now(),
}) {
  return {
    batchId,
    sourceNodeId,
    operation,
    outputMode,
    createdAt,
    parameters,
  };
}

/** Ensures a persisted state has all required keys, migrating missing fields. */
export function normalizeOutputState(input = null) {
  return {
    schemaVersion: OUTPUT_GROUP_SCHEMA_VERSION,
    activeSlotId: input?.activeSlotId ?? null,
    selectedNodeIdBySlot: input?.selectedNodeIdBySlot ?? {},
    batches: input?.batches ?? {},
  };
}

/**
 * Returns the candidate nodes that belong to one slot, ordered by
 * variantIndex. Membership is derived from parentNode + outputRef so there is
 * exactly one member source (the workflow nodes), not a second list.
 */
export function slotCandidates(nodes, groupId, slotId) {
  return nodes
    .filter(
      (node) =>
        node.parentNode === groupId && node.data?.outputRef?.slotId === slotId,
    )
    .sort(
      (a, b) => a.data.outputRef.variantIndex - b.data.outputRef.variantIndex,
    );
}

/**
 * Pure validation: a Group's outputState invariant must hold. Throws on
 * duplicate/out-of-order variantIndex or dangling selected/active ids.
 */
export function validateOutputState(groupNode, nodes) {
  if (!groupNode || groupNode.type !== NODE_TYPE.GROUP) {
    throw new Error("Group output state requires a Group node");
  }
  const state = normalizeOutputState(groupNode.data?.outputState);
  const groupId = groupNode.id;
  const slotIds = new Set([
    ...Object.keys(state.selectedNodeIdBySlot),
    ...nodes
      .filter(
        (node) => node.parentNode === groupId && node.data?.outputRef?.slotId,
      )
      .map((node) => node.data.outputRef.slotId),
  ]);

  for (const slotId of slotIds) {
    const selectedNodeId = state.selectedNodeIdBySlot[slotId] ?? null;
    const candidates = slotCandidates(nodes, groupId, slotId);
    const seen = new Set();
    for (const candidate of candidates) {
      const ref = candidate.data?.outputRef;
      if (seen.has(ref.variantIndex)) {
        throw new Error(`duplicate variantIndex in slot ${slotId}`);
      }
      seen.add(ref.variantIndex);
    }
    const expected = [...seen].sort((a, b) => a - b);
    for (let i = 0; i < expected.length; i += 1) {
      if (expected[i] !== i) {
        throw new Error(`variantIndex discontinuity in slot ${slotId}`);
      }
    }
    if (selectedNodeId) {
      const selected = nodes.find((node) => node.id === selectedNodeId);
      if (!selected || selected.parentNode !== groupId) {
        throw new Error(
          `selectedNodeId ${selectedNodeId} is not a Group member`,
        );
      }
      if (selected.data?.outputRef?.slotId !== slotId) {
        throw new Error(
          `selectedNodeId ${selectedNodeId} is in the wrong slot`,
        );
      }
    }
  }

  if (
    state.activeSlotId &&
    !(state.activeSlotId in state.selectedNodeIdBySlot)
  ) {
    throw new Error("activeSlotId does not exist in selectedNodeIdBySlot");
  }

  return state;
}

/** Places a new candidate batch below existing Group members, never reflowing old ones. */
function placeNewCandidates(group, nodes, count) {
  const { cols, gap, pad, padTop, cellW, cellH } = OUTPUT_GROUP_LAYOUT;
  const members = nodes.filter((node) => node.parentNode === group.id);
  let rowY = padTop;
  if (members.length > 0) {
    const maxBottom = Math.max(
      ...members.map((member) => (member.position?.y ?? 0) + cellH),
    );
    rowY = Math.max(padTop, maxBottom + gap);
  }
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: pad + col * (cellW + gap),
      y: rowY + row * (cellH + gap),
    });
  }
  return positions;
}

/** Grows a Group container just enough to contain its members; never shrinks. */
function expandGroupForMembers(group, nodes) {
  const { pad, padTop, cellW, cellH } = OUTPUT_GROUP_LAYOUT;
  const members = nodes.filter((node) => node.parentNode === group.id);
  let maxRight = pad;
  let maxBottom = padTop;
  for (const member of members) {
    maxRight = Math.max(maxRight, (member.position?.x ?? 0) + cellW);
    maxBottom = Math.max(maxBottom, (member.position?.y ?? 0) + cellH);
  }
  const oldWidth = Number.parseFloat(group.style?.width) || group.width || 300;
  const oldHeight =
    Number.parseFloat(group.style?.height) || group.height || 200;
  return {
    ...group,
    style: {
      ...(group.style ?? {}),
      width: Math.max(oldWidth, maxRight + pad),
      height: Math.max(oldHeight, maxBottom + pad),
    },
  };
}

/**
 * Pure reducer for one atomic Group output-batch commit.
 *
 * Candidates must already be materialised node objects (with parentNode and
 * data.outputRef). The caller is responsible for asset/blob persistence and
 * for wrapping the final result through commitWorkflowCommand so this one
 * call becomes exactly one history entry.
 */
export function applyOutputBatch({
  group,
  nodes,
  batchId,
  slotId,
  candidates,
  sourceNodeId,
  operation,
  outputMode = "variants",
  parameters = {},
  derivedFromNodeId = null,
  selectedIndex = 0,
}) {
  validateOutputState(group, nodes);

  const state = normalizeOutputState(group.data?.outputState);
  const existingSlotCandidates = slotCandidates(nodes, group.id, slotId);
  const existingIndexes = new Set(
    existingSlotCandidates.map((node) => node.data.outputRef.variantIndex),
  );

  const positions = placeNewCandidates(group, nodes, candidates.length);
  const nextCandidates = candidates.map((candidate, index) => {
    const variantIndex = existingIndexes.size + index;
    if (existingIndexes.has(variantIndex)) {
      throw new Error(
        `variantIndex ${variantIndex} already used in slot ${slotId}`,
      );
    }
    return {
      ...candidate,
      parentNode: group.id,
      position: positions[index] ?? candidate.position ?? { x: 0, y: 0 },
      data: {
        ...candidate.data,
        outputRef: createOutputRef({
          batchId,
          slotId,
          variantIndex,
          derivedFromNodeId:
            candidate.data?.outputRef?.derivedFromNodeId ?? derivedFromNodeId,
        }),
      },
    };
  });

  const batch =
    state.batches[batchId] ??
    createBatch({ batchId, sourceNodeId, operation, outputMode, parameters });

  const selectedNodeIdBySlot = {
    ...state.selectedNodeIdBySlot,
  };
  const firstCandidate = nextCandidates[selectedIndex] ?? nextCandidates[0];
  if (firstCandidate) {
    selectedNodeIdBySlot[slotId] = firstCandidate.id;
  }
  const activeSlotId = state.activeSlotId ?? slotId;

  const nextState = {
    schemaVersion: OUTPUT_GROUP_SCHEMA_VERSION,
    activeSlotId,
    selectedNodeIdBySlot,
    batches: {
      ...state.batches,
      [batchId]: batch,
    },
  };

  const allNodes = [
    ...nodes.map((node) =>
      node.id === group.id
        ? { ...group, data: { ...group.data, outputState: nextState } }
        : node,
    ),
    ...nextCandidates,
  ];
  const nextGroup = expandGroupForMembers(
    {
      ...group,
      data: { ...group.data, outputState: nextState },
    },
    allNodes,
  );

  return {
    nodes: allNodes.map((node) => (node.id === group.id ? nextGroup : node)),
    group: nextGroup,
    outputState: nextState,
  };
}

/** Pure reducer for a semantic selection change. No-op returns null. */
export function applySelectionChange({ group, nodes, slotId, selectedNodeId }) {
  const state = normalizeOutputState(group.data?.outputState);
  if (state.selectedNodeIdBySlot[slotId] === selectedNodeId) return null;
  const selected = nodes.find((node) => node.id === selectedNodeId);
  if (!selected || selected.data?.outputRef?.slotId !== slotId) {
    throw new Error("selectedNodeId is not a candidate in the given slot");
  }
  const nextState = {
    ...state,
    activeSlotId: state.activeSlotId ?? slotId,
    selectedNodeIdBySlot: {
      ...state.selectedNodeIdBySlot,
      [slotId]: selectedNodeId,
    },
  };
  return {
    group: {
      ...group,
      data: { ...group.data, outputState: nextState },
    },
    outputState: nextState,
  };
}

/**
 * Pure reducer for deleting one candidate from a Group. Removes the node,
 * fixes the semantic selection (fallback to previous variant, then next,
 * then drops the slot), and cleans empty batch metadata. Returns null when
 * the candidate is not a Group member.
 */
export function applyCandidateRemoval({ group, nodes, candidateId }) {
  const state = normalizeOutputState(group.data?.outputState);
  const candidate = nodes.find((node) => node.id === candidateId);
  if (!candidate || candidate.parentNode !== group.id) return null;
  const ref = candidate.data?.outputRef;
  if (!ref) return null;

  const remaining = slotCandidates(
    nodes.filter((node) => node.id !== candidateId),
    group.id,
    ref.slotId,
  );

  const selectedNodeIdBySlot = { ...state.selectedNodeIdBySlot };
  const selected = state.selectedNodeIdBySlot[ref.slotId];
  if (selected === candidateId) {
    if (remaining.length > 0) {
      const previous = remaining
        .filter((node) => node.data.outputRef.variantIndex < ref.variantIndex)
        .pop();
      const next = remaining.find(
        (node) => node.data.outputRef.variantIndex > ref.variantIndex,
      );
      selectedNodeIdBySlot[ref.slotId] = (previous ?? next).id;
    } else {
      delete selectedNodeIdBySlot[ref.slotId];
    }
  }

  const batches = { ...state.batches };
  const batchId = ref.batchId;
  if (remaining.length === 0 && batches[batchId]) {
    delete batches[batchId];
  }

  let activeSlotId = state.activeSlotId;
  if (activeSlotId === ref.slotId && !(ref.slotId in selectedNodeIdBySlot)) {
    const remainingSlots = Object.keys(selectedNodeIdBySlot);
    activeSlotId = remainingSlots[0] ?? null;
  }

  const nextState = {
    schemaVersion: OUTPUT_GROUP_SCHEMA_VERSION,
    activeSlotId,
    selectedNodeIdBySlot,
    batches,
  };

  const nextGroup = {
    ...group,
    data: { ...group.data, outputState: nextState },
  };

  return {
    nodes: [
      ...nodes
        .filter((node) => node.id !== candidateId)
        .map((node) => (node.id === group.id ? nextGroup : node)),
    ],
    group: nextGroup,
    outputState: nextState,
  };
}
