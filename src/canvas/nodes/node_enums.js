/**
 * Shared node/handle vocabulary and platform constants.
 */

/**
 * `default`, `input`, `output` and `group` are reserved by ReactFlow — it
 * styles nodes via a `react-flow__node-{type}` class, so a custom type sharing
 * one of those names would inherit its built-in white card. Hence the suffixed
 * names here.
 */
export const NODE_TYPE = {
  PROMPT: "prompt",
  IMAGE_EDITOR: "imageAsset",
  GENERATE: "generate",
  VIDEO: "videoShot",
  /**
   * Video result holder: plays and downloads one finished video. The type
   * string predates the removal of the Clip editor and is kept so stored
   * documents still open.
   */
  COMBINE_VIDEO: "combineVideo",
  /**
   * Legacy API generator names. Neither has a creation path left — no palette
   * entry, no quick-connect source, no place in the agent's create_node list,
   * and no migration that produces one — so nothing can reach them any more.
   * Kept registered so a stored document that still holds one opens instead of
   * crashing on an unknown node type.
   */
  API_IMAGE: "apiImage",
  API_VIDEO: "apiVideo",
  /** Audio generation node: music (Suno) and speech (TTS) via providers. */
  API_AUDIO: "apiAudio",
  /** Text-to-3D generation and an embedded GLB preview. */
  API_3D: "api3d",
  /**
   * 3D model result holder: previews and downloads a finished 3D asset.
   * No editor behind it — the 3D editor was removed with the flash branch.
   *
   * Deliberately model-creatable (CREATE_NODE_TYPES, pinned by
   * tests/agent_tool_specs.test.js): the model may place the holder for a 3D
   * result so a future producer drops in without touching the display layer.
   * None produces it today, and group ingestion is NOT that producer — a
   * model3d result lands on a `mediaPreview` with mediaType "model3d"
   * (`groupMemberTypeForMedia`). The retired 3D *editor* type is `api3d`,
   * which must stay uncreatable.
   */
  MODEL_3D: "model3d",
  /** Batch orchestrator: runs the generator nodes wired into it, in turn. */
  BATCH: "batch",
  GROUP: "groupNode",
  COMMENT: "comment",
  /**
   * Universal conversational generator: one node-level Agent session that
   * routes the user's intent to image / video / text / web generation and drops the artifacts into the Group it is bound to
   * (`data.outputGroupId`). It has no data-flow output: the binding is node
   * data rendered as a derived ownership wire, never a stored edge.
   */
  /**
   * Universal preview node: previews and downloads any generated media (image,
   * video, audio, 3D model). Clicking "edit" on an image opens the Design editor.
   */
  PREVIEW: "mediaPreview",
  AGENT: "agent",
  /**
   * Shot list: splits an upstream story into shots (framing, angle, camera
   * move, duration), renders one keyframe per shot, and hands the list to a
   * video node, which renders one clip per shot.
   *
   * NOT "storyboard": that string belongs to the removed Storyboard editor
   * node and is in REMOVED_NODE_TYPES, so an old document's node is dropped
   * on load instead of being read as this incompatible shape.
   */
  STORYBOARD: "storyboardPlan",
};

/** Source handles carry the media type; universal target handles accept them all. */
export const HANDLE = {
  ALL: "all",
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  /**
   * 3D model assets (GLB/GLTF/OBJ). Separate from video/image because
   * the display and download semantics differ (no inline playback, binary
   * file download).
   */
  MODEL_3D: "model3d",
  /** HTML / web page preview. */
  HTML: "html",
  /** Slides / presentation preview. */
  SLIDES: "slides",
  /**
   * A markdown deliverable. Its text rides in the node's own data, not in a
   * file: there is no channel that reads a project file's contents back into
   * the renderer, so a file-backed document could never be drawn.
   */
  MARKDOWN: "markdown",
  /** An indented outline rendered as a tree — the mindmap deliverable. */
  MINDMAP: "mindmap",
  /**
   * The unified accept-any input of the Design editor: image, text,
   * video and audio can all connect to this single point. The media type is
   * read from the edge's source handle (the In node fans out per-type), so
   * consumers collect by source type, not by the merged target handle.
   */
  MEDIA: "media",
  /**
   * The Agent node's output port. It is deliberately NOT a data handle: it
   * drags to a Group's MEDIA input to set `agent.data.outputGroupId`, and no
   * edge with this handle is ever written to the store.
   */
  ARTIFACT: "artifact",
  /**
   * A storyboard's shot list. Only a video node accepts it: the video node
   * then renders one clip per shot instead of one clip for the whole node.
   */
  STORYBOARD: "storyboard",
};

/**
 * Role marker for the *derived* Agent to Group ownership wire. The wire is
 * built at render time from `agent.data.outputGroupId`; it is never persisted
 * as an edge, which is what keeps every topology / cost / input collector pure.
 */
export const GROUP_OWNERSHIP_ROLE = "group-ownership";

/**
 * Id prefix for a derived ownership wire. `deleteEdge` recognises it and
 * un-binds the Agent instead of trying (and failing) to drop a stored edge.
 */
export const AGENT_OWNERSHIP_EDGE_PREFIX = "agent-ownership:";

/** True when an edge says "these artifacts belong to that Group". */
export function isGroupOwnershipEdge(edge) {
  return edge?.data?.role === GROUP_OWNERSHIP_ROLE;
}

/**
 * True when a connection drag is the Agent's output binding a Group. The store
 * never commits this connection as an edge — the canvas routes it to
 * `bindAgentGroup`, so `state.edges` stays pure data flow.
 */
export function isAgentGroupBinding(connection, nodes = []) {
  if (
    connection?.sourceHandle !== HANDLE.ARTIFACT ||
    connection?.targetHandle !== HANDLE.MEDIA
  ) {
    return false;
  }
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  return source?.type === NODE_TYPE.AGENT && target?.type === NODE_TYPE.GROUP;
}

export const NODE_PORTS = {
  [NODE_TYPE.PROMPT]: { source: [HANDLE.TEXT], target: [HANDLE.TEXT] },
  // The picture is output on the source port.
  [NODE_TYPE.IMAGE_EDITOR]: {
    // Converted Preview nodes keep their stored outgoing handles. MEDIA is the
    // current universal wire; typed entries keep older media-specific wires
    // valid across the in-place Preview → Editor conversion.
    source: [
      HANDLE.MEDIA,
      HANDLE.IMAGE,
      HANDLE.TEXT,
      HANDLE.VIDEO,
      HANDLE.MODEL_3D,
      HANDLE.HTML,
    ],
    // One accept-any input: images (reference layers), video, audio and the
    // layout prompt all land on the same port. Type is taken from the edge's
    // source handle, so the editor knows an image from a video from the
    // layout brief without needing a port per type.
    target: [HANDLE.MEDIA],
  },
  [NODE_TYPE.GENERATE]: {
    source: [HANDLE.IMAGE],
    target: [HANDLE.TEXT, HANDLE.IMAGE],
  },
  [NODE_TYPE.VIDEO]: {
    source: [HANDLE.VIDEO],
    target: [HANDLE.TEXT, HANDLE.IMAGE, HANDLE.AUDIO, HANDLE.STORYBOARD],
  },
  // Story text and character/style references in; the shot list out.
  [NODE_TYPE.STORYBOARD]: {
    source: [HANDLE.STORYBOARD],
    target: [HANDLE.TEXT, HANDLE.IMAGE],
  },
  [NODE_TYPE.COMBINE_VIDEO]: {
    source: [HANDLE.VIDEO],
    // Kept as the accept-any MEDIA port so stored edges into it stay valid;
    // only a video source is ever shown.
    target: [HANDLE.MEDIA],
  },
  [NODE_TYPE.API_IMAGE]: {
    source: [HANDLE.IMAGE],
    target: [HANDLE.TEXT, HANDLE.IMAGE],
  },
  [NODE_TYPE.API_VIDEO]: {
    source: [HANDLE.VIDEO],
    target: [HANDLE.TEXT, HANDLE.IMAGE],
  },
  [NODE_TYPE.API_AUDIO]: {
    source: [HANDLE.AUDIO],
    target: [HANDLE.TEXT, HANDLE.IMAGE],
  },
  [NODE_TYPE.API_3D]: {
    source: [HANDLE.MODEL_3D],
    target: [HANDLE.TEXT, HANDLE.IMAGE],
  },
  // 3D model result holder: outputs one model file. Accept-any MEDIA target
  // so Group ingestion edges remain valid.
  [NODE_TYPE.MODEL_3D]: {
    source: [HANDLE.MODEL_3D],
    target: [HANDLE.MEDIA],
  },
  // Group is an output container: any generated media can land in it as a
  // new child node. The source handle on each edge carries the media type.
  [NODE_TYPE.GROUP]: { source: [], target: [HANDLE.MEDIA] },
  // Universal preview node: accepts any media on MEDIA target, emits MEDIA on its output port.
  [NODE_TYPE.PREVIEW]: {
    source: [HANDLE.MEDIA],
    target: [HANDLE.MEDIA],
  },
  // Batch orchestrator accepts incoming jobs and outputs completed generated assets to downstream nodes.
  [NODE_TYPE.BATCH]: {
    source: [HANDLE.IMAGE, HANDLE.VIDEO],
    target: [
      HANDLE.MEDIA,
      HANDLE.TEXT,
      HANDLE.IMAGE,
      HANDLE.VIDEO,
      HANDLE.AUDIO,
      HANDLE.MODEL_3D,
    ],
  },
  // A comment is pure annotation: no ports, no run semantics, not connectable.
  [NODE_TYPE.COMMENT]: { source: [], target: [] },
  /**
   * The Agent node takes reference material through one universal input.
   * and emits one intent-routed artifact set out. `artifact` is a binding
   * handle, not a data handle: it never becomes a stored edge.
   */
  [NODE_TYPE.AGENT]: {
    source: [HANDLE.ARTIFACT],
    target: [HANDLE.ALL],
  },
};

/** Guards programmatic and imported connections against missing node ports. */
export function nodeHasPort(node, direction, handle) {
  if (node?.type === NODE_TYPE.PREVIEW && direction === "source") {
    if (handle === HANDLE.MEDIA) return true;
    const legacyHandles = [
      HANDLE.IMAGE,
      HANDLE.VIDEO,
      HANDLE.AUDIO,
      HANDLE.MODEL_3D,
      HANDLE.HTML,
      HANDLE.SLIDES,
      HANDLE.MARKDOWN,
      HANDLE.MINDMAP,
    ];
    if (legacyHandles.includes(handle)) {
      return true;
    }
  }
  return NODE_PORTS[node?.type]?.[direction]?.includes(handle) ?? false;
}

/**
 * The Group an Agent node writes its artifacts into, or null when unbound.
 * Resolution order: a persisted ownership edge (imported graphs), then the
 * explicit `data.outputGroupId` binding, then the Agent's own parent Group.
 * The target must still exist and still be a Group, so a deleted Group cannot
 * leave a dangling sink.
 */
export function resolveAgentGroupId(agentNodeId, nodes = [], edges = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const agent = byId.get(agentNodeId);
  const isGroup = (id) => byId.get(id)?.type === NODE_TYPE.GROUP;
  const bound = (edges ?? []).find(
    (edge) =>
      isGroupOwnershipEdge(edge) &&
      edge.source === agentNodeId &&
      isGroup(edge.target),
  );
  if (bound) return bound.target;
  const explicit = agent?.data?.outputGroupId;
  if (explicit && isGroup(explicit)) return explicit;
  if (agent?.parentNode && isGroup(agent.parentNode)) return agent.parentNode;
  return null;
}

/** Which chat a generate node should run against. */
export const PLATFORM_TARGET = {
  AUTO: "auto",
  CHATGPT: "chatgpt",
  GEMINI: "gemini",
  JIMENG: "jimeng",
  MIDJOURNEY: "midjourney",
  TRIPO: "tripo",
  /**
   * API-backed text generation (DeepSeek), the default for the Design node's
   * AI layout generation — it needs no chat tab, unlike the platforms above.
   */
  DEEPSEEK: "deepseek",
};

export const EXECUTION_MODE = {
  CHAT: "chat",
  API: "api",
};

export const RUN_STATUS = {
  IDLE: "idle",
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  ERROR: "error",
  SKIPPED: "skipped",
};
