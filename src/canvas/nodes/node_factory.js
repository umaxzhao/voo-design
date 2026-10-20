import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_IMAGE_PLATFORM,
} from "../../shared/agent-defaults.js";
import {
  API_MEDIA_TYPE,
  DEFAULT_API_3D_MODEL_ID,
  DEFAULT_API_AUDIO_MODEL_ID,
  DEFAULT_API_AUDIO_MODELS,
  DEFAULT_API_IMAGE_MODEL_ID,
  DEFAULT_API_VIDEO_MODEL_ID,
  LOCAL_ENGINE_DEFAULT_MODEL_ID,
  PROVIDER_ID,
  defaultModelIdFor,
} from "../../shared/providers.js";
import {
  MODEL_ROUTE_ID,
  getModelRouteSelection,
  getPerformanceTier,
  hasExplicitModelRoute,
  performanceTierRouteSelection,
} from "../../shared/model-routes.js";
import { localBackendReachability } from "../../shared/local_transport.js";
import { t } from "../../shared/i18n.js";
import { assignNextAgentIdentity } from "../../shared/agent_persona.js";
import { getSetting } from "../../shared/settings.js";
import {
  EXECUTION_MODE,
  HANDLE,
  NODE_TYPE,
  PLATFORM_TARGET,
  RUN_STATUS,
} from "./node_enums.js";
import { createEmptyOutputState } from "./output_group_schema.js";
import { resolveNewGenerationTarget } from "../generation-target-state.js";
import { normalizeShot } from "../engine/storyboard_compile.js";

/** Shared immutable empty lists avoid duplicate allocations across large graphs. */
export const EMPTY_LIST = Object.freeze([]);

/**
 * Optional data fields that are NOT expanded onto freshly created nodes, and
 * that migration strips back off when they hold exactly their default.
 *
 * Readers tolerate absence, preserving defaults while reducing allocations
 * and autosave payload size on large canvases.
 *
 * `reuploadImages` is deliberately NOT here: the run-options menu renders its
 * checkbox from the stored value, so dropping the default would flip the
 * visible state of existing nodes even though the executor ignores the flag.
 */
export const OPTIONAL_DATA_DEFAULTS = Object.freeze({
  negativePrompt: "",
  referenceImageTransport: "auto",
  styleAnchorId: null,
  remoteJob: null,
  jimengModel: "",
  jimengAspectRatio: "",
  jimengResolution: "",
  jimengCount: null,
  midjourney: null,
  newConversation: false,
  textureQuality: "",
  tripoMeshMode: "",
  tripoTopology: "",
  tripoAiModel: "",
  faceLimit: "",
  quad: false,
  voice: "",
});

/**
 * Returns `data` without the optional fields that hold exactly their default
 * (old documents were saved with every default expanded). Non-default values
 * and unknown keys pass through untouched. Returns the same reference when
 * nothing was stripped.
 */
export function stripOptionalDataDefaults(data) {
  if (!data || typeof data !== "object") return data;
  let out = null;
  for (const [key, value] of Object.entries(data)) {
    if (
      Object.hasOwn(OPTIONAL_DATA_DEFAULTS, key) &&
      value === OPTIONAL_DATA_DEFAULTS[key]
    ) {
      if (!out) out = { ...data };
      delete out[key];
    }
  }
  return out ?? data;
}

function routedDefaults(routeId, fallback) {
  const selection = getModelRouteSelection(routeId);
  if (!selection || !selection.providerId) return fallback;
  const explicit = hasExplicitModelRoute(routeId);
  // The machine's capability decides only what the user has not decided, and
  // only where it changes the answer: a machine that cannot serve the local
  // engine must not advance every new image node onto a provider it would have
  // to install first. A/B/unknown keep the built-in default (local), so nothing
  // moves for them and a failed probe can never reroute anyone to paid cloud.
  const tiered = explicit
    ? null
    : performanceTierRouteSelection(routeId, getPerformanceTier().tier);
  const resolved = tiered ?? selection;
  // An https page can never reach http://127.0.0.1 (mixed content, no opt-out),
  // so a node born on `local` there is born broken. When `local` is only the
  // built-in default — not a provider the user saved for this route — start on
  // the cloud default instead. A saved choice is left alone: it is the user's
  // call, and it fails with the actionable `localBackend.blockedByHttps` hint.
  if (
    !explicit &&
    resolved.providerId === PROVIDER_ID.LOCAL &&
    !localBackendReachability().ok
  ) {
    return fallback;
  }
  const isChatPlatform =
    resolved.providerId === PROVIDER_ID.CHATGPT ||
    resolved.providerId === PROVIDER_ID.GEMINI;

  if (isChatPlatform) {
    return {
      providerId: resolved.providerId,
      modelId: resolved.modelId || null,
      platform:
        resolved.providerId === PROVIDER_ID.GEMINI
          ? PLATFORM_TARGET.GEMINI
          : PLATFORM_TARGET.CHATGPT,
      executionMode: EXECUTION_MODE.CHAT,
    };
  }

  const routed = {
    providerId: resolved.providerId,
    // The managed engine serves one model per process and its generation body
    // carries no model field, so this id is not sent anywhere — it names the
    // engine model for the node's "choose a model" guard and for the desktop
    // bridge's start/install lookup. An empty id would fail that guard.
    modelId:
      resolved.modelId ||
      (resolved.providerId === PROVIDER_ID.LOCAL
        ? LOCAL_ENGINE_DEFAULT_MODEL_ID
        : null),
  };
  if (Object.hasOwn(fallback, "executionMode")) {
    routed.executionMode = EXECUTION_MODE.API;
  }
  return routed;
}

export const DEFAULT_DATA = {
  [NODE_TYPE.PROMPT]: () => ({
    text: "",
    aiPrompt: "",
    platform: PLATFORM_TARGET.CHATGPT,
    format: {
      block: "paragraph",
      bold: false,
      italic: false,
      list: "none",
      color: "#ffffff",
    },
    versions: EMPTY_LIST,
    selectedVersionId: null,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.IMAGE_EDITOR]: () => ({
    imageId: null,
    filename: "",
    editorDoc: null,
    origin: "local",
    sourceNodeId: null,
    /**
     * AI layout generation state: the prompt box, the design-skill picker
     * (see layout_skills.js), the raw generated HTML kept for re-parsing,
     * and the version history of generated layouts.
     */
    aiPrompt: "",
    layoutPlatform: DEFAULT_IMAGE_PLATFORM,
    layoutModel: DEFAULT_AGENT_MODEL,
    layoutSkill: "poster",
    layoutMedia: "poster",
    layoutStyle: "minimal",
    layoutDesignSystem: "auto",
    layoutResolvedDesignSystem: null,
    layoutDirection: "centered",
    layoutWidth: null,
    layoutHeight: null,
    layoutHtml: null,
    layoutVersions: EMPTY_LIST,
    selectedLayoutVersionId: null,
    /** Critique result of the latest generation ({score, issues[]}). */
    layoutReview: null,
    /** Regenerate once with the critique attached when it flags major issues. */
    layoutAutoImprove: true,
    /** Reference image whose extracted palette feeds the generation brief. */
    layoutReferenceImage: null,
    layoutReferencePalette: null,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.GROUP]: () => ({
    // The label is user-visible from birth, so the default follows the active
    // locale (I18N-1); the display layer falls back to the same key.
    label: t("node.group.defaultLabel"),
    color: "#9ca3af",
    /** Container keeps its size glued to its members when true. */
    autoLayout: true,
    autoLayoutMode: "grid",
    /** Cross-candidate output relationship metadata. */
    outputState: createEmptyOutputState(),
  }),
  [NODE_TYPE.COMMENT]: () => ({
    text: "",
  }),
  [NODE_TYPE.AGENT]: () => ({
    /** Optional node title; falls back to the i18n label. */
    label: "",
    agentName: "",
    agentColor: "",
    personaId: "general",
    /** Preferred artifact shape; auto routes from the standing brief. */
    outputType: "auto",
    /**
     * The standing task book. It is the minimal, conversation-independent
     * context that makes a node's output reproducible, and it survives a
     * session reset exactly like the archived black-box plan requires.
     */
    brief: "",
    /** The Group that owns this node's artifacts; null until bound. */
    outputGroupId: null,
    /** Artifact-generation route; null falls back to the node/global default. */
    providerId: null,
    modelId: null,
    /** Display cache — the truth is derived from the bound Group's slots. */
    artifactCount: 0,
    lastBatchId: null,
    lastSlotId: null,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.GENERATE]: () => ({
    prompt: "",
    platform: PLATFORM_TARGET.CHATGPT,
    ...routedDefaults(MODEL_ROUTE_ID.IMAGE_GENERATION, {
      executionMode: EXECUTION_MODE.CHAT,
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_IMAGE_MODEL_ID,
    }),
    aspectRatio: "1:1",
    resolution: "",
    count: 1,
    // jimeng*/midjourney/newConversation/negativePrompt/styleAnchorId/
    // referenceImageTransport/remoteJob live in OPTIONAL_DATA_DEFAULTS and
    // only appear on the node once set to a non-default value.
    reuploadImages: true,
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),

  [NODE_TYPE.VIDEO]: () => ({
    title: "",
    prompt: "",
    duration: 5,
    aspectRatio: "16:9",
    platform: PLATFORM_TARGET.CHATGPT,
    ...routedDefaults(MODEL_ROUTE_ID.VIDEO_GENERATION, {
      executionMode: EXECUTION_MODE.CHAT,
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_VIDEO_MODEL_ID,
    }),
    fps: "",
    resolution: "",
    reuploadImages: true,
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.STORYBOARD]: () => ({
    title: "",
    shots: EMPTY_LIST,
    storyboardMode: "shots",
    sheetPrompt: "",
    sheetImageId: null,
    sheetSignature: null,
    shotCount: 6,
    totalDuration: 30,
    aspectRatio: "16:9",
    style: "",
    // The chat that splits the story into shots (a text request, like a
    // prompt node's AI instruction). The API text route is independent from
    // the image route used for storyboard sheets and keyframes.
    splitPlatform: PLATFORM_TARGET.CHATGPT,
    splitExecutionMode: EXECUTION_MODE.CHAT,
    splitProviderId: PROVIDER_ID.AI_302,
    splitModelId: defaultModelIdFor(PROVIDER_ID.AI_302, API_MEDIA_TYPE.TEXT),
    // Keyframe route: the same fields a generate node carries, so a keyframe
    // run is a generate run with this node's route.
    platform: PLATFORM_TARGET.CHATGPT,
    ...routedDefaults(MODEL_ROUTE_ID.IMAGE_GENERATION, {
      executionMode: EXECUTION_MODE.CHAT,
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_IMAGE_MODEL_ID,
    }),
    storyboardProgress: null,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.BATCH]: () => ({
    title: "",
    // Serial by default — the whole point of the node is "finish one, then
    // start the next" without tripping a provider's rate limit.
    concurrency: 1,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.COMBINE_VIDEO]: () => ({
    title: "",
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.API_IMAGE]: () => ({
    prompt: "",
    ...routedDefaults(MODEL_ROUTE_ID.IMAGE_GENERATION, {
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_IMAGE_MODEL_ID,
    }),
    aspectRatio: "1:1",
    resolution: "",
    count: 1,
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.API_VIDEO]: () => ({
    title: "",
    prompt: "",
    ...routedDefaults(MODEL_ROUTE_ID.VIDEO_GENERATION, {
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_VIDEO_MODEL_ID,
    }),
    duration: 5,
    aspectRatio: "16:9",
    resolution: "",
    fps: "",
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.API_AUDIO]: () => {
    const route = routedDefaults(MODEL_ROUTE_ID.AUDIO_GENERATION, {
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_AUDIO_MODEL_ID,
    });
    return {
      title: "",
      prompt: "",
      ...route,
      /** Which generation mode the node runs: "music" (Suno) or "tts". */
      audioMode:
        DEFAULT_API_AUDIO_MODELS.find((model) => model.id === route.modelId)
          ?.audioMode ?? "music",
      results: EMPTY_LIST,
      selectedIndex: 0,
      status: RUN_STATUS.IDLE,
      stage: null,
      error: null,
    };
  },
  [NODE_TYPE.API_3D]: () => ({
    title: "",
    prompt: "",
    ...routedDefaults(MODEL_ROUTE_ID.MODEL_3D_GENERATION, {
      providerId: PROVIDER_ID.AI_302,
      modelId: DEFAULT_API_3D_MODEL_ID,
    }),
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.MODEL_3D]: () => ({
    title: "",
    /** Asset id for the 3D model file (GLB/GLTF/OBJ). */
    results: EMPTY_LIST,
    selectedIndex: 0,
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
  [NODE_TYPE.PREVIEW]: () => ({
    mediaType: "image",
    assetId: null,
    imageId: null,
    url: null,
    html: null,
    /**
     * Markdown and mindmap deliverables carry their text here rather than on
     * disk: nothing can read a project file's contents back into the renderer.
     * `outline` is indented plain text, not an .xmind/.mm file.
     */
    markdown: null,
    outline: null,
    pages: EMPTY_LIST,
    filename: "",
    title: "",
    editorDoc: null,
    annotations: EMPTY_LIST,
    aspectRatio: null,
    sourceNodeId: null,
    origin: "generated",
    status: RUN_STATUS.IDLE,
    stage: null,
    error: null,
  }),
};

let nodeCounter = 0;

export function createNodeId(type) {
  nodeCounter += 1;
  return `${type}-${Date.now().toString(36)}-${nodeCounter}`;
}

export function createNode(type, position, overrides = {}) {
  const createDefaultData = DEFAULT_DATA[type];
  if (!createDefaultData) throw new Error(`Unsupported node type: ${type}`);
  // Migration uses DEFAULT_DATA directly; only new nodes resolve live targets.
  const defaults = resolveNewGenerationTarget({
    mediaType: type,
    fallback: createDefaultData(),
    overrides,
  });
  const data = stripOptionalDataDefaults({ ...defaults, ...overrides });
  if (type === NODE_TYPE.STORYBOARD && data.shots?.length > 0) {
    // Agent-created shot lists need stable ids before editing or caching.
    data.shots = data.shots.map(normalizeShot);
  }
  if (
    Array.isArray(data.results) &&
    data.results.length === 0 &&
    data.results !== EMPTY_LIST
  ) {
    data.results = EMPTY_LIST;
  }
  if (
    Array.isArray(data.versions) &&
    data.versions.length === 0 &&
    data.versions !== EMPTY_LIST
  ) {
    data.versions = EMPTY_LIST;
  }
  if (
    Array.isArray(data.layoutVersions) &&
    data.layoutVersions.length === 0 &&
    data.layoutVersions !== EMPTY_LIST
  ) {
    data.layoutVersions = EMPTY_LIST;
  }
  const node = {
    id: createNodeId(type),
    type,
    position,
    rev: overrides.rev ?? 1,
    data,
  };
  if (type === NODE_TYPE.API_AUDIO) {
    // Agent creation may specify only a mode or a model. Fill its compatible
    // counterpart, but preserve both fields when explicitly provided.
    if (overrides.audioMode && !overrides.modelId) {
      node.data.modelId =
        DEFAULT_API_AUDIO_MODELS.find(
          (model) => model.audioMode === overrides.audioMode,
        )?.id ?? node.data.modelId;
    } else if (!overrides.audioMode) {
      node.data.audioMode =
        DEFAULT_API_AUDIO_MODELS.find((model) => model.id === node.data.modelId)
          ?.audioMode ?? node.data.audioMode;
    }
  }
  if (type === NODE_TYPE.AGENT) {
    if (!node.data.agentName || !node.data.agentColor) {
      const identity = assignNextAgentIdentity(
        overrides.existingNodes || [],
        overrides.themeId,
        overrides.customNames,
      );
      if (!node.data.agentName) node.data.agentName = identity.agentName;
      if (!node.data.agentColor) node.data.agentColor = identity.agentColor;
    }
    if (!node.data.label) {
      node.data.label = node.data.agentName;
    }
    if (!node.data.personaId) {
      node.data.personaId =
        overrides.personaId ||
        getSetting("voo.agent.activePersonaId") ||
        "general";
    }
  }
  if (type === NODE_TYPE.GROUP) {
    node.zIndex = -1;
  }
  return node;
}

export function isPreviewNodeWithContent(node) {
  if (!node || node.type !== NODE_TYPE.PREVIEW) return false;
  const d = node.data;
  if (!d) return false;
  if (
    d.mediaType === "html" ||
    d.mediaType === "markdown" ||
    d.mediaType === "mindmap"
  ) {
    return Boolean(d.html || d.srcdoc || d.markdown || d.outline || d.url);
  }
  if (d.mediaType === "slides") {
    return Boolean(
      (Array.isArray(d.pages) && d.pages.length > 0) ||
      (Array.isArray(d.slides) && d.slides.length > 0) ||
      d.url ||
      d.assetId,
    );
  }
  if (d.mediaType === "scene3d") {
    return Array.isArray(d.scene?.meshes) && d.scene.meshes.length > 0;
  }
  return Boolean(d.url || d.assetId || d.imageId);
}

export function isValidConnection(
  connection,
  sourceNode = null,
  _targetNode = null,
) {
  if (!connection?.sourceHandle || !connection?.targetHandle) return false;
  if (
    connection.source &&
    connection.target &&
    connection.source === connection.target
  ) {
    return false;
  }

  const srcNode = sourceNode || connection.sourceNode;

  // Universal target inputs accept any media or data handle
  if (
    connection.targetHandle === HANDLE.MEDIA ||
    connection.targetHandle === HANDLE.ALL
  ) {
    if (connection.sourceHandle === HANDLE.MEDIA) return true;
    return [
      HANDLE.TEXT,
      HANDLE.IMAGE,
      HANDLE.VIDEO,
      HANDLE.AUDIO,
      HANDLE.MODEL_3D,
    ].includes(connection.sourceHandle);
  }

  // Preview emitting MEDIA to a specific target port
  if (connection.sourceHandle === HANDLE.MEDIA) {
    if (srcNode && srcNode.type === NODE_TYPE.PREVIEW) {
      if (!isPreviewNodeWithContent(srcNode)) {
        // Content is empty: cannot connect to specific-type ports
        return false;
      }
      const actualType =
        srcNode.data?.mediaType ||
        (srcNode.data?.imageId ? HANDLE.IMAGE : null);
      if (!actualType) return false;

      if (
        (actualType === HANDLE.IMAGE || actualType === "image") &&
        (connection.targetHandle === HANDLE.IMAGE ||
          connection.targetHandle === HANDLE.VIDEO)
      ) {
        return true;
      }
      if (
        (actualType === HANDLE.VIDEO || actualType === "video") &&
        (connection.targetHandle === HANDLE.VIDEO ||
          connection.targetHandle === HANDLE.IMAGE)
      ) {
        return true;
      }
      if (
        (actualType === HANDLE.AUDIO || actualType === "audio") &&
        connection.targetHandle === HANDLE.AUDIO
      ) {
        return true;
      }
      if (
        (actualType === "markdown" ||
          actualType === "mindmap" ||
          actualType === HANDLE.TEXT ||
          actualType === "text") &&
        connection.targetHandle === HANDLE.TEXT
      ) {
        return true;
      }
      if (
        (actualType === HANDLE.MODEL_3D || actualType === "model3d") &&
        connection.targetHandle === HANDLE.MODEL_3D
      ) {
        return true;
      }
      if (actualType === connection.targetHandle) return true;
      return false;
    }
    // Generic fallback when sourceNode is not supplied
    return [
      HANDLE.IMAGE,
      HANDLE.VIDEO,
      HANDLE.AUDIO,
      HANDLE.TEXT,
      HANDLE.MODEL_3D,
    ].includes(connection.targetHandle);
  }

  if (connection.sourceHandle === connection.targetHandle) return true;
  if (
    (connection.sourceHandle === HANDLE.VIDEO ||
      connection.sourceHandle === HANDLE.IMAGE) &&
    (connection.targetHandle === HANDLE.IMAGE ||
      connection.targetHandle === HANDLE.VIDEO)
  ) {
    return true;
  }
  return false;
}
