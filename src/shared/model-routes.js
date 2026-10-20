import { getSetting, getSettingAsync, setSetting } from "./settings.js";
import {
  API_MEDIA_TYPE,
  DEFAULT_API_3D_MODEL_ID,
  DEFAULT_API_AUDIO_MODEL_ID,
  DEFAULT_API_IMAGE_MODEL_ID,
  DEFAULT_API_VIDEO_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  LOCAL_ENGINE_DEFAULT_MODEL_ID,
  PROVIDER_ID,
} from "./providers.js";
import { PERFORMANCE_TIER } from "./performance-tier.js";
import { isCustomProviderId } from "./custom_providers.js";

export const MODEL_ROUTES_KEY = "voo.modelRoutes";
export const AUTOMATIC_MODEL_ROUTE = "auto";
export const LOCAL_BUILTIN_PROVIDER_ID = "local-builtin";

export const MODEL_ROUTE_ID = {
  IMAGE_GENERATION: "image-generation",
  VIDEO_GENERATION: "video-generation",
  AUDIO_GENERATION: "audio-generation",
  MODEL_3D_GENERATION: "model3d-generation",
  EDITOR_IMAGE: "editor-image",
  REPAINT: "repaint",
  OUTPAINT: "outpaint",
  SELECTION_REPAINT: "selection-repaint",
  MATTING: "matting",
  OBJECT_SELECTION: "object-selection",
};

const IMAGE_PROVIDERS = [
  PROVIDER_ID.LOCAL,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.AI_302,
  PROVIDER_ID.VOLCENGINE,
  PROVIDER_ID.ZHIPU,
  PROVIDER_ID.CHATGPT,
  PROVIDER_ID.GEMINI,
];

const VIDEO_PROVIDERS = [
  PROVIDER_ID.LOCAL,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.AI_302,
  PROVIDER_ID.VOLCENGINE,
  PROVIDER_ID.ZHIPU,
  PROVIDER_ID.GEMINI,
];

const IMAGE_EDIT_PROVIDERS = [
  PROVIDER_ID.LOCAL,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.AI_302,
];

const MODEL_3D_PROVIDERS = [
  PROVIDER_ID.LOCAL,
  PROVIDER_ID.DASHSCOPE,
  PROVIDER_ID.AI_302,
  PROVIDER_ID.TRIPO_WEB,
];

export const MODEL_ROUTE_DEFINITIONS = {
  [MODEL_ROUTE_ID.IMAGE_GENERATION]: {
    mediaType: API_MEDIA_TYPE.IMAGE,
    providers: IMAGE_PROVIDERS,
    capability: "image-generation",
  },
  [MODEL_ROUTE_ID.VIDEO_GENERATION]: {
    mediaType: API_MEDIA_TYPE.VIDEO,
    providers: VIDEO_PROVIDERS,
  },
  [MODEL_ROUTE_ID.AUDIO_GENERATION]: {
    mediaType: API_MEDIA_TYPE.AUDIO,
    providers: [PROVIDER_ID.AI_302],
  },
  [MODEL_ROUTE_ID.MODEL_3D_GENERATION]: {
    mediaType: API_MEDIA_TYPE.MODEL_3D,
    providers: MODEL_3D_PROVIDERS,
  },
  [MODEL_ROUTE_ID.EDITOR_IMAGE]: {
    mediaType: API_MEDIA_TYPE.IMAGE,
    providers: IMAGE_EDIT_PROVIDERS,
    capability: "image-edit",
  },
  [MODEL_ROUTE_ID.REPAINT]: {
    mediaType: API_MEDIA_TYPE.IMAGE,
    providers: IMAGE_EDIT_PROVIDERS,
    capability: "image-edit",
    inherits: MODEL_ROUTE_ID.EDITOR_IMAGE,
  },
  [MODEL_ROUTE_ID.OUTPAINT]: {
    mediaType: API_MEDIA_TYPE.IMAGE,
    providers: IMAGE_EDIT_PROVIDERS,
    capability: "image-edit",
    inherits: MODEL_ROUTE_ID.EDITOR_IMAGE,
  },
  [MODEL_ROUTE_ID.SELECTION_REPAINT]: {
    mediaType: API_MEDIA_TYPE.IMAGE,
    providers: IMAGE_EDIT_PROVIDERS,
    capability: "image-edit",
    inherits: MODEL_ROUTE_ID.EDITOR_IMAGE,
  },
  [MODEL_ROUTE_ID.MATTING]: {
    mediaType: "matting",
    providers: [LOCAL_BUILTIN_PROVIDER_ID],
  },
  [MODEL_ROUTE_ID.OBJECT_SELECTION]: {
    mediaType: "segmentation",
    providers: [LOCAL_BUILTIN_PROVIDER_ID],
  },
};

/**
 * Built-in media routes apply to new work; saved per-route choices take priority.
 *
 * The two image routes start on the local engine's Qwen Image 2.1: it is the
 * only model here that both generates and edits, it costs nothing per call, and
 * it is already the first candidate in both provider lists below. Video and
 * audio stay on DEFAULT_PROVIDER_ID: 302.AI is the only gateway for audio, and
 * video's local backend is a preset choice, not the out-of-the-box
 * default — a fresh install with no preset still wants the hosted model.
 *
 * `LOCAL_ENGINE_DEFAULT_MODEL_ID` (not the engine's reported file stem) is the
 * id here: see §4 of docs/plan-qwen21-primary.md.
 */
export const DEFAULT_MODEL_ROUTES = Object.freeze({
  [MODEL_ROUTE_ID.IMAGE_GENERATION]: Object.freeze({
    providerId: PROVIDER_ID.LOCAL,
    modelId: LOCAL_ENGINE_DEFAULT_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.VIDEO_GENERATION]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_VIDEO_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.AUDIO_GENERATION]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_AUDIO_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.MODEL_3D_GENERATION]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_3D_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.EDITOR_IMAGE]: Object.freeze({
    providerId: PROVIDER_ID.LOCAL,
    modelId: LOCAL_ENGINE_DEFAULT_MODEL_ID,
  }),
});

export const SETTINGS_DEFAULT_ROUTES = Object.freeze([
  {
    id: MODEL_ROUTE_ID.IMAGE_GENERATION,
    labelKey: "settings.modelRoutes.image-generation",
  },
  {
    id: MODEL_ROUTE_ID.VIDEO_GENERATION,
    labelKey: "settings.modelRoutes.video-generation",
  },
  {
    id: MODEL_ROUTE_ID.AUDIO_GENERATION,
    labelKey: "settings.modelRoutes.audio-generation",
  },
  {
    id: MODEL_ROUTE_ID.MODEL_3D_GENERATION,
    labelKey: "settings.modelRoutes.model3d-generation",
  },
  {
    id: MODEL_ROUTE_ID.EDITOR_IMAGE,
    labelKey: "settings.modelRoutes.editor-image",
  },
]);

export function getDefaultModelRoute(routeId) {
  return DEFAULT_MODEL_ROUTES[routeId] ?? null;
}

export function modelRouteDefinition(routeId) {
  return MODEL_ROUTE_DEFINITIONS[routeId] ?? null;
}

export function getStoredModelRoutes() {
  const stored = getSetting(MODEL_ROUTES_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

export async function getStoredModelRoutesAsync() {
  const stored = await getSettingAsync(MODEL_ROUTES_KEY).catch(() => null);
  return stored && typeof stored === "object" ? stored : {};
}

export function routeSelectionFrom(routes, routeId) {
  const definition = modelRouteDefinition(routeId);
  const own = routes?.[routeId];
  if (
    own?.providerId &&
    own.providerId !== AUTOMATIC_MODEL_ROUTE &&
    (isCustomProviderId(own.providerId) ||
      definition?.providers?.includes(own.providerId))
  ) {
    return own;
  }
  if (definition?.inherits) {
    return routeSelectionFrom(routes, definition.inherits);
  }
  return getDefaultModelRoute(routeId);
}

/**
 * Whether the stored routes name a provider for this route on purpose.
 *
 * The mirror image of {@link routeSelectionFrom}'s first branch: an absent entry
 * and an `auto` entry both mean "follow the built-in default", everything else
 * is the user's own choice. Callers that would otherwise second-guess a
 * resolved selection by replacing it (an https page cannot reach the local
 * engine at all) use this to leave a deliberate choice alone.
 */
export function hasExplicitModelRoute(
  routeId,
  routes = getStoredModelRoutes(),
) {
  const definition = modelRouteDefinition(routeId);
  const own = routes?.[routeId];
  if (
    own?.providerId &&
    own.providerId !== AUTOMATIC_MODEL_ROUTE &&
    (isCustomProviderId(own.providerId) ||
      definition?.providers?.includes(own.providerId))
  ) {
    return true;
  }
  if (definition?.inherits) {
    return hasExplicitModelRoute(definition.inherits, routes);
  }
  return false;
}

export function getModelRouteSelection(routeId) {
  return routeSelectionFrom(getStoredModelRoutes(), routeId);
}

export async function setModelRoute(routeId, selection) {
  if (!modelRouteDefinition(routeId)) throw new Error("modelRouteUnknown");
  const current = await getStoredModelRoutesAsync();
  const next = {
    ...current,
    [routeId]: {
      providerId: selection?.providerId || AUTOMATIC_MODEL_ROUTE,
      modelId: selection?.modelId || null,
    },
  };
  await setSetting(MODEL_ROUTES_KEY, next);
  return next[routeId];
}

// ------------------------------------------------------- performance tier ---
//
// Which default an *undecided* route resolves to can depend on what the machine
// can actually run: a machine that cannot serve the local engine should not
// start every image node on a provider it has to install first
// (docs/plan-performance-tier.md). The tier is therefore read here, next to the
// route table it modifies, and consumed by `node_factory.routedDefaults`.
//
// Two rules the contract fixes and this code keeps:
//   * a tier NEVER writes `voo.modelRoutes` — an explicit route wins over any
//     tier, byte for byte (§3.3);
//   * only the low tier changes an answer (C → the cloud default). A, B and an
//     unmeasurable machine all keep today's local default, so an unknown probe
//     can never quietly move a user onto a paid provider (§2.2).

/** The user's own pin: `"auto"` (or absent) / `"a"` / `"b"` / `"c"`. */
export const PERFORMANCE_TIER_KEY = "voo.performanceTier";
/** The probe's cache: `{ tier, signals, unknownSignals, probedAt }`. */
export const PERFORMANCE_TIER_DETECTED_KEY = "voo.performanceTierDetected";
export const AUTOMATIC_PERFORMANCE_TIER = "auto";

/** The tiers a user may pin explicitly. `unknown` is not selectable. */
export const USER_SELECTABLE_PERFORMANCE_TIERS = Object.freeze([
  PERFORMANCE_TIER.HIGH,
  PERFORMANCE_TIER.MID,
  PERFORMANCE_TIER.LOW,
]);

/**
 * The cloud pair the low tier falls back to.
 *
 * Field-for-field the same value as the migration's frozen historical default
 * and the account path's cloud map — tests/model_routes.test.js asserts the
 * three agree, because a drifted copy here would silently generate on a model
 * nobody chose.
 */
export const PERFORMANCE_TIER_CLOUD_ROUTE = Object.freeze({
  providerId: DEFAULT_PROVIDER_ID,
  modelId: DEFAULT_API_IMAGE_MODEL_ID,
});

/** The routes a tier is allowed to decide. Everything else ignores it. */
export const PERFORMANCE_TIER_ROUTE_IDS = Object.freeze([
  MODEL_ROUTE_ID.IMAGE_GENERATION,
  MODEL_ROUTE_ID.EDITOR_IMAGE,
]);

/** The middle tier's local budget (contract §3.2). */
export const LOCAL_MID_REQUEST_BUDGET = Object.freeze({
  maxEdgePx: 512,
  maxSteps: 20,
  warn: true,
});

/** Qwen Image's requested output edge; other local edit budgets stay separate. */
export const LOCAL_QWEN_IMAGE_MAX_EDGE_PX = 1024;

function knownTier(value) {
  return USER_SELECTABLE_PERFORMANCE_TIERS.includes(value) ? value : null;
}

/**
 * Which tier is in force, and why.
 *
 * A user's pin always wins; otherwise the probe's answer is used; otherwise the
 * tier is `"unknown"`, which behaves exactly like the middle tier everywhere it
 * is consumed (§5.1).
 *
 * @param {{ userTier?: string, detectedTier?: string }} [input]
 * @returns {{ tier: string, source: "user"|"auto"|"unknown", userTier: string|null, detectedTier: string|null }}
 */
export function effectivePerformanceTier({ userTier, detectedTier } = {}) {
  const pinned = knownTier(userTier);
  if (pinned !== null) {
    return {
      tier: pinned,
      source: "user",
      userTier: pinned,
      detectedTier: knownTier(detectedTier),
    };
  }
  const detected =
    detectedTier === PERFORMANCE_TIER.UNKNOWN
      ? PERFORMANCE_TIER.UNKNOWN
      : knownTier(detectedTier);
  if (detected !== null) {
    return {
      tier: detected,
      source: "auto",
      userTier: null,
      detectedTier: detected,
    };
  }
  return {
    tier: PERFORMANCE_TIER.UNKNOWN,
    source: "unknown",
    userTier: null,
    detectedTier: null,
  };
}

/**
 * Synchronous read of one tier key.
 *
 * `getSetting` is the settings cache, which is only seeded at boot for the keys
 * listed in `STORAGE_KEYS` (settings.js) — these two are not among them yet, so
 * a pin written last session would be missing from a fresh cache. The
 * localStorage mirror is written by `setSetting` for every key, so it is read
 * here as the fallback. Once the keys are registered in `STORAGE_KEYS` this
 * branch simply stops being taken.
 */
function readTierSetting(key) {
  const cached = getSetting(key);
  if (cached !== null && cached !== undefined) return cached;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Values written before the mirror held JSON were plain strings.
      return raw;
    }
  } catch {
    return null;
  }
}

/**
 * The tier in force right now, read synchronously (new nodes are created sync).
 *
 * Carries the probe's raw payload as `detected` (signals and all) so the
 * settings card can show the evidence behind the tier — `getSetting` is a plain
 * cache read, so this stays cheap.
 */
export function getPerformanceTier() {
  const userTier = readTierSetting(PERFORMANCE_TIER_KEY);
  const detected = readTierSetting(PERFORMANCE_TIER_DETECTED_KEY);
  const snapshot = effectivePerformanceTier({
    userTier: userTier === AUTOMATIC_PERFORMANCE_TIER ? null : userTier,
    detectedTier:
      typeof detected === "string" ? detected : (detected?.tier ?? null),
  });
  return {
    ...snapshot,
    detected: detected && typeof detected === "object" ? detected : null,
  };
}

/**
 * Writes the user's pin. Only the three named tiers and `"auto"` are accepted;
 * anything else throws rather than storing a value the reader would ignore.
 */
export async function setPerformanceTier(tier) {
  const value =
    tier === AUTOMATIC_PERFORMANCE_TIER
      ? AUTOMATIC_PERFORMANCE_TIER
      : knownTier(tier);
  if (value === null) throw new Error("performanceTierUnknown");
  await setSetting(PERFORMANCE_TIER_KEY, value);
  return value;
}

/**
 * The route a tier forces for a route the user has not decided, or null.
 *
 * Only the low tier forces anything, and only for the two image routes: the
 * workflow never advances an undecided image node onto the local engine when
 * the machine cannot run it. The editor's own chain resolves through
 * `model_route_resolver.js`, which is a separate change.
 */
export function performanceTierRouteSelection(
  routeId,
  tier = getPerformanceTier().tier,
) {
  if (!PERFORMANCE_TIER_ROUTE_IDS.includes(routeId)) return null;
  if (tier !== PERFORMANCE_TIER.LOW) return null;
  return { ...PERFORMANCE_TIER_CLOUD_ROUTE };
}

/**
 * The local request budget a tier allows, or null for "no budget".
 *
 * A injects nothing — A is defined as today's behaviour. B and an unmeasured
 * machine cap the request at 512 px on the long edge and 20 sampling steps
 * (§3.2). C carries the same budget even though it does not default to local:
 * a user on a weak machine who picks local anyway still runs it there (the
 * engine works, it is just slow), and that request needs the same ceiling.
 * The value is exported so the settings copy and the request-shaping call sites
 * read the same numbers.
 */
export function localRequestBudget(tier = getPerformanceTier().tier) {
  return tier === PERFORMANCE_TIER.HIGH ? null : LOCAL_MID_REQUEST_BUDGET;
}

/** Restricts edit pickers to models whose adapters accept a source image. */
export function modelSupportsRoute(routeId, providerId, model) {
  const definition = modelRouteDefinition(routeId);
  if (definition?.capability === "image-generation") {
    return !Array.isArray(model?.capabilities)
      ? true
      : model.capabilities.includes("image-generation");
  }
  if (definition?.capability !== "image-edit") return true;
  if (model?.capabilities?.includes("image-edit")) return true;
  const id = String(model?.id ?? model ?? "").toLowerCase();
  if (providerId === PROVIDER_ID.LOCAL) {
    // Qwen Image 2.1 generates and edits in one model, so its catalogue id
    // ("qwen-image-2.1-q4") belongs in the edit pickers as much as a Qwen
    // Image Edit file the user adds does. The engine reports its weights as a file stem
    // ("qwen_image_2.1-Q4_K"), so compare with separators normalised.
    const normalised = id.replace(/_/g, "-");
    return (
      normalised.includes("qwen-image-edit") ||
      normalised.includes("qwen-image-2.1")
    );
  }
  if (providerId === PROVIDER_ID.DASHSCOPE) return id.includes("qwen-image");
  if (providerId === PROVIDER_ID.AI_302) {
    return ["edit", "qwen-image", "gpt-image", "gemini", "seedream"].some(
      (token) => id.includes(token),
    );
  }
  return false;
}

export const DEFAULT_MAX_FALLBACK_ATTEMPTS = 3;

/**
 * Plans a model fallback chain.
 *
 * When `lockedProviderId` is set to a specific provider (not "auto"), the chain length is 1:
 * explicit user selection locks the provider and disables degradation.
 * When "auto" or omitted, candidates are returned in priority order, limited to `maxAttempts` (default 3).
 *
 * @param {Array<{ providerId?: string, modelId?: string }|string>} candidates
 * @param {{ lockedProviderId?: string|null, maxAttempts?: number }} [options]
 * @returns {Array<{ providerId?: string, modelId?: string }|any>}
 */
export function planFallbackChain(candidates, options = {}) {
  const { lockedProviderId, maxAttempts = DEFAULT_MAX_FALLBACK_ATTEMPTS } =
    options;
  const safeCandidates = Array.isArray(candidates)
    ? candidates.filter(Boolean)
    : [];

  const isLocked =
    Boolean(lockedProviderId) && lockedProviderId !== AUTOMATIC_MODEL_ROUTE;

  if (isLocked) {
    const match = safeCandidates.find(
      (c) => (c?.providerId ?? c?.id ?? c) === lockedProviderId,
    );
    if (match) {
      return [match];
    }
    return typeof lockedProviderId === "object"
      ? [lockedProviderId]
      : [{ providerId: lockedProviderId }];
  }

  const seen = new Set();
  const unique = [];
  for (const c of safeCandidates) {
    const pid = c?.providerId ?? c?.id ?? c;
    if (pid && !seen.has(pid)) {
      seen.add(pid);
      unique.push(c);
    }
  }

  const limit =
    typeof maxAttempts === "number" && maxAttempts > 0
      ? maxAttempts
      : unique.length;
  return unique.slice(0, limit);
}

/**
 * Determines whether an error is eligible for fallback to the next candidate provider.
 *
 * Degradable errors:
 *  - Network errors / connection reset / timeout
 *  - HTTP 429 (Rate Limit / Quota)
 *  - HTTP 5xx (Internal server error / Bad Gateway / Unavailable)
 *  - providerNotConfigured
 *  - upstreamNotConfigured
 *  - insufficientCredits (falls back to next candidate, e.g. user-provided key)
 *  - modelNotPriced
 *
 * Non-degradable errors (rethrow immediately without fallback):
 *  - Already assigned an external taskId (idempotency rule: paid side-effect in flight)
 *  - User cancellation / aborted / stopped
 *  - HTTP 400 or parameter errors (emptyPrompt, bitmapMissing, invalidDimensions, etc.)
 *  - 4xx Content moderation / safety policy rejections
 *
 * @param {any} error
 * @param {{ hasTaskId?: boolean }} [context]
 * @returns {boolean}
 */
export function isDegradableError(error, context = {}) {
  if (!error) return false;

  // 1. External asynchronous task already assigned a taskId (idempotency rule)
  if (context?.hasTaskId || error?.taskId || error?.hasTaskId) {
    return false;
  }

  // 2. User cancellation / stop
  if (
    error?.name === "AbortError" ||
    error?.cause === "userCancel" ||
    error?.code === "stopped" ||
    error?.code === "canceled" ||
    error?.code === "aborted" ||
    error?.message === "stopped" ||
    error?.message === "canceled" ||
    error?.message === "aborted"
  ) {
    return false;
  }

  const status = Number(
    error?.status || error?.statusCode || error?.response?.status || 0,
  );

  // 3. 400 Bad Request / parameter errors
  if (status === 400) {
    return false;
  }

  const code = String(error?.code || "").trim();
  const message = String(error?.message || error || "").trim();
  const lowerMessage = message.toLowerCase();
  const lowerCode = code.toLowerCase();

  // Parameter errors
  if (
    code === "emptyPrompt" ||
    code === "bitmapMissing" ||
    code === "invalidDimensions" ||
    code === "ARGS_INVALID" ||
    code === "invalid_params" ||
    code === "invalid_argument" ||
    code === "invalid_request_error" ||
    lowerMessage.includes("invalid parameter") ||
    lowerMessage.includes("invalid argument") ||
    lowerMessage.includes("bad request")
  ) {
    return false;
  }

  // 4. Content moderation / safety violations
  if (
    lowerCode.includes("contentfilter") ||
    lowerCode.includes("contentviolation") ||
    lowerCode.includes("safetyviolation") ||
    lowerCode.includes("sensitivecontent") ||
    lowerCode.includes("promptblocked") ||
    lowerCode.includes("inappropriate") ||
    lowerCode.includes("moderation") ||
    lowerCode.includes("content_policy") ||
    lowerCode.includes("risk_control") ||
    lowerMessage.includes("content filter") ||
    lowerMessage.includes("content violation") ||
    lowerMessage.includes("safety violation") ||
    lowerMessage.includes("sensitive content") ||
    lowerMessage.includes("prompt blocked") ||
    lowerMessage.includes("moderation") ||
    lowerMessage.includes("content policy") ||
    lowerMessage.includes("risk control") ||
    lowerMessage.includes("inappropriate") ||
    lowerMessage.includes("sensitive")
  ) {
    return false;
  }

  // 5. 429 Rate limit
  if (
    status === 429 ||
    lowerCode.includes("rate_limit") ||
    lowerCode.includes("ratelimit") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests")
  ) {
    return true;
  }

  // 6. 5xx Server errors
  if (status >= 500 && status < 600) {
    return true;
  }
  if (
    lowerCode === "internal_error" ||
    lowerCode === "service_unavailable" ||
    lowerCode === "bad_gateway" ||
    lowerCode === "gateway_timeout"
  ) {
    return true;
  }

  // 7. providerNotConfigured
  if (
    code === "providerNotConfigured" ||
    lowerCode === "providernotconfigured" ||
    lowerMessage.includes("providernotconfigured") ||
    lowerMessage.includes("provider not configured")
  ) {
    return true;
  }

  // 8. upstreamNotConfigured
  if (
    code === "upstreamNotConfigured" ||
    lowerCode === "upstreamnotconfigured" ||
    lowerMessage.includes("upstreamnotconfigured") ||
    lowerMessage.includes("upstream not configured")
  ) {
    return true;
  }

  // 9. insufficientCredits
  if (
    status === 402 ||
    code === "insufficientCredits" ||
    code === "insufficient_credits" ||
    lowerCode === "insufficientcredits" ||
    lowerCode.includes("credit") ||
    lowerMessage.includes("insufficient credit") ||
    lowerMessage.includes("insufficientcredits") ||
    lowerMessage.includes("out of credit") ||
    lowerMessage.includes("quota exhausted")
  ) {
    return true;
  }

  // 10. modelNotPriced
  if (
    code === "modelNotPriced" ||
    lowerCode === "modelnotpriced" ||
    lowerMessage.includes("modelnotpriced") ||
    lowerMessage.includes("model not priced")
  ) {
    return true;
  }

  // 11. Network errors / timeouts
  if (
    error?.name === "FetchError" ||
    error?.name === "NetworkError" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "providerNetworkError" ||
    code === "providerTimeout" ||
    lowerCode.includes("network") ||
    lowerCode.includes("timeout") ||
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("network error") ||
    lowerMessage.includes("econnreset") ||
    lowerMessage.includes("etimedout") ||
    lowerMessage.includes("connection refused") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("timeout")
  ) {
    return true;
  }

  // 12. Local backend / provider job failures
  if (
    lowerCode.includes("localbackend") ||
    lowerMessage.includes("localbackend") ||
    lowerCode.includes("unreachable") ||
    lowerMessage.includes("unreachable") ||
    lowerCode.includes("nocheckpoint") ||
    lowerMessage.includes("nocheckpoint") ||
    code === "providerJobFailed" ||
    code === "providerRequestFailed" ||
    code === "providerNoResult" ||
    lowerCode.includes("providerjobfailed") ||
    lowerCode.includes("providerrequestfailed") ||
    lowerCode.includes("providernoresult")
  ) {
    return true;
  }

  return false;
}

/** Backward-compatibility alias for isDegradableError. */
export const isFallbackEligibleError = isDegradableError;

/**
 * Executes an operation with fallback along the candidate chain.
 *
 * @param {{
 *   chain: Array<any>,
 *   execute: (candidate: any, meta: { attemptIndex: number, chain: Array<any> }) => Promise<any>,
 *   onFallback?: (event: {
 *     from: any,
 *     to: any,
 *     reason: string,
 *     attempt: number,
 *     previousProviderId?: string,
 *     providerId?: string,
 *     modelId?: string,
 *     error: any,
 *   }) => void,
 *   shouldStop?: () => boolean,
 *   maxAttempts?: number,
 * }} options
 */
export async function executeWithFallbackChain({
  chain = [],
  execute,
  onFallback,
  shouldStop,
  maxAttempts = DEFAULT_MAX_FALLBACK_ATTEMPTS,
}) {
  if (!Array.isArray(chain) || chain.length === 0) {
    const err = new Error("providerNotConfigured");
    err.code = "providerNotConfigured";
    throw err;
  }

  const limit =
    typeof maxAttempts === "number" && maxAttempts > 0
      ? maxAttempts
      : chain.length;
  const effectiveChain = chain.slice(0, limit);
  const attemptedChain = [];
  let lastError = null;

  for (let i = 0; i < effectiveChain.length; i += 1) {
    const candidate = effectiveChain[i];
    if (shouldStop?.()) {
      const stopError = new Error("stopped");
      stopError.code = "stopped";
      throw stopError;
    }

    if (i > 0) {
      const prev = effectiveChain[i - 1];
      const reason = lastError?.code || lastError?.message || String(lastError);
      onFallback?.({
        from: prev,
        to: candidate,
        reason,
        attempt: i + 1,
        previousProviderId: prev?.providerId,
        providerId: candidate?.providerId,
        modelId: candidate?.modelId,
        error: lastError,
      });
    }

    try {
      return await execute(candidate, {
        attemptIndex: i,
        chain: effectiveChain,
      });
    } catch (error) {
      lastError = error;
      attemptedChain.push({
        candidate,
        error,
        providerId: candidate?.providerId,
        modelId: candidate?.modelId,
      });

      if (shouldStop?.() || !isDegradableError(error)) {
        if (error && typeof error === "object") {
          error.attemptedChain = attemptedChain;
        }
        throw error;
      }
    }
  }

  if (lastError && typeof lastError === "object") {
    lastError.attemptedChain = attemptedChain;
    lastError.fallbackChain = effectiveChain;
  }
  throw lastError || new Error("providerRequestFailed");
}
