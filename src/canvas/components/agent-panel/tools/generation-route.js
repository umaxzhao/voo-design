import { EXECUTION_MODE } from "../../../nodes/node_enums.js";
import {
  generationMediaType,
  normalizePlatformList,
  WEB_IMAGE_PLATFORMS,
  WEB_MODEL_3D_PLATFORMS,
  WEB_VIDEO_PLATFORMS,
} from "../../../generation_target_defaults.js";
import { getConnectedPlatforms } from "../../../generation-target-state.js";
import { getSetting } from "../../../../shared/settings.js";
import {
  getModelRouteSelection,
  MODEL_ROUTE_ID,
} from "../../../../shared/model-routes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";

/** An explicit website overrides API routing; omission preserves node defaults. */
export function generationDataPatch(args) {
  return {
    prompt: args.prompt,
    ...(args.platform != null && {
      platform: args.platform,
      executionMode: EXECUTION_MODE.CHAT,
    }),
    ...(args.executionMode != null && {
      executionMode: args.executionMode,
    }),
  };
}

/** Read a fresh store snapshot so receipts describe the route actually saved. */
export function generationRouteReceipt(context, nodeId) {
  const node = context.getStore().nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    throw createToolError(
      TOOL_ERROR_CODE.NODE_NOT_FOUND,
      `Created generation node not found: ${nodeId}`,
    );
  }
  const { platform, executionMode, providerId, modelId } = node.data;
  return { platform, executionMode, providerId, modelId };
}

const ROUTE_BY_MEDIA = Object.freeze({
  image: MODEL_ROUTE_ID.IMAGE_GENERATION,
  video: MODEL_ROUTE_ID.VIDEO_GENERATION,
  model3d: MODEL_ROUTE_ID.MODEL_3D_GENERATION,
});

const WEB_PLATFORMS_BY_MEDIA = Object.freeze({
  image: WEB_IMAGE_PLATFORMS,
  video: WEB_VIDEO_PLATFORMS,
  model3d: WEB_MODEL_3D_PLATFORMS,
});

/**
 * Model-facing policy for a failed website generation. Kept as one exported
 * constant so the tool descriptions, the system prompt and the failure receipt
 * cannot drift into three different contracts.
 */
export const WEB_GENERATION_FAILURE_INSTRUCTION =
  "The website generation failed. Do not reroute it to an API model on your own: ask the user which model to use with request_user_input, offering the configured API route and only the websites that can run right now (webGenerationAdvice.readyNow — a website under needsConnection has no open tab or is turned off), then set platform/executionMode (or providerId) explicitly and re-run.";

/**
 * Connectivity as the resolver's callers read it: the adapter's read-only
 * snapshot plus the sites the user turned off. Reading both from their owners
 * keeps this module free of a second connectivity truth.
 */
function readConnectivity() {
  return {
    connectedPlatforms: getConnectedPlatforms(),
    disabledSites: getSetting("ciw.disabledSitePlatforms") ?? [],
  };
}

/**
 * Facts that make a website failure askable.
 *
 * A bare "generation failed" leaves the agent nothing to offer, so this names
 * the platform that failed, why the attempt is worth resuming, and the routes
 * the user can switch to. Returns null unless the node actually failed on a
 * website attempt — API failures and successful runs keep their plain result
 * and must not be dressed up as a routing decision.
 *
 * Only websites that are connected AND enabled are offered: an option the user
 * cannot execute sends them into a second failure, which is worse than not
 * asking at all. Sites that serve the media but cannot run now are reported
 * apart, and the API route is always a real option.
 *
 * @param {Object} options
 * @param {string} options.nodeId - The node that failed.
 * @param {Object} options.data - That node's data.
 * @param {string} [options.nodeType] - Node type; selects the API route to offer.
 * @param {(routeId: string) => Object|null} [options.routeSelection] - Test seam.
 * @param {() => {connectedPlatforms?: *, disabledSites?: *}} [options.connectivity] - Test seam.
 * @returns {Object|null}
 */
export function webGenerationAdvice({
  nodeId,
  data,
  nodeType,
  routeSelection = getModelRouteSelection,
  connectivity = readConnectivity,
}) {
  const status = data?.status;
  if (status !== "error" && status !== "failed") return null;
  // data.platform survives failures the transport never sent (loginRequired,
  // composer-not-editable, …) where the durable webGeneration record is
  // cleared; webGeneration.platform covers a node whose route was not written
  // onto its data. Read both so the failed website is never lost.
  const platform = data?.platform ?? data?.webGeneration?.platform ?? null;
  const isWebAttempt =
    platform != null ||
    data?.webGeneration != null ||
    data?.executionMode === EXECUTION_MODE.CHAT;
  if (!isWebAttempt) return null;

  const mediaType = generationMediaType(nodeType);
  const routeId = ROUTE_BY_MEDIA[mediaType] ?? null;
  const candidates = WEB_PLATFORMS_BY_MEDIA[mediaType] ?? [];
  const apiRoute = routeId ? routeSelection(routeId) : null;
  const { connectedPlatforms, disabledSites } = connectivity();
  const connected = normalizePlatformList(connectedPlatforms);
  const disabled = normalizePlatformList(disabledSites);
  const canRunNow = (id) => connected.has(id) && !disabled.has(id);
  // Every media-serving website the browser currently holds a usable tab for.
  const readyNow = candidates.filter(canRunNow);
  // Serves this media, cannot run now: the user has to open its tab (or turn it
  // back on). Never an option, always the explanation for why it is missing.
  const needsConnection = candidates.filter(
    (id) => id !== platform && !canRunNow(id),
  );
  const failedPlatformConnected = platform != null && canRunNow(platform);
  const noWebsiteConnected = readyNow.length === 0;
  return {
    nodeId,
    failedPlatform: platform,
    failedPlatformConnected,
    mediaType,
    // The user's own configured route — a concrete provider and model to offer.
    apiRoute,
    readyNow,
    needsConnection,
    noWebsiteConnected,
    askWith: "request_user_input",
    // Ready to pass straight to request_user_input.options, so the question is
    // a choice between real models rather than "which model?" with nothing to
    // pick. Retrying the website stays on the list while its tab is still
    // open: a failure is often transitory.
    options: buildFailureOptions({
      platform,
      failedPlatformConnected,
      readyNow,
      apiRoute,
    }),
    instruction: WEB_GENERATION_FAILURE_INSTRUCTION,
  };
}

/** Readable choices for the model to put in front of the user. */
function buildFailureOptions({
  platform,
  failedPlatformConnected,
  readyNow,
  apiRoute,
}) {
  const options = [];
  if (platform && failedPlatformConnected) {
    options.push(`${platform} (try the website again)`);
  }
  // Only websites that can run now — the failed platform is already offered
  // above as a retry rather than twice.
  options.push(...readyNow.filter((id) => id !== platform));
  if (apiRoute?.providerId && apiRoute?.modelId) {
    options.push(`${apiRoute.providerId} / ${apiRoute.modelId}`);
  }
  return options;
}
