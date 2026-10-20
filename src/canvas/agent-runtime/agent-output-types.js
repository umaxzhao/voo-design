/** Artifact intent for an Agent node. The binding port remains type agnostic. */
export const AGENT_OUTPUT_TYPES = Object.freeze([
  "auto",
  "landingPage",
  "mobileApp",
  "webApp",
  "slider",
  "slides",
  "dashboard",
  "image",
  "video",
  "audio",
  "threejsScene",
]);

const OUTPUT_TYPE_SET = new Set(AGENT_OUTPUT_TYPES);

export function normalizeAgentOutputType(value) {
  return OUTPUT_TYPE_SET.has(value) ? value : "auto";
}

/**
 * Instructions are specific about the deliverable and its current runtime.
 * An HTML prototype must never be presented as an installable application.
 */
const OUTPUT_INSTRUCTIONS = Object.freeze({
  landingPage:
    'Deliver a landing page as an editable Design layout with media "web". Use generate_layout, and keep the page in the bound Group.',
  mobileApp:
    'Deliver a responsive mobile app screen prototype as an editable Design layout with media "mobile". This is a prototype, not an installable native app.',
  webApp:
    'Deliver a web app screen prototype as an editable Design layout with media "web". Preserve useful interface states in the design; do not claim a deployed application.',
  slider:
    'Deliver an editable web carousel as a Design layout with media "web". Show at least two distinct slides and visible navigation controls, and keep the result in the bound Group.',
  slides:
    "Deliver a multi-page presentation with create_multi_canvas using the deck skill, then generate_layout for each page. Keep every page in the bound Group.",
  dashboard:
    'Deliver a dashboard layout with generate_layout using skill "dashboard" and media "web". Label sample data as sample data; do not claim live data connections.',
  image:
    "Deliver an image with generate_image, run its generated node, and keep the result in the bound Group.",
  video:
    "Deliver a video with generate_video, run its generated node, and keep the result in the bound Group.",
  audio:
    "Deliver playable audio by creating an apiAudio node and running that node. Keep the result in the bound Group.",
  threejsScene:
    'Deliver an interactive 3D canvas as a mediaPreview node with data.mediaType "scene3d" and data.scene: { background?: "#RRGGBB", camera?: { position?: [x,y,z], target?: [x,y,z], fov?: 10..100 }, lights?: [{ type: "ambient"|"point", color?: "#RRGGBB", intensity?: 0..10, position?: [x,y,z] }], meshes: [{ geometry: "box"|"sphere"|"cone"|"cylinder"|"torus", color?: "#RRGGBB", position?: [x,y,z], rotation?: [x,y,z], scale?: [x,y,z] }] }. Use at most 8 lights and 32 meshes. Do not provide JavaScript or substitute a static image or a single model file.',
});

export function formatAgentOutputInstruction(value) {
  const outputType = normalizeAgentOutputType(value);
  if (outputType === "auto") return "";
  return `Selected output type: ${outputType}. ${OUTPUT_INSTRUCTIONS[outputType]}`;
}
