const nodeId = {
  type: "string",
  description:
    "Existing Design imageAsset workflow node ID. Use create_node to create one if needed.",
};
const capabilities = {
  externalData: false,
  estimatedCost: 0,
  idempotent: true,
  reversible: true,
  timeout: null,
};
const propertyDescription =
  "Dotted paths: x/y/width/height/rotation/opacity, name/visible/locked, timing.start/end, media.inPoint/outPoint/speed/volume/muted, model.rotation.x/y/z, model.scale/color/metalness/roughness/exposure/environment, model.camera.azimuth/elevation/distance/fov, spatial.z/rotationX/rotationY, geometry.type/depth, material.color/metalness/roughness, instance.layoutMode/playbackMode/playbackStart/cameraId/poster/videoSrc. Angles in degrees, times in composition seconds; environment studio/neutral; colors #rrggbb. Null resets optional sources and material overrides.";

export const DESIGN_SCENE_TOOL_DEFINITIONS = {
  get_design_scene: {
    name: "get_design_scene",
    description:
      "Inspect the authoritative editable Design, Motion or 3D canvas, including layer IDs, video sources, 3D properties, timing and keyframes. Works from the homepage and inside the editor; live unsaved edits take precedence. Read before editing an existing scene.",
    params: {
      type: "object",
      properties: { nodeId },
      required: ["nodeId"],
      additionalProperties: false,
    },
    approvalLevel: "read-only",
    capabilities: { ...capabilities, mutates: false },
    requires: { canvas: ["node:nodeId"] },
  },
  edit_design_scene: {
    name: "edit_design_scene",
    description:
      "Edit an existing Design, Motion or 3D canvas. Read get_design_scene first and pass its revision as expectedRevision to reject stale edits. Use set_canvas_type to switch editing modes while retaining layers and animation data. Insert completed video/model assets with insert_media, create LLM-directed editable primitive meshes with insert_mesh3d, embed an existing Design/Motion/3D master with insert_canvas_instance, edit properties and timeline keyframes. Canvas instances reject missing sources and direct or indirect cycles. Works on a live editor or saved document; atomic and undoable. Stable layerId makes repeated inserts update the same layer. Does not generate media or spend credits. Preserve existing layers.",
    params: {
      type: "object",
      properties: {
        nodeId,
        expectedRevision: {
          type: "string",
          pattern: "^sha256:[0-9a-f]{64}$",
          description:
            "Content revision returned by get_design_scene for this node. If the scene changed, the edit fails without writing history; read the scene again.",
        },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "insert_media",
                  "insert_mesh3d",
                  "insert_canvas_instance",
                  "set_canvas_type",
                  "set_properties",
                  "set_timeline",
                  "set_keyframe",
                  "remove_keyframe",
                ],
              },
              layerId: {
                type: "string",
                description:
                  "Existing scene layer ID, or stable new ID for an insert operation.",
              },
              sourceNodeId: {
                type: "string",
                description:
                  "Completed video/model3d source workflow node; required for insert_media.",
              },
              sourceCanvasId: {
                type: "string",
                description:
                  "Existing source canvas workflow node ID or canvasId; required for insert_canvas_instance. The source remains an editable master.",
              },
              canvasType: {
                type: "string",
                enum: ["design", "motion", "3d"],
                description:
                  "Target editing mode for set_canvas_type. Existing layers and timeline stay in the document.",
              },
              name: {
                type: "string",
                description: "Name of a new mesh or canvas instance.",
              },
              x: {
                type: "number",
                description: "New layer left edge in canvas units.",
              },
              y: {
                type: "number",
                description: "New layer top edge in canvas units.",
              },
              width: { type: "number", exclusiveMinimum: 0 },
              height: { type: "number", exclusiveMinimum: 0 },
              geometry: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["box", "sphere", "plane"] },
                  depth: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
              material: {
                type: "object",
                properties: {
                  color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
                  metalness: { type: "number", minimum: 0, maximum: 1 },
                  roughness: { type: "number", minimum: 0, maximum: 1 },
                },
                additionalProperties: false,
              },
              spatial: {
                type: "object",
                properties: {
                  z: { type: "number" },
                  rotationX: { type: "number" },
                  rotationY: { type: "number" },
                },
                additionalProperties: false,
              },
              instance: {
                type: "object",
                description:
                  "Embedding settings for insert_canvas_instance: fixed or fill sizing, live playback or a rendered video source.",
                properties: {
                  layoutMode: { type: "string", enum: ["fixed", "fill"] },
                  playbackMode: { type: "string", enum: ["live", "video"] },
                  playbackStart: { type: "number", minimum: 0 },
                  cameraId: { type: ["string", "null"] },
                  poster: { type: ["string", "null"] },
                  videoSrc: { type: ["string", "null"] },
                  parameters: { type: "object" },
                  overrides: { type: "object" },
                },
                additionalProperties: false,
              },
              properties: {
                type: "object",
                description: propertyDescription,
                additionalProperties: {
                  type: ["number", "string", "boolean", "null"],
                },
              },
              duration: { type: "number", exclusiveMinimum: 0 },
              fps: { type: "number", minimum: 1, maximum: 120 },
              property: {
                type: "string",
                description:
                  "Animated numeric path: x/y/width/height/rotation/opacity, model.rotation/scale/exposure/camera, spatial.z/rotationX/rotationY or material.metalness/roughness.",
              },
              time: { type: "number", minimum: 0 },
              value: { type: "number" },
              easing: {
                type: "string",
                enum: ["linear", "hold", "ease-in", "ease-out", "ease-in-out"],
              },
            },
            required: ["type"],
            additionalProperties: false,
          },
        },
      },
      required: ["nodeId", "operations"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: { ...capabilities, mutates: true },
    requires: { canvas: ["node:nodeId"] },
  },
};
