import { t } from "../../../../shared/i18n.js";
import { RPC } from "../../../../shared/messages.js";
import { callHost, getEnvironment } from "../../../rpc.js";
import { chatAvailable } from "../../../editor/repaint_route.js";
import { EXECUTION_MODE, PLATFORM_TARGET } from "../../../nodes/node_enums.js";
import { repaintLayer } from "../../../editor/layer_repaint.js";
import {
  captureLayerImage,
  layerImageIdentity,
  layerImagePixelsMatch,
  prepareLayerEditResult,
  TRANSPARENT_LAYER_INSTRUCTION,
} from "../../../editor/layer-image-edit.js";
import { createToolError } from "./errors.js";
import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";

function editableTarget(store, nodeId, layerId) {
  const bridge = store.editorBridges?.[nodeId];
  if (!bridge?.engine || bridge.ready === false)
    throw createToolError(
      "EDITOR_NOT_OPEN",
      "Open the target Design before editing its image layer.",
    );
  const engine = bridge.engine;
  const layer = engine.getDocument()?.nodes.find((node) => node.id === layerId);
  if (layer?.kind !== "image")
    throw createToolError(
      "NO_EDITABLE_IMAGE",
      "The captured image layer no longer exists.",
    );
  if (layer.locked || layer.lockImagePixels)
    throw createToolError(
      "LAYER_LOCKED",
      "Unlock the target layer before editing its pixels.",
    );
  return { engine, layer };
}

async function paintImageLayer(args, source, context) {
  const prompt = source.hasTransparency
    ? `${args.prompt}\n\n${TRANSPARENT_LAYER_INSTRUCTION}`
    : args.prompt;
  if (
    args.executionMode === EXECUTION_MODE.CHAT ||
    (!args.executionMode && args.platform)
  ) {
    if (!chatAvailable(getEnvironment().mode))
      throw createToolError(
        "CAPABILITY_MISSING",
        "The requested website is unavailable in this environment. Ask the user which available route to use; do not switch to an API automatically.",
      );
    const settings = context.getStore().settings;
    const response = await callHost(
      RPC.GENERATE,
      {
        nodeId: args.nodeId,
        prompt,
        images: [source.dataUrl],
        timeoutMs: settings.timeoutMs,
        settleMs: settings.settleMs,
        autoScroll: settings.autoScroll,
      },
      {
        timeout: settings.timeoutMs + 30000,
        platform: args.platform ?? PLATFORM_TARGET.CHATGPT,
      },
    );
    const result = response?.images?.[0];
    if (!result)
      throw createToolError(
        "NODE_NO_RESULTS",
        "The requested website returned no image; the layer is unchanged.",
      );
    return result;
  }
  return repaintLayer({
    dataUrl: source.dataUrl,
    width: source.width,
    height: source.height,
    prompt,
    providerId: args.providerId,
    modelId: args.modelId,
    transparentBackground: source.hasTransparency,
    shouldStop: () => context.signal?.aborted === true,
  });
}

function assertNotAborted(context) {
  if (context.signal?.aborted)
    throw createToolError(
      "OPERATION_ABORTED",
      "The image edit was stopped; its result was not applied.",
    );
}

/** Injection is for contract tests; production always uses the configured route. */
export function createImageLayerEditTool({
  capture = captureLayerImage,
  paint = paintImageLayer,
  prepare = prepareLayerEditResult,
} = {}) {
  return createToolFromDescriptor(
    getWorkflowToolDefinition("edit_image_layer"),
    {
      async execute(args, context) {
        assertNotAborted(context);
        if (!args.prompt?.trim() || !args.nodeId || !args.layerId)
          throw createToolError(
            "ARGS_INVALID",
            "A design nodeId, layerId and edit prompt are required.",
          );
        if (args.modelId && !args.providerId)
          throw createToolError(
            "ARGS_INVALID",
            "Specify the providerId for an explicit modelId.",
          );
        const { engine } = editableTarget(
          context.getStore(),
          args.nodeId,
          args.layerId,
        );
        await engine.flushMasks?.();
        assertNotAborted(context);
        const source = capture(engine, args.layerId);
        const painted = await paint(args, source, context);
        assertNotAborted(context);
        const prepared = await prepare(source, painted);
        assertNotAborted(context);
        // Re-read the exact editor, not current selection: a later click must
        // neither retarget this request nor overwrite a concurrent pixel edit.
        const current = editableTarget(
          context.getStore(),
          args.nodeId,
          args.layerId,
        );
        if (current.engine !== engine)
          throw createToolError(
            "STALE_REVISION_CONFLICT",
            "The editor changed while editing; the generated result was not applied.",
          );
        const currentPixels = capture(current.engine, args.layerId, {
          encode: false,
        });
        if (
          layerImageIdentity(current.layer) !== source.sourceIdentity ||
          !layerImagePixelsMatch(source, currentPixels)
        )
          throw createToolError(
            "STALE_REVISION_CONFLICT",
            "The source image or mask changed while editing; the generated result was not applied.",
          );
        const changed = await engine.replaceNodeBitmap(
          args.layerId,
          prepared.dataUrl,
          {
            shouldApply: () => {
              try {
                const bridge = context.getStore().editorBridges?.[args.nodeId];
                const layer = engine
                  .getDocument()
                  ?.nodes.find((node) => node.id === args.layerId);
                return (
                  !context.signal?.aborted &&
                  bridge?.engine === engine &&
                  bridge.ready !== false &&
                  !layer?.locked &&
                  !layer?.lockImagePixels &&
                  layerImageIdentity(layer) === source.sourceIdentity &&
                  layerImagePixelsMatch(
                    source,
                    capture(engine, args.layerId, { encode: false }),
                  )
                );
              } catch {
                return false;
              }
            },
          },
        );
        if (!changed)
          throw createToolError(
            "STALE_REVISION_CONFLICT",
            "The layer could not accept the edit; no replacement was committed.",
          );
        return {
          ok: true,
          nodeId: args.nodeId,
          layerId: args.layerId,
          alphaMode: prepared.alphaMode,
        };
      },
      presentCall: () => ({
        title: t("agent.editorIntent.imageEdit"),
        icon: "sparkles",
      }),
      presentResult: (_args, result) => ({
        title: t(
          result?.alphaMode === "source"
            ? "agent.editorIntent.imageEditAlphaFallback"
            : "agent.editorIntent.imageEdited",
        ),
        status: "completed",
      }),
    },
  );
}

export default createImageLayerEditTool();
