/**
 * Content-generation and Design-node creation tool descriptor definitions.
 */
import {
  GENERATION_ROUTE_PARAMETERS,
  LAYOUT_MEDIA,
  LAYOUT_SKILLS,
  LAYOUT_STYLES,
  MULTI_CANVAS_SKILLS,
} from "./constants.js";
import { DESIGN_SYSTEMS } from "../../../../design_systems.js";

const DESIGN_SYSTEM_IDS = ["auto", ...Object.keys(DESIGN_SYSTEMS)];

export const CONTENT_GENERATION_TOOL_DEFINITIONS = {
  create_multi_canvas: {
    name: "create_multi_canvas",
    description:
      "Create Design (imageAsset) layout pages for a presentation, deck, or poster series. The deck/ppt skill creates one ordered presentation owner and opens its pages vertically inside the existing Design Editor. Other skills keep ordinary multi-canvas behavior. Generate each page afterward with generate_layout. Use get_presentation/edit_presentation to read order, add, duplicate, rename or move deck pages. This creates HTML layout pages, not AI image/video shot nodes.",
    params: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "How many pages/canvases to create (3-24).",
        },
        prompt: {
          type: "string",
          description:
            "The overall brief: what the artifact communicates and its content.",
        },
        skill: {
          type: "string",
          enum: MULTI_CANVAS_SKILLS,
          description: "Layout skill for each page (ppt, deck, poster, …).",
        },
        media: {
          type: "string",
          enum: LAYOUT_MEDIA,
          description: "Canvas media preset. Defaults from the skill.",
        },
        style: {
          type: "string",
          enum: LAYOUT_STYLES,
          description: "Visual style for all pages.",
        },
        designSystem: {
          type: "string",
          enum: DESIGN_SYSTEM_IDS,
          description:
            "Shared artifact design system for all pages. Auto selects by brief; studio for general products, wellness for fitness, commerce for shopping, editorial for reading, analytics for dashboards.",
        },
        cols: {
          type: "number",
          description: "Columns per row in the auto-layout (default 6).",
        },
        autoGroup: {
          type: "boolean",
          description:
            "Group the pages into one auto-laid-out group (default true).",
        },
        consistent: {
          type: "boolean",
          description:
            "Keep style and characters consistent across all generated pages (default false). When true, creates a style anchor from the first page and references it in subsequent pages.",
        },
        prompts: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional array of per-page prompts. If omitted, prompts are derived from the overall prompt.",
        },
      },
      required: ["count", "prompt"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
    requires: {
      args: ["count", "prompt"],
    },
  },

  edit_generated_image: {
    name: "edit_generated_image",
    description:
      "Make a generated image editable in the design editor. Call this AFTER run_workflow has generated images: pass a generate node and it takes one of its results. If a document is already open in the design editor the picture is added to THAT document as a new layer, so the user keeps working where they are. With no editor open it creates an imageAsset editor node for the picture (reusing an existing one if the picture is already there) and opens it. Generating while the editor is open needs no call: the result lands as a layer on its own.",
    params: {
      type: "object",
      properties: {
        sourceNodeId: {
          type: "string",
          description:
            "The generate node whose results hold the generated image.",
        },
        imageId: {
          type: "string",
          description:
            "Optional specific result image id. Defaults to the first result.",
        },
        open: {
          type: "boolean",
          description: "Open the design editor after sending (default true).",
        },
      },
      required: ["sourceNodeId"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: true,
      reversible: true,
      timeout: null,
    },
    requires: {
      canvas: ["node:sourceNodeId"],
      nodeData: ["sourceNodeId.results"],
      store: ["images[imageId]"],
    },
  },

  generate_image: {
    name: "generate_image",
    description:
      "Create an image generation node. Prefer connected, enabled web platforms (ChatGPT, Gemini, Jimeng, Midjourney, in that order); they use the user's website account without VOO credits. Omit platform and executionMode to select automatically at creation time. If the website attempt fails, do not silently switch to an API model — ask the user which model to use with request_user_input, then set the route explicitly. Set a route only for an explicit user choice. Optionally connect upstream text/image inputs. When a document is open in the design editor, the node normally wires into it; set mountInOpenEditor=false to generate artwork as a separate canvas branch and mount it later into a chosen Design slot with mount_image_in_design.",
    params: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The image generation prompt.",
        },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "Canvas position for the new node.",
        },
        ...GENERATION_ROUTE_PARAMETERS,
        connectFrom: {
          type: "string",
          description:
            "Optional source node ID. A picture node (uploaded image, generate node) connects as the reference image; a prompt node connects as text.",
        },
        mountInOpenEditor: {
          type: "boolean",
          description:
            "Default true. Set false for artwork that should stay in its own workflow branch until mount_image_in_design places it in a chosen Design page and slot.",
        },
        consistent: {
          type: "boolean",
          description:
            "Keep style and character consistency across batch/series images (default false). When true, creates a style anchor from the first image and references it in subsequent images.",
        },
        prompts: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional batch of prompts to generate together in a series.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    approvalLevel: "external-api",
    capabilities: {
      mutates: true,
      externalData: true,
      estimatedCost: 0.05,
      idempotent: false,
      reversible: false,
      timeout: 180_000,
    },
    requires: {
      args: ["prompt"],
      canvas: ["node:connectFrom"],
    },
  },

  generate_layout: {
    name: "generate_layout",
    description:
      "Generate an editable layout directly in the Design Editor (distinct from bitmap image generation). Creates or reuses an imageAsset node and opens its editor before streaming a live preview, then materializes editable layers. For a new single-page design call this tool directly: no Agent Gen, Group, Prompt, Preview, create_node, or run_workflow is required. Pass nodeId to reuse an existing page. When the user attaches a canvas design reference, pass its node ID as referenceNodeId; the first stream follows its geometry and visual preview. The media preset follows the skill unless explicitly supplied. The call succeeds only after the editor document is created.",
    params: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "The layout brief: what the layout should communicate, content, and any specifics.",
        },
        nodeId: {
          type: "string",
          description:
            "Optional existing imageAsset node to generate into. Omit to create a new one.",
        },
        referenceNodeId: {
          type: "string",
          description:
            "Canvas Design frame or image to follow as a visual/layout reference. Use the node ID explicitly attached by the user; it can be the current target frame.",
        },
        skill: {
          type: "string",
          enum: LAYOUT_SKILLS,
          description:
            "Layout skill (poster, ui, social, banner, xiaohongshu, dashboard, album, magazine, deck, email).",
        },
        media: {
          type: "string",
          enum: LAYOUT_MEDIA,
          description:
            "Canvas media preset (poster, web, mobile, banner, social). Explicit mobile or phone requests use the mobile preset; otherwise defaults from the skill.",
        },
        width: {
          type: "integer",
          minimum: 64,
          maximum: 8192,
          description: "Optional canvas width in pixels; provide with height.",
        },
        height: {
          type: "integer",
          minimum: 64,
          maximum: 8192,
          description: "Optional canvas height in pixels; provide with width.",
        },
        style: {
          type: "string",
          enum: LAYOUT_STYLES,
          description:
            "Legacy visual style, used when no design system is selected.",
        },
        designSystem: {
          type: "string",
          enum: DESIGN_SYSTEM_IDS,
          description:
            "Artifact design system: auto, studio, wellness, commerce, editorial, analytics. Controls semantic colors, type, spacing, radius and component rules. A user-selected system in the Agent composer takes priority.",
        },
        direction: {
          type: "string",
          enum: ["centered", "grid", "asymmetric", "fullbleed"],
          description: "Composition direction.",
        },
        layoutModel: {
          type: "string",
          description:
            "Text model ID for the layout stream (e.g. codex:gpt-6-astra). Omit to use the node's configured model, which defaults to GPT-6 Astra.",
        },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          description: "Canvas position for a new node.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    approvalLevel: "external-api",
    requires: {
      args: ["prompt"],
    },
  },

  generate_video: {
    name: "generate_video",
    description:
      "Create a video generation node. Prefer connected, enabled Jimeng web generation using the user's website account without VOO credits. Omit platform and executionMode to select automatically at creation time. If the website attempt fails, do not silently switch to an API model — ask the user which model to use with request_user_input, then set the route explicitly. Set a route only for an explicit user choice. Optionally connect upstream image or text inputs.",
    params: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Video generation prompt / motion description.",
        },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          description: "Canvas position for the new node.",
        },
        ...GENERATION_ROUTE_PARAMETERS,
        connectFromImage: {
          type: "string",
          description:
            "Source node ID providing the input image for image-to-video.",
        },
        connectFromText: {
          type: "string",
          description: "Source node ID providing a text prompt.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    approvalLevel: "external-api",
    capabilities: {
      mutates: true,
      externalData: true,
      estimatedCost: 0.1,
      idempotent: false,
      reversible: false,
      timeout: 300_000,
    },
    requires: {
      args: ["prompt"],
      canvas: ["node:connectFromImage", "node:connectFromText"],
    },
  },

  generate_3d_model: {
    name: "generate_3d_model",
    description:
      "Create a 3D model generation node. Generates 3D assets (GLB) from text prompt or reference image using configured Tripo/Hunyuan3D routes. Omit platform and executionMode to select automatically. Run the node, then use edit_design_scene insert_media to place the completed model into a selected Design or 3D canvas. A bound agent output group also collects the source asset.",
    params: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "3D model generation prompt / shape description.",
        },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          description: "Canvas position for the new node.",
        },
        ...GENERATION_ROUTE_PARAMETERS,
        connectFromImage: {
          type: "string",
          description:
            "Source node ID providing the reference image for image-to-3D.",
        },
        connectFromText: {
          type: "string",
          description: "Source node ID providing a text prompt.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    approvalLevel: "external-api",
    capabilities: {
      mutates: true,
      externalData: true,
      estimatedCost: 0.1,
      idempotent: false,
      reversible: false,
      timeout: 300_000,
    },
    requires: {
      args: ["prompt"],
      canvas: ["node:connectFromImage", "node:connectFromText"],
    },
  },
};
