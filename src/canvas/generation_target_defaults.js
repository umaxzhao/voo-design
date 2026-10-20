/**
 * Pure policy: prefer enabled, connected websites only for new generation.
 *
 * A failed platform-tab listing is passed in as `connectivityUnknown` and is
 * NOT the same as an empty listing — see the fall-through in
 * `resolveGenerationTarget` below.
 */
import {
  EXECUTION_MODE,
  NODE_TYPE,
  PLATFORM_TARGET,
} from "./nodes/node_enums.js";
import { PROVIDER_ID, TRIPO_WEB_MODEL_ID } from "../shared/providers.js";

// Keep the image order aligned with PlatformSelect's website list.
export const WEB_IMAGE_PLATFORMS = Object.freeze([
  PLATFORM_TARGET.CHATGPT,
  PLATFORM_TARGET.GEMINI,
  PLATFORM_TARGET.JIMENG,
  PLATFORM_TARGET.MIDJOURNEY,
]);
export const WEB_VIDEO_PLATFORMS = Object.freeze([
  PLATFORM_TARGET.GEMINI,
  PLATFORM_TARGET.JIMENG,
]);
export const WEB_MODEL_3D_PLATFORMS = Object.freeze([PLATFORM_TARGET.TRIPO]);

export function normalizePlatformList(input) {
  if (Array.isArray(input) || input instanceof Set) {
    return new Set([...input].map(normalizePlatformId).filter(Boolean));
  }
  if (input && typeof input === "object") {
    if (input.tabs || input.platforms)
      return normalizePlatformList(input.tabs || input.platforms);
    return normalizePlatformList(
      Object.keys(input).filter((key) => input[key]),
    );
  }
  return new Set();
}

/** The one shape a platform id has: trimmed, lowercase, or "" when absent. */
function normalizePlatformId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function generationMediaType(type) {
  // A storyboard's route renders its keyframes, so it defaults like an image node.
  if (
    type === "image" ||
    type === NODE_TYPE.GENERATE ||
    type === NODE_TYPE.STORYBOARD
  ) {
    return "image";
  }
  if (type === "video" || type === NODE_TYPE.VIDEO) return "video";
  if (["model3d", "3d", NODE_TYPE.API_3D].includes(type)) return "model3d";
  return null;
}

/**
 * Whether VOO may pick `platform` as the website to generate on.
 *
 * This is the ONE judgement about a website's availability, and every caller
 * reads it from here: the resolver below (automatic routing), the engine's
 * run-time target (`engine/executor_target.js`) and the agent's failure advice
 * (`components/agent-panel/tools/generation-route.js`, whose local
 * `canRunNow` is this same rule).
 *
 * It means exactly one thing: VOO holds an OPEN, ENABLED tab for that website.
 * It is deliberately NOT a claim that the website will work. Whether the user
 * is signed in, whether the composer is editable and whether a session is
 * already busy are only discoverable when the run reaches the page, and come
 * back as `loginRequired`, `composer-not-editable` or `webSessionBusy`. Copy
 * that puts a website in front of the user must therefore call it "open", not
 * "ready to run" — inventing a probe for the session here would be a promise
 * this module cannot keep.
 *
 * @param {string} platform
 * @param {{connectedPlatforms?: *, disabledSites?: *}} connectivity
 * @returns {boolean}
 */
export function platformHasOpenTab(
  platform,
  { connectedPlatforms = [], disabledSites = [] } = {},
) {
  return platformHasOpenTabIn(
    normalizePlatformId(platform),
    normalizePlatformList(connectedPlatforms),
    normalizePlatformList(disabledSites),
  );
}

/** Same rule on already-normalized sets, so a scan does not re-normalize. */
function platformHasOpenTabIn(platform, connected, disabled) {
  return (
    Boolean(platform) && connected.has(platform) && !disabled.has(platform)
  );
}

/**
 * Whether the user turned this website off ("Hidden" in Settings).
 *
 * The other half of `platformHasOpenTab`, exported on its own for the one
 * caller that asks the settings question alone: the engine's run-time target.
 */
export function platformIsTurnedOff(platform, disabledSites = []) {
  const id = normalizePlatformId(platform);
  return Boolean(id) && normalizePlatformList(disabledSites).has(id);
}

/** The first website in `candidates` VOO may use now, or null. */
export function firstAvailablePlatform(
  candidates,
  { connectedPlatforms = [], disabledSites = [] } = {},
) {
  const connected = normalizePlatformList(connectedPlatforms);
  const disabled = normalizePlatformList(disabledSites);
  return (
    candidates.find((id) => platformHasOpenTabIn(id, connected, disabled)) ??
    null
  );
}

/** Explicit routes are intent, even if their website is currently unavailable. */
export function resolveGenerationTarget({
  mediaType,
  connectedPlatforms = [],
  disabledSites = [],
  connectivityUnknown = false,
  fallback = {},
  overrides = {},
}) {
  const media = generationMediaType(mediaType);
  if (!media) return fallback;
  const is3d = media === "model3d";
  const api = {
    ...fallback,
    ...(!is3d && { executionMode: EXECUTION_MODE.API }),
  };
  const explicit = ["platform", "executionMode", "providerId", "modelId"].some(
    (key) => overrides[key] != null,
  );
  if (explicit) {
    if (is3d) {
      const web =
        overrides.platform === PLATFORM_TARGET.TRIPO ||
        overrides.providerId === PROVIDER_ID.TRIPO_WEB;
      return web && overrides.executionMode !== EXECUTION_MODE.API
        ? {
            ...api,
            providerId: PROVIDER_ID.TRIPO_WEB,
            modelId: TRIPO_WEB_MODEL_ID,
            ...overrides,
          }
        : { ...api, ...overrides };
    }
    return {
      ...api,
      ...(overrides.platform != null && { executionMode: EXECUTION_MODE.CHAT }),
      ...overrides,
    };
  }
  const candidates = is3d
    ? WEB_MODEL_3D_PLATFORMS
    : media === "video"
      ? WEB_VIDEO_PLATFORMS
      : WEB_IMAGE_PLATFORMS;
  const platform = firstAvailablePlatform(candidates, {
    connectedPlatforms,
    disabledSites,
  });
  if (!platform) {
    // "We could not ask which websites are open" is NOT "there is nothing
    // there". Falling through to `api` here would take the user's money on the
    // strength of a question we never got an answer to, so the target stays on
    // the website path and names no platform: the run resolves the page it
    // lands on (AUTO) or the web-owned account (Tripo), and whatever is really
    // wrong — no tab, not signed in — surfaces then, for free.
    //
    // An empty, KNOWN listing still falls through to `api`: the user genuinely
    // has no website open and the paid route is the only one left.
    //
    // For the image routes that `api` value is the shared route default, which
    // since docs/plan-qwen21-primary.md is the local engine. So "a new image
    // node defaults to local + Qwen Image 2.1" is exactly this branch: it holds
    // when no web platform is connected, while a web tab that is open still
    // wins the node (resolveNewGenerationTarget → here).
    if (!connectivityUnknown) return api;
    return is3d
      ? {
          ...api,
          providerId: PROVIDER_ID.TRIPO_WEB,
          modelId: TRIPO_WEB_MODEL_ID,
        }
      : {
          ...api,
          platform: PLATFORM_TARGET.AUTO,
          executionMode: EXECUTION_MODE.CHAT,
        };
  }
  return is3d
    ? {
        ...api,
        platform,
        providerId: PROVIDER_ID.TRIPO_WEB,
        modelId: TRIPO_WEB_MODEL_ID,
      }
    : { ...api, platform, executionMode: EXECUTION_MODE.CHAT };
}
