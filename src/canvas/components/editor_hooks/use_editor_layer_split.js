/**
 * Hook providing the AI Layer Split action for the design editor.
 *
 * Drives the ChatGPT web session (or connected vision platform) to analyze
 * a selected flattened image, extract its text and visual elements, and
 * reconstruct them as editable layers with an inpainted background.
 */
import { useCallback, useState } from "react";
import { callHost } from "../../rpc.js";
import { RPC } from "../../../shared/messages.js";
import { PLATFORM_TARGET } from "../../generation_routes.js";
import { getImageDataUrl } from "../../store/db.js";
import {
  CAPABILITY,
  isCapabilitySupported,
} from "../../platform_capabilities.js";
import {
  SPLIT_LAYERS_PROMPT,
  parseLayerSplitResponse,
  decomposeImageToLayers,
} from "../../editor/layer_split.js";
import { captureError } from "../../../shared/error_collector.js";

export function useEditorLayerSplit({ engine, selected }) {
  const [splitLayersBusy, setSplitLayersBusy] = useState(false);
  const [splitLayersError, setSplitLayersError] = useState(null);
  // The consumer renders this as a visible alert toast; clearing is explicit
  // so the toast can auto-dismiss without the hook owning a timer.
  const clearSplitLayersError = useCallback(
    () => setSplitLayersError(null),
    [],
  );
  const canSplitLayers = isCapabilitySupported(CAPABILITY.AI_LAYER_SPLIT);

  const splitLayers = useCallback(
    async (targetNode = null) => {
      if (!isCapabilitySupported(CAPABILITY.AI_LAYER_SPLIT)) {
        setSplitLayersError("extensionRequired");
        return { ok: false, error: "extensionRequired" };
      }

      const node = targetNode || selected || engine?.getSelected?.();
      if (!engine || !node || node.kind !== "image" || splitLayersBusy) {
        return { ok: false, error: "invalidTarget" };
      }

      setSplitLayersBusy(true);
      setSplitLayersError(null);

      try {
        // 1. Resolve image data URL for transfer to the host platform tab
        let imageDataUrl = null;
        if (node.imageId) {
          imageDataUrl = await getImageDataUrl(node.imageId).catch(() => null);
        }
        if (!imageDataUrl && engine.exportNodePng) {
          imageDataUrl = engine.exportNodePng(node.id);
        }
        if (
          !imageDataUrl &&
          typeof node.src === "string" &&
          node.src.startsWith("data:")
        ) {
          imageDataUrl = node.src;
        }
        if (
          !imageDataUrl &&
          typeof node.dataUrl === "string" &&
          node.dataUrl.startsWith("data:")
        ) {
          imageDataUrl = node.dataUrl;
        }

        if (!imageDataUrl) {
          throw new Error("imageSourceMissing");
        }

        // 2. Query ChatGPT via Web Session bridge
        const result = await callHost(
          RPC.REVERSE_PROMPT,
          {
            nodeId: node.id,
            prompt: SPLIT_LAYERS_PROMPT,
            images: [imageDataUrl],
            timeoutMs: 300000,
            settleMs: 1500,
          },
          {
            timeout: 330000,
            platform: PLATFORM_TARGET.CHATGPT,
          },
        );

        if (typeof result?.text !== "string" || !result.text.trim()) {
          throw new Error("emptyResponse");
        }

        // 3. Parse structured layer breakdown
        const layers = parseLayerSplitResponse(result.text);
        if (!layers || layers.length === 0) {
          throw new Error("noLayersIdentified");
        }

        // 4. Decompose image into editable document layers
        const outcome = await decomposeImageToLayers({
          engine,
          node,
          layers,
        });

        if (!outcome.ok) {
          throw new Error(outcome.error || "decomposeFailed");
        }

        return outcome;
      } catch (err) {
        console.error("splitLayers error:", err);
        captureError({
          error: err,
          source: "editor:split_layers",
          code: err?.message || "split_layers_failed",
        });
        setSplitLayersError(err?.message || "splitFailed");
        return { ok: false, error: err?.message };
      } finally {
        setSplitLayersBusy(false);
      }
    },
    [engine, selected, splitLayersBusy],
  );

  return {
    splitLayers,
    splitLayersBusy,
    splitLayersError,
    clearSplitLayersError,
    splitLayersAvailable: canSplitLayers,
  };
}
