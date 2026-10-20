/**
 * Output-group ownership + editor/video materialization seam.
 *
 * Mints and resolves the auto-created output Group that owns a source node's
 * generated output, and materialises editor-generated results into Group
 * candidates through the shared applyGroupMutation pipeline. Holds the
 * idempotency maps that keep auto-create + first batch to one undo entry.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_group_output_actions
 */

import { createNode, NODE_TYPE } from "../nodes/types.js";
import { t } from "../../shared/i18n.js";
import {
  OUTPUT_GROUP_LAYOUT,
  createEmptyOutputState,
} from "../nodes/output_group_schema.js";
import { getNodeTypeDefinition } from "../nodes/registry.js";
import { dataUrlToBlob, putImage } from "./db.js";
import { cloneAndApplyGeneratedScenePatch } from "./editor_generated_materializer.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/** Grouping and ungrouping node actions. */
export function createWorkflowGroupOutputActions(set, get) {
  // Idempotency guards for auto-created output Groups. When an AI operation on
  // a source that has no Group yet fires, we mint the Group eagerly (so a
  // second back-to-back trigger on the same source reuses it instead of
  // creating a twin) but only commit it inside the single applyGroupMutation
  // that lands the first candidates. Maps are cleaned up once that commit
  // settles (or the operation fails).
  const pendingGroupIdBySource = new Map();
  const pendingGroupNodeBySource = new Map();

  /**
   * Builds the fresh Group node that will own a source's generated output.
   * Position and size come from NODE_TYPE_REGISTRY — never hardcoded here.
   * The source is placed at (pad, padTop) relative to the new Group so it
   * keeps the absolute canvas position it had before being adopted.
   */
  function buildOutputGroupForSource(sourceNodeId) {
    const size = getNodeTypeDefinition(NODE_TYPE.GROUP).size;
    const source = get().nodes.find((node) => node.id === sourceNodeId);
    const sourcePos = source?.position ?? { x: 0, y: 0 };
    const { pad, padTop } = OUTPUT_GROUP_LAYOUT;
    const groupId = `group-${crypto.randomUUID()}`;
    return {
      id: groupId,
      type: NODE_TYPE.GROUP,
      position: { x: sourcePos.x - pad, y: sourcePos.y - padTop },
      style: { width: size.width, height: size.height },
      data: {
        label: t("node.group.defaultLabel"),
        outputState: createEmptyOutputState(),
        // Every output Group is an auto-layout Group from birth; the reflow
        // in applyGroupMutation stacks members as they land.
        autoLayout: true,
        autoLayoutMode: "waterfall",
      },
      zIndex: -1,
    };
  }

  return {
    /**
     * Returns the Group id that should own a source node's generated output.
     * If the source is already inside a groupNode, that group wins. Otherwise
     * the Group is auto-created (see ensureOutputGroupForSource) so standalone
     * images keep working after the Group-output cutover.
     */
    resolveOutputGroupForSource(sourceWorkflowNodeId) {
      const nodes = get().nodes;
      const source = nodes.find((node) => node.id === sourceWorkflowNodeId);
      if (source?.parentNode) {
        const parent = nodes.find((node) => node.id === source.parentNode);
        if (parent?.type === NODE_TYPE.GROUP) return source.parentNode;
      }
      const pending = pendingGroupIdBySource.get(sourceWorkflowNodeId);
      if (pending) return pending;
      return get().ensureOutputGroupForSource(sourceWorkflowNodeId);
    },

    /**
     * Mints a Group for a source that has none yet. The Group node is created
     * now (so repeat calls are idempotent) but only committed inside the same
     * applyGroupMutation that lands the first candidates — this keeps the
     * auto-create + first batch to exactly one undo history entry.
     */
    ensureOutputGroupForSource(sourceWorkflowNodeId) {
      const pending = pendingGroupIdBySource.get(sourceWorkflowNodeId);
      if (pending) return pending;
      const groupNode = buildOutputGroupForSource(sourceWorkflowNodeId);
      pendingGroupIdBySource.set(sourceWorkflowNodeId, groupNode.id);
      pendingGroupNodeBySource.set(sourceWorkflowNodeId, groupNode);
      return groupNode.id;
    },

    /**
     * Materialises one editor-generated result into a Group candidate using
     * the same applyGroupMutation pipeline. This is the only Group-facing
     * entry point for editor AI results.
     */
    async materializeEditorGeneratedOutput({
      groupId: explicitGroupId,
      result,
    }) {
      if (isWorkflowReadOnly(get())) return null;
      if (!result?.asset?.dataUrl) {
        throw new Error("generatedOutputAssetMissing");
      }
      const assetId = `img-${crypto.randomUUID()}`;
      const blob = dataUrlToBlob(result.asset.dataUrl);
      await putImage(assetId, blob);
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[assetId, blob]])),
      });

      const sourceId = result.sourceWorkflowNodeId;
      const groupId =
        explicitGroupId ?? get().resolveOutputGroupForSource(sourceId);
      const newGroup = pendingGroupNodeBySource.get(sourceId) ?? null;

      const nodes = get().nodes;
      const sourceNode = nodes.find((node) => node.id === sourceId);
      const sourceIsGroupMember =
        sourceNode && sourceNode.parentNode === groupId;
      const slotId =
        sourceIsGroupMember && sourceNode.data.outputRef?.slotId
          ? sourceNode.data.outputRef.slotId
          : `slot-${sourceId}`;
      const batchId = `batch-${crypto.randomUUID()}`;

      const editorDoc = cloneAndApplyGeneratedScenePatch({
        sourceSnapshot: result.sourceSnapshot,
        sourceSceneNodeId: result.sourceSceneNodeId,
        assetId,
        scenePatch: result.scenePatch,
      });

      const candidate = createNode(
        NODE_TYPE.PREVIEW,
        { x: 0, y: 0 },
        {
          mediaType: "image",
          assetId,
          imageId: assetId,
          filename: `${result.operation}-${Date.now()}`,
          editorDoc,
          origin: "generated",
          sourceNodeId: sourceId,
        },
      );

      try {
        const applied = get().applyGroupMutation({
          groupId,
          newGroup,
          // Only fold the source into a freshly-created Group, in the same
          // atomic commit as the candidates landing.
          foldSourceNodeId: newGroup ? sourceId : null,
          outputBatch: {
            batchId,
            slotId,
            candidates: [candidate],
            sourceNodeId: sourceId,
            operation: result.operation,
            outputMode: "collection",
            parameters: result.parameters ?? {},
          },
        });
        return {
          candidateNodeId: candidate.id,
          batchId: applied ? batchId : null,
          slotId: applied ? slotId : null,
        };
      } finally {
        pendingGroupIdBySource.delete(sourceId);
        pendingGroupNodeBySource.delete(sourceId);
      }
    },
  };
}
