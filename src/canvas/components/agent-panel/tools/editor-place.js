/**
 * Where an agent generation lands while an editor is open.
 *
 * A user who says "generate this on this image" means the image they have open.
 * The
 * generation tools used to create a brand-new canvas node whatever was on
 * screen, so the result landed beside the document the user was working in
 * instead of inside it.
 *
 * The Design editor already knows how to take a result from a wire: the
 * ingestion path (workflow_node_ingestion_actions.js) appends a finished result
 * to a connected imageAsset node's document as a new layer. The tools
 * therefore do not move the result themselves — they connect the node they
 * just created, and the editor's own contract places it.
 *
 * Images use graph ingestion. Video and 3D assets require a completed source
 * followed by edit_design_scene insert_media on the captured canvas; wiring
 * those source ports to image ingestion would create the wrong kind of layer.
 */

import { HANDLE, NODE_TYPE } from "../../../nodes/node_enums.js";
import {
  EDITOR_KIND,
  resolveEditorKind,
} from "../../../nodes/editor_routing.js";

export const MEDIA_KIND = Object.freeze({
  IMAGE: "image",
  VIDEO: "video",
  MODEL_3D: "model3d",
});

export const PLACEMENT_REASON = Object.freeze({
  /** No editor is open: the result is an ordinary canvas node. */
  NO_EDITOR: "no-editor",
  /** An editor that edits something else (a video into the picture editor). */
  MEDIA_NOT_ACCEPTED: "editor-takes-other-media",
  /** The generated source must finish before insert_media can mount it. */
  SCENE_INSERTION_REQUIRED: "scene-insertion-required",
  /** The right editor, but the open node carries no timeline/document to take it. */
  RECEIVER_NOT_A_TARGET: "open-node-cannot-receive",
  /** The graph refused the edge (port mismatch, duplicate, cycle). */
  CONNECT_REFUSED: "connection-refused",
});

/** One receiving node type, and the output port that feeds it, per editor. */
const PLACEMENTS = Object.freeze([
  {
    editorKind: EDITOR_KIND.DESIGN,
    mediaKind: MEDIA_KIND.IMAGE,
    receiverType: NODE_TYPE.IMAGE_EDITOR,
    sourceHandle: HANDLE.IMAGE,
  },
]);

/** The one input port the Design editor accepts pictures, video and audio on. */
const RECEIVER_INPUT_HANDLE = HANDLE.MEDIA;

/**
 * How far below the open editor's node a generated node is laid out. Big
 * enough to clear a node card, so the new node reads as "next to what I was
 * working on" rather than on top of it.
 */
const ADJACENT_OFFSET_Y = 320;

function findOpenEditorNode(store) {
  const editingNodeId = store?.editingNodeId ?? null;
  if (!editingNodeId) return null;
  return (store?.nodes ?? []).find((node) => node.id === editingNodeId) ?? null;
}

/**
 * Answers where a generation of `mediaKind` belongs right now.
 *
 * @param {object} store workflow store (reads `editingNodeId`, `nodes`)
 * @param {string} mediaKind MEDIA_KIND.IMAGE | MEDIA_KIND.VIDEO | MEDIA_KIND.MODEL_3D
 * @returns {{placed: boolean, reason: string|null, editorKind: string|null,
 *   receiverNodeId: string|null, sourceHandle?: string, targetHandle?: string}}
 */
export function resolveEditorPlacement(store, mediaKind) {
  const openNode = findOpenEditorNode(store);
  if (!openNode) {
    return {
      placed: false,
      reason: PLACEMENT_REASON.NO_EDITOR,
      editorKind: null,
      receiverNodeId: null,
    };
  }

  const editorKind = resolveEditorKind(openNode.type, openNode);
  if ([MEDIA_KIND.VIDEO, MEDIA_KIND.MODEL_3D].includes(mediaKind)) {
    return {
      placed: false,
      reason: PLACEMENT_REASON.SCENE_INSERTION_REQUIRED,
      editorKind,
      receiverNodeId: openNode.id,
    };
  }
  const placement = PLACEMENTS.find(
    (candidate) =>
      candidate.editorKind === editorKind && candidate.mediaKind === mediaKind,
  );
  if (!placement) {
    return {
      placed: false,
      reason: PLACEMENT_REASON.MEDIA_NOT_ACCEPTED,
      editorKind,
      receiverNodeId: openNode.id,
    };
  }
  if (
    openNode.type !== placement.receiverType &&
    openNode.type !== NODE_TYPE.PREVIEW
  ) {
    return {
      placed: false,
      reason: PLACEMENT_REASON.RECEIVER_NOT_A_TARGET,
      editorKind,
      receiverNodeId: openNode.id,
    };
  }
  return {
    placed: true,
    reason: null,
    editorKind,
    receiverNodeId: openNode.id,
    sourceHandle: placement.sourceHandle,
    targetHandle: RECEIVER_INPUT_HANDLE,
  };
}

/**
 * Connects a freshly created generation node to the open editor's node, so the
 * editor's own ingestion path places the result. Reports the graph's real
 * answer: a refused edge leaves the node on the canvas and says so, instead of
 * claiming the result was placed.
 */
export function placeGenerationInOpenEditor(store, generatedNodeId, mediaKind) {
  const placement = resolveEditorPlacement(store, mediaKind);
  if (!placement.placed) return { ...placement, connected: false };

  const connected =
    store.onConnect({
      source: generatedNodeId,
      target: placement.receiverNodeId,
      sourceHandle: placement.sourceHandle,
      targetHandle: placement.targetHandle,
    }) === true;
  if (!connected) {
    return {
      ...placement,
      placed: false,
      reason: PLACEMENT_REASON.CONNECT_REFUSED,
      connected: false,
    };
  }
  return { ...placement, connected: true };
}

/**
 * Where a generated node is laid out.
 *
 * While an editor is open the source node is put directly below its canvas.
 * With no editor open the tool's default position stands.
 */
export function generationPosition(store, requestedPosition, fallback) {
  if (requestedPosition) return requestedPosition;
  const openNode = findOpenEditorNode(store);
  if (!openNode) return { ...fallback };
  const { x = fallback.x, y = fallback.y } = openNode.position ?? {};
  return { x, y: y + ADJACENT_OFFSET_Y };
}

/**
 * The receipt a generation tool reports for the open editor, or null when no
 * editor was involved (so a canvas-only generation carries no extra field).
 */
export function editorPlacementReceipt(placement) {
  if (!placement?.editorKind) return null;
  return {
    editorKind: placement.editorKind,
    receiverNodeId: placement.receiverNodeId,
    placed: placement.placed,
    ...(placement.placed ? {} : { reason: placement.reason }),
    ...(placement.reason === PLACEMENT_REASON.SCENE_INSERTION_REQUIRED
      ? { nextTool: "edit_design_scene", nextOperation: "insert_media" }
      : {}),
  };
}
