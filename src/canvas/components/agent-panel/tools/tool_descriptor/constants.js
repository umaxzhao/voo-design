/**
 * Shared constants for canvas/workflow tool descriptor definitions.
 */
import {
  HANDLE,
  NODE_TYPE,
  PLATFORM_TARGET,
} from "../../../../nodes/node_enums.js";

export const LAYOUT_SKILLS = [
  "poster",
  "ui",
  "mobile",
  "social",
  "banner",
  "xiaohongshu",
  "dashboard",
  "album",
  "magazine",
  "deck",
  "email",
];

export const LAYOUT_MEDIA = ["poster", "web", "mobile", "banner", "social"];

export const LAYOUT_STYLES = [
  "minimal",
  "editorial",
  "memphis",
  "cyberpunk",
  "chinese",
  "bold",
  "gradient",
  "flat",
];

export const MULTI_CANVAS_SKILLS = [
  "ppt",
  "poster",
  "ui",
  "mobile",
  "social",
  "banner",
  "xiaohongshu",
  "dashboard",
  "album",
  "magazine",
  "deck",
  "email",
];

export const CONNECTION_PARAMETER_PROPERTIES = {
  sourceId: { type: "string", description: "Source node ID" },
  targetId: { type: "string", description: "Target node ID" },
  sourceHandle: {
    type: "string",
    enum: [
      HANDLE.TEXT,
      HANDLE.IMAGE,
      HANDLE.VIDEO,
      HANDLE.AUDIO,
      HANDLE.MODEL_3D,
      HANDLE.HTML,
      HANDLE.SLIDES,
      HANDLE.MEDIA,
    ],
    description: "Output port on the source node.",
  },
  targetHandle: {
    type: "string",
    enum: [
      HANDLE.TEXT,
      HANDLE.IMAGE,
      HANDLE.VIDEO,
      HANDLE.AUDIO,
      HANDLE.MODEL_3D,
      HANDLE.HTML,
      HANDLE.SLIDES,
      HANDLE.MEDIA,
      HANDLE.ALL,
    ],
    description:
      "Input port on the target node (use 'media' for multi-media nodes like imageAsset, batch or groupNode; use 'all' for Agent Gen).",
  },
};

export const CONNECTION_ITEM_SCHEMA = {
  type: "object",
  properties: CONNECTION_PARAMETER_PROPERTIES,
  required: ["sourceId", "targetId", "sourceHandle", "targetHandle"],
  additionalProperties: false,
};

/** Regular node types the agent may create. */
export const CREATE_NODE_TYPES = [
  NODE_TYPE.AGENT,
  NODE_TYPE.PROMPT,
  NODE_TYPE.IMAGE_EDITOR,
  NODE_TYPE.PREVIEW,
  NODE_TYPE.GENERATE,
  NODE_TYPE.VIDEO,
  NODE_TYPE.STORYBOARD,
  NODE_TYPE.API_AUDIO,
  NODE_TYPE.MODEL_3D,
  NODE_TYPE.GROUP,
];

const NODE_POSITION_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "number", description: "X coordinate on canvas" },
    y: { type: "number", description: "Y coordinate on canvas" },
  },
  description: "Canvas position. Defaults to automatic placement if omitted.",
};

export const CREATE_NODE_PARAMETER_PROPERTIES = {
  type: {
    type: "string",
    enum: CREATE_NODE_TYPES,
    description:
      "Node type: agent (Agent Gen — use when the user explicitly requests a reusable autonomous Agent workflow; its node-level chat routes intent to artifacts in a bound Group), prompt (text input), mediaPreview (Preview media node: image, video, audio, model3d, scene3d, html, slides, markdown, mindmap), imageAsset (Design Editor; for direct design creation use generate_layout, which creates and opens this node), generate (AI image gen), videoShot (AI video gen), storyboardPlan (editable shot list that feeds videoShot through storyboard ports), apiAudio (music and speech), groupNode (output group).",
  },
  position: NODE_POSITION_SCHEMA,
  label: {
    type: "string",
    description: "Optional display label for the node.",
  },
  data: {
    type: "object",
    description:
      "Optional initial node data, such as { text } for a prompt node, { storyboardMode: 'sheet', shots: [{ action, imagePrompt, motionPrompt, duration }] } for a full-page storyboardPlan, or { mediaType: 'html', html: '...' } / { mediaType: 'slides', pages: [...] } / { mediaType: 'markdown', markdown: '# Title' } / { mediaType: 'mindmap', outline: 'Root\\n  Child' } / { mediaType: 'scene3d', scene: { meshes: [{ geometry: 'box', color: '#a7ffd4' }] } } for mediaPreview nodes. A markdown or mindmap node carries its text here, not as a file: nothing can read a project file back into the preview. Generation prefers connected, enabled web platforms; omit platform, executionMode, providerId and modelId unless the user explicitly chooses a route. Explicit route data is preserved during creation.",
  },
};

export const CREATE_NODE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    ref: {
      type: "string",
      description:
        "Unique request-local reference used by edges and mapped to the created node ID in the result.",
    },
    ...CREATE_NODE_PARAMETER_PROPERTIES,
  },
  required: ["ref", "type"],
  additionalProperties: false,
};

/** Shared optional route controls: omitted values retain web-first defaults. */
export const GENERATION_ROUTE_PARAMETERS = {
  executionMode: {
    type: "string",
    enum: ["chat", "api"],
    description:
      "Optional explicit execution mode. Omit to prefer connected web platforms; set api only when requested.",
  },
  platform: {
    type: "string",
    enum: Object.values(PLATFORM_TARGET),
    description:
      "Optional explicit website choice. Omit to prefer a connected, enabled website. A failed website attempt is never answered by silently switching to an API model: ask the user which model to use, then set the route explicitly.",
  },
};
