import { callHost } from "../../rpc.js";
import { RPC } from "../../../shared/messages.js";
import { LOCAL_ENGINE_DEFAULT_MODEL_ID, PROVIDER_ID } from "../../../shared/providers.js";
import { PLATFORM_TARGET } from "../../generation_routes.js";
import { resolveRepaintRoute } from "../../editor/repaint_route.js";
import { MODEL_ROUTE_ID } from "../../../shared/model-routes.js";
import { reportRasterFallback } from "./raster-fallback-diagnostics.js";

/** Route helpers keep their public synchronous factories; provider reads load on use. */
export function resolveSelectionRepaintRoute({
  hasApiProvider,
  environment = {},
  providerId,
  modelId,
  platform = PLATFORM_TARGET.CHATGPT,
  executionMode,
}) {
  return resolveRepaintRoute({
    hasApiProvider,
    environment,
    providerId,
    modelId,
    platform,
    executionMode,
  });
}

export async function resolveRepaintChain(
  { routeId, providerId, modelId },
  { routeChain = editorRouteChain } = {},
) {
  if (providerId) {
    return {
      locked: true,
      chain: [
        {
          providerId,
          modelId:
            modelId ??
            (providerId === PROVIDER_ID.LOCAL
              ? LOCAL_ENGINE_DEFAULT_MODEL_ID
              : null),
        },
      ],
    };
  }
  return { locked: false, chain: await routeChain(routeId) };
}

export async function repaintChainReady({ locked, chain }) {
  if (chain.length === 0) return false;
  if (!locked) return true;
  const { providerId } = chain[0];
  return providerId === PROVIDER_ID.LOCAL || providerIsConfigured(providerId);
}

export async function editorRouteChain(routeId, providerId) {
  try {
    const { resolveCanvasModelRouteFallbackChain } = await import("../../model_route_resolver.js");
    return await resolveCanvasModelRouteFallbackChain(routeId, {
      lockedProviderId: providerId,
    });
  } catch (error) {
    // A resolver that cannot read storage is an empty chain, not a crash: the
    // action then reports the same actionable "no route" state as an empty one.
    reportRasterFallback("model-route-unavailable", error);
    return [];
  }
}

async function providerIsConfigured(providerId) {
  if (!providerId) return false;
  try {
    const { getProviderConfig } = await import("../../provider_client.js");
    const config = await getProviderConfig({ providerId });
    return Boolean(config?.configured);
  } catch (error) {
    reportRasterFallback("provider-config-unavailable", error);
    return false;
  }
}

export function makeSelectionRepaintPaint(
  {
    route,
    nodeId,
    settings,
    providerId,
    modelId,
    providers,
    routeId = MODEL_ROUTE_ID.REPAINT,
    platform = PLATFORM_TARGET.CHATGPT,
    onStatus,
    shouldStop,
  },
  {
    callHostImpl = callHost,
    loadRepaintLayer = () => import("../../editor/layer_repaint.js"),
  } = {},
) {
  if (route.route === "chat") {
    return async ({ dataUrl, prompt }) => {
      if (shouldStop?.()) throw new Error("stopped");
      const result = await callHostImpl(
        RPC.GENERATE,
        {
          nodeId,
          prompt,
          images: [dataUrl],
          timeoutMs: settings.timeoutMs,
          settleMs: settings.settleMs,
          autoScroll: settings.autoScroll,
        },
        {
          timeout: settings.timeoutMs + 30000,
          platform: route.platform ?? platform,
        },
      );
      if (shouldStop?.()) throw new Error("stopped");
      return result?.images?.[0] ?? null;
    };
  }
  if (route.route === "api") {
    return async ({ dataUrl, maskDataUrl, width, height, prompt }) => {
      const { repaintLayer } = await loadRepaintLayer();
      return repaintLayer({
        dataUrl,
        maskDataUrl,
        width,
        height,
        prompt,
        providerId,
        modelId,
        // A user's own pick locks to exactly that provider/model pair; without
        // one the resolved chain travels, so the action may degrade.
        providers: providerId ? undefined : providers,
        routeId,
        shouldStop,
        onStatus,
      });
    };
  }
  return null;
}
