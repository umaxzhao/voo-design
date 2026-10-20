/** Build editable per-element image-to-3D branches from a concept image. */
import { t } from "../../../../shared/i18n.js";
import { getNodeVisualSize } from "../../../node-position.js";
import { HANDLE, NODE_TYPE, nodeHasPort } from "../../../nodes/node_enums.js";
import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { MAX_GAME_ASSET_ELEMENTS } from "./gameAssetConstants.js";

const def = getWorkflowToolDefinition("build_game_asset_workflow");
const COLUMN_GAP = 96;
const ROW_GAP = 48;
const ELEMENT_ROLES = ["gameAssetPrompt", "gameAssetImage", "gameAssetModel"];

function requireElement(element, seen) {
  if (
    !element ||
    typeof element !== "object" ||
    Array.isArray(element) ||
    typeof element.key !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(element.key) ||
    seen.has(element.key) ||
    ["name", "imagePrompt", "modelPrompt"].some(
      (field) => typeof element[field] !== "string" || !element[field].trim(),
    )
  ) {
    throw new Error(t("gameAssets.error.invalidElement"));
  }
  seen.add(element.key);
  return {
    key: element.key,
    name: element.name.trim(),
    imagePrompt: element.imagePrompt.trim(),
    modelPrompt: element.modelPrompt.trim(),
  };
}

function conceptOutputHandle(node) {
  if (node.type === NODE_TYPE.PREVIEW) {
    return node.data?.mediaType === "image" ? HANDLE.MEDIA : null;
  }
  return [
    NODE_TYPE.IMAGE_EDITOR,
    NODE_TYPE.GENERATE,
    NODE_TYPE.API_IMAGE,
  ].includes(node.type) && nodeHasPort(node, "source", HANDLE.IMAGE)
    ? HANDLE.IMAGE
    : null;
}

function conceptHasImage(node) {
  if ([NODE_TYPE.PREVIEW, NODE_TYPE.IMAGE_EDITOR].includes(node.type)) {
    return Boolean(
      node.data?.imageId ||
      node.data?.assetId ||
      node.data?.referenceImages?.some((image) => image?.imageId),
    );
  }
  const results = node.data?.results ?? [];
  return Boolean(results[node.data?.selectedIndex ?? 0] ?? results[0]);
}

function existingBranch(nodes, rootId, key) {
  const matches = nodes.filter(
    (node) =>
      node.data?.workflowRootId === rootId &&
      node.data?.assetElementKey === key &&
      ELEMENT_ROLES.includes(node.data?.workflowRole),
  );
  if (matches.length === 0) return null;
  const roles = Object.fromEntries(
    matches.map((node) => [node.data.workflowRole, node.id]),
  );
  if (
    matches.length !== ELEMENT_ROLES.length ||
    ELEMENT_ROLES.some((role) => !roles[role])
  ) {
    throw new Error(t("gameAssets.error.incompleteBranch", { key }));
  }
  return {
    key,
    promptNodeId: roles.gameAssetPrompt,
    imageNodeId: roles.gameAssetImage,
    modelNodeId: roles.gameAssetModel,
  };
}

/** Pure graph recipe; the store validates all connections before one commit. */
export function gameAssetBranches(concept, elements, nodes, sourceHandle) {
  const rightEdge = Math.max(
    0,
    ...nodes.map(
      (node) => (node.position?.x ?? 0) + getNodeVisualSize(node).width,
    ),
  );
  const promptX = rightEdge + COLUMN_GAP;
  const imageX =
    promptX + getNodeVisualSize({ type: NODE_TYPE.PROMPT }).width + COLUMN_GAP;
  const modelX =
    imageX + getNodeVisualSize({ type: NODE_TYPE.GENERATE }).width + COLUMN_GAP;
  const rowHeight =
    Math.max(
      ...[NODE_TYPE.PROMPT, NODE_TYPE.GENERATE, NODE_TYPE.API_3D].map(
        (type) => getNodeVisualSize({ type }).height,
      ),
    ) + ROW_GAP;
  const items = [];
  const connections = [];
  elements.forEach((element, index) => {
    const y = (concept.position?.y ?? 0) + index * rowHeight;
    const base = `game-asset-${element.key}`;
    const promptRef = `${base}-prompt`;
    const imageRef = `${base}-image`;
    const modelRef = `${base}-model`;
    const common = {
      workflowRootId: concept.id,
      assetElementKey: element.key,
    };
    items.push(
      {
        ref: promptRef,
        type: NODE_TYPE.PROMPT,
        position: { x: promptX, y },
        data: {
          ...common,
          workflowRole: "gameAssetPrompt",
          title: t("gameAssets.promptTitle", { name: element.name }),
          text: element.imagePrompt,
        },
      },
      {
        ref: imageRef,
        type: NODE_TYPE.GENERATE,
        position: { x: imageX, y },
        data: {
          ...common,
          workflowRole: "gameAssetImage",
          title: t("gameAssets.imageTitle", { name: element.name }),
          aspectRatio: "1:1",
          count: 1,
        },
      },
      {
        ref: modelRef,
        type: NODE_TYPE.API_3D,
        position: { x: modelX, y },
        data: {
          ...common,
          workflowRole: "gameAssetModel",
          title: t("gameAssets.modelTitle", { name: element.name }),
          prompt: element.modelPrompt,
        },
      },
    );
    connections.push(
      {
        source: concept.id,
        sourceHandle,
        target: imageRef,
        targetHandle: HANDLE.IMAGE,
      },
      {
        source: promptRef,
        sourceHandle: HANDLE.TEXT,
        target: imageRef,
        targetHandle: HANDLE.TEXT,
      },
      {
        source: imageRef,
        sourceHandle: HANDLE.IMAGE,
        target: modelRef,
        targetHandle: HANDLE.IMAGE,
      },
    );
  });
  return { items, connections };
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const nodes = store.nodes ?? [];
    const concept = nodes.find((node) => node.id === args.conceptNodeId);
    if (!concept) throw new Error(t("gameAssets.error.missingConcept"));
    const sourceHandle = conceptOutputHandle(concept);
    if (!sourceHandle) throw new Error(t("gameAssets.error.invalidSource"));
    if (!conceptHasImage(concept)) {
      throw new Error(t("gameAssets.error.conceptEmpty"));
    }
    if (
      !Array.isArray(args.elements) ||
      args.elements.length < 1 ||
      args.elements.length > MAX_GAME_ASSET_ELEMENTS
    ) {
      throw new Error(
        t("gameAssets.error.count", { count: MAX_GAME_ASSET_ELEMENTS }),
      );
    }
    const seen = new Set();
    const elements = args.elements.map((element) =>
      requireElement(element, seen),
    );
    const reused = [];
    const missing = [];
    for (const element of elements) {
      const branch = existingBranch(nodes, concept.id, element.key);
      if (branch) reused.push(branch);
      else missing.push(element);
    }
    if (missing.length === 0) {
      return { conceptNodeId: concept.id, created: [], reused };
    }
    if (typeof store.batchCreateNodes !== "function") {
      throw new Error(t("gameAssets.error.creationUnavailable"));
    }
    const { items, connections } = gameAssetBranches(
      concept,
      missing,
      nodes,
      sourceHandle,
    );
    const result = await store.batchCreateNodes(items, connections);
    if (!result?.nodes || result.nodes.length !== items.length) {
      throw new Error(t("gameAssets.error.creationIncomplete"));
    }
    const ids = new Map(
      items.map((item, index) => [item.ref, result.nodes[index].id]),
    );
    const created = missing.map((element) => ({
      key: element.key,
      promptNodeId: ids.get(`game-asset-${element.key}-prompt`),
      imageNodeId: ids.get(`game-asset-${element.key}-image`),
      modelNodeId: ids.get(`game-asset-${element.key}-model`),
    }));
    return { conceptNodeId: concept.id, created, reused };
  },

  presentCall(args) {
    return {
      title: t("agent.tool.buildGameAssets.call", {
        count: args.elements?.length ?? 0,
      }),
      icon: "workflow",
    };
  },

  presentResult(_args, result) {
    return {
      title: t("agent.tool.buildGameAssets.result", {
        count: result.created.length,
      }),
      status: "completed",
    };
  },
});
