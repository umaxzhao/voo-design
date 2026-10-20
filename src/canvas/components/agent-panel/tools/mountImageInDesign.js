/** Attach an existing image result to a Design document as an editable layer. */
import { t } from "../../../../shared/i18n.js";
import { HANDLE, NODE_TYPE, nodeHasPort } from "../../../nodes/node_enums.js";
import { imageResultForConnection } from "../../../store/workflow_late_image_ingestion.js";
import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";

const def = getWorkflowToolDefinition("mount_image_in_design");

function imageSourceHandle(source) {
  if (source.type === NODE_TYPE.PREVIEW) {
    const isImage =
      source.data?.mediaType === "image" ||
      (!source.data?.mediaType && Boolean(source.data?.imageId));
    return isImage ? HANDLE.MEDIA : null;
  }
  return nodeHasPort(source, "source", HANDLE.IMAGE) ? HANDLE.IMAGE : null;
}

function layerPlacement(input, design) {
  const width =
    design.data?.editorDoc?.width ?? design.data?.layoutWidth ?? 1024;
  const height =
    design.data?.editorDoc?.height ?? design.data?.layoutHeight ?? 1024;
  const placement = input ?? { x: 0, y: 0, width, height };
  if (
    !placement ||
    typeof placement !== "object" ||
    Array.isArray(placement) ||
    ["x", "y", "width", "height"].some(
      (key) => !Number.isFinite(placement[key]),
    ) ||
    placement.x < 0 ||
    placement.y < 0 ||
    placement.width <= 0 ||
    placement.height <= 0 ||
    placement.x + placement.width > width ||
    placement.y + placement.height > height ||
    (placement.name !== undefined && typeof placement.name !== "string")
  ) {
    throw new Error(t("designAssets.error.invalidPlacement"));
  }
  return {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    name: placement.name?.trim() || t("designAssets.defaultLayerName"),
  };
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const nodes = store.nodes ?? [];
    const source = nodes.find((node) => node.id === args.sourceNodeId);
    const design = nodes.find((node) => node.id === args.designNodeId);
    if (!source || design?.type !== NODE_TYPE.IMAGE_EDITOR) {
      throw new Error(t("designAssets.error.invalidNodes"));
    }
    const sourceHandle = imageSourceHandle(source);
    if (!sourceHandle) throw new Error(t("designAssets.error.invalidSource"));
    const connection = {
      source: source.id,
      target: design.id,
      sourceHandle,
      targetHandle: HANDLE.MEDIA,
    };
    const imageId = imageResultForConnection(nodes, connection);
    if (!imageId) throw new Error(t("designAssets.error.noImage"));
    const placement = layerPlacement(args.placement, design);
    const existingEdge = (store.edges ?? []).find(
      (edge) =>
        edge.source === source.id &&
        edge.target === design.id &&
        edge.sourceHandle === sourceHandle &&
        edge.targetHandle === HANDLE.MEDIA,
    );
    if (existingEdge) {
      const existingPlacement = existingEdge.data?.imagePlacement;
      if (
        !existingPlacement ||
        (args.placement &&
          ["x", "y", "width", "height"].some(
            (key) => existingPlacement[key] !== placement[key],
          ))
      ) {
        throw new Error(t("designAssets.error.alreadyConnected"));
      }
      if (store.refreshMountedImage(source.id, design.id, imageId) !== true) {
        throw new Error(t("designAssets.error.mountIncomplete"));
      }
      const mounted = context
        .getStore()
        .nodes.find((node) => node.id === design.id)
        ?.data?.editorDoc?.nodes?.find(
          (layer) =>
            layer.sourceWorkflowNodeId === source.id &&
            layer.imageId === imageId,
        );
      if (!mounted) throw new Error(t("designAssets.error.mountIncomplete"));
      return {
        sourceNodeId: source.id,
        designNodeId: design.id,
        imageId,
        layerId: mounted.id,
        reused: true,
      };
    }
    if (
      store.onConnect({
        ...connection,
        data: { imagePlacement: placement },
      }) !== true
    ) {
      throw new Error(t("designAssets.error.connectionRefused"));
    }
    const mounted = context
      .getStore()
      .nodes.find((node) => node.id === design.id)
      ?.data?.editorDoc?.nodes?.find(
        (layer) =>
          layer.sourceWorkflowNodeId === source.id && layer.imageId === imageId,
      );
    if (!mounted) throw new Error(t("designAssets.error.mountIncomplete"));
    return {
      sourceNodeId: source.id,
      designNodeId: design.id,
      imageId,
      layerId: mounted.id,
      reused: false,
    };
  },

  presentCall() {
    return { title: t("designAssets.mountCall"), icon: "layout" };
  },

  presentResult() {
    return {
      title: t("designAssets.mountResult"),
      status: "completed",
    };
  },
});
