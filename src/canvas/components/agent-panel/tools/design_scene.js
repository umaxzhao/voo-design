import { t } from "../../../../shared/i18n.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import {
  createDocument,
  createImageNode,
} from "../../../editor/scene_doc_factory.js";
import { serialiseDocument } from "../../../editor/scene_model_serialization.js";
import { applySceneOperations } from "../../../editor/scene-composition-operations.js";
import { resolveCanvasInstanceSource } from "./canvas-instance-source.js";
import { commitWorkflowHistory } from "../../../undo-action-contracts.js";
import { TOOL_ERROR_CODE, ToolError } from "./errors.js";
import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";

function stableSceneJson(document) {
  return JSON.stringify(document, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : value,
  );
}

async function sceneRevision(document) {
  const bytes = new TextEncoder().encode(stableSceneJson(document));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function revisionConflict(expectedRevision, currentRevision = null) {
  return new ToolError(
    TOOL_ERROR_CODE.STALE_REVISION_CONFLICT,
    t("sceneAgent.revisionConflict"),
    {
      details: {
        expectedRevision,
        ...(currentRevision ? { currentRevision } : {}),
      },
      suggestion: {
        tool: "get_design_scene",
        note: t("sceneAgent.revisionRefresh"),
      },
    },
  );
}

function sceneTarget(store, nodeId) {
  const node = store.nodes?.find((item) => item.id === nodeId);
  if (node?.type !== NODE_TYPE.IMAGE_EDITOR)
    throw new TypeError("A Design imageAsset node is required");
  const bridge = store.editorBridges?.[nodeId] ?? null;
  const engine = bridge?.engine;
  const session =
    store.presentationSession?.ownerId === node.data?.presentationOwnerId
      ? store.presentationSession
      : null;
  let doc =
    engine?.getDocument?.() ??
    session?.getPageDocument?.(nodeId) ??
    node.data?.editorDoc;
  if (!doc) {
    doc = createDocument(
      node.data?.layoutWidth ?? 1024,
      node.data?.layoutHeight ?? 1024,
    );
    // A closed node without editorDoc must return the same revision on every read.
    doc.canvasId = node.id;
    if (node.data?.imageId) {
      doc.nodes.push({
        ...createImageNode({
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          imageId: node.data.imageId,
        }),
        id: `${node.id}-base`,
      });
    }
  }
  return { node, engine, doc };
}

function resolveMedia(store, operation) {
  if (operation.type !== "insert_media") return operation;
  const source = store.nodes?.find(
    (node) => node.id === operation.sourceNodeId,
  );
  if (!source) throw new TypeError("A completed media source node is required");
  const data = source.data ?? {};
  const kind =
    data.mediaType ??
    ([NODE_TYPE.MODEL_3D, NODE_TYPE.API_3D].includes(source.type)
      ? "model3d"
      : [
            NODE_TYPE.VIDEO,
            NODE_TYPE.API_VIDEO,
            NODE_TYPE.COMBINE_VIDEO,
          ].includes(source.type)
        ? "video"
        : null);
  if (!["video", "model3d"].includes(kind))
    throw new TypeError("Source must contain a video or 3D model");
  const assetId =
    data.results?.[data.selectedIndex ?? 0] ?? data.assetId ?? data.videoId;
  const src = (assetId && store.images?.[assetId]) ?? data.url ?? data.src;
  if (!assetId && !src)
    throw new TypeError(
      "Generate or import the media source before inserting it",
    );
  return { ...operation, kind, assetId: assetId ?? null, src: src ?? null };
}

export const getDesignSceneTool = createToolFromDescriptor(
  getWorkflowToolDefinition("get_design_scene"),
  {
    async execute(args, context) {
      const { doc, engine } = sceneTarget(context.getStore(), args.nodeId);
      const document = serialiseDocument(doc);
      return {
        nodeId: args.nodeId,
        document,
        revision: await sceneRevision(document),
        live: Boolean(engine),
        playback: engine?.getPlaybackState?.() ?? null,
      };
    },
    presentCall: () => ({ title: t("sceneAgent.inspect"), icon: "layout" }),
    presentResult: () => ({
      title: t("sceneAgent.inspected"),
      status: "completed",
    }),
  },
);

export const editDesignSceneTool = createToolFromDescriptor(
  getWorkflowToolDefinition("edit_design_scene"),
  {
    async execute(args, context) {
      const store = context.getStore();
      const page = store.nodes?.find((node) => node.id === args.nodeId);
      const session =
        store.presentationSession?.ownerId === page?.data?.presentationOwnerId
          ? store.presentationSession
          : null;
      // Re-activate an evicted page before editing so its unsaved snapshot and
      // editor history remain authoritative instead of writing underneath it.
      const liveEngine = session?.getPageEngine
        ? await session.getPageEngine(args.nodeId)
        : null;
      const target = sceneTarget(context.getStore(), args.nodeId);
      const engine = liveEngine ?? target.engine;
      const doc = engine?.getDocument?.() ?? target.doc;
      if (!Array.isArray(args.operations))
        throw new TypeError("Scene operations must be an array");
      const before = serialiseDocument(doc);
      if (args.expectedRevision !== undefined) {
        if (
          typeof args.expectedRevision !== "string" ||
          !/^sha256:[0-9a-f]{64}$/.test(args.expectedRevision)
        ) {
          throw new TypeError(
            "Expected scene revision must be a SHA-256 revision",
          );
        }
        const currentRevision = await sceneRevision(before);
        if (currentRevision !== args.expectedRevision)
          throw revisionConflict(args.expectedRevision, currentRevision);
        // Hashing yields to the event loop. Recheck the authoritative document
        // before applying any operation, so an intervening edit is not lost.
        const latest =
          engine?.getDocument?.() ?? sceneTarget(store, args.nodeId).doc;
        if (
          stableSceneJson(serialiseDocument(latest)) !== stableSceneJson(before)
        )
          throw revisionConflict(args.expectedRevision);
      }
      const next = applySceneOperations(
        doc,
        args.operations.map((operation) =>
          resolveCanvasInstanceSource(
            store,
            resolveMedia(store, operation),
            args.nodeId,
            doc,
          ),
        ),
      );
      const serialized = serialiseDocument(next);
      const changed = stableSceneJson(serialized) !== stableSceneJson(before);
      if (changed) {
        // Live edits belong to editor undo. Closed documents belong to workflow undo.
        // Updating the store while an editor is mounted would bypass its Cancel contract.
        if (engine) engine.setDoc(next, { name: t("sceneAgent.edit") });
        else {
          commitWorkflowHistory(store, "workflow.agent.scene.edit");
          store.updateNodeData(args.nodeId, { editorDoc: serialized });
        }
      }
      return {
        nodeId: args.nodeId,
        changed,
        revision: await sceneRevision(serialized),
        live: Boolean(engine),
        layerIds: next.nodes.map((node) => node.id),
        timeline: next.timeline ?? null,
      };
    },
    presentCall: () => ({ title: t("sceneAgent.edit"), icon: "sliders" }),
    presentResult: () => ({
      title: t("sceneAgent.edited"),
      status: "completed",
    }),
  },
);
