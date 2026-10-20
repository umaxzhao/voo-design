import { DESIGN_CREATION_WORKFLOW } from "./creation-workflow-policy.js";

/** Output intent is separate from the Agent's provider and execution mode. */
export const CREATION_TYPES = Object.freeze(
  [
    {
      id: "image",
      mode: "image",
      generationKind: "image",
      tools: ["generate_image", "run_workflow"],
      instruction:
        "Create an image with generate_image, then run_workflow for the returned generation node. Deliver the generated image asset.",
    },
    {
      id: "video",
      mode: "video",
      generationKind: "video",
      tools: ["generate_video", "run_workflow"],
      instruction:
        "Create video with generate_video, then run_workflow for the returned generation node. Deliver the generated video asset.",
    },
    {
      id: "design",
      mode: "design",
      generationKind: "layout",
      tools: ["generate_layout"],
      instruction:
        "Use the LLM layout pipeline through generate_layout. Deliver an editable Design document with native text, shapes and image layers. Choose media and skill from the brief.",
    },
    {
      id: "html",
      mode: "design",
      generationKind: "layout",
      tools: ["generate_layout", "create_multi_canvas"],
      instruction:
        'Use the LLM HTML layout pipeline through generate_layout with skill "ui" and media "web". Deliver a web design as editable Design layers. Use separate pages for distinct screens when requested; keep the generated HTML source available.',
    },
    {
      id: "mobile-app",
      mode: "design",
      generationKind: "layout",
      tools: ["generate_layout", "create_multi_canvas"],
      instruction:
        'Use the LLM layout pipeline with skill "ui" and media "mobile". For an app concept use create_multi_canvas for coherent mobile screens, then generate_layout per returned nodeId; for one requested screen generate one page. Deliver editable Design layers, not a bitmap UI or a claimed compiled app.',
    },
    {
      id: "poster",
      mode: "design",
      generationKind: "layout",
      tools: ["generate_layout"],
      instruction:
        'Use the LLM layout pipeline through generate_layout with skill "poster" and media "poster". Keep poster typography, layout and shapes editable in Design.',
    },
    {
      id: "ppt",
      mode: "design",
      generationKind: "layout",
      tools: [
        "create_multi_canvas",
        "generate_layout",
        "get_presentation",
        "edit_presentation",
      ],
      instruction:
        'Create a presentation with create_multi_canvas using skill "deck", then generate_layout for each returned page nodeId using skill "deck" and media "web", retaining its deck dimensions. Preserve the presentation owner and ordered pageIds so the Design Editor shows vertical slides and supports presentation editing and PPTX export.',
    },
    {
      id: "model3d",
      mode: "workflow",
      generationKind: "model3d",
      tools: ["generate_3d_model", "run_workflow"],
      instruction:
        "Use generate_3d_model and run_workflow to produce an actual 3D model asset from the brief or reference image. Do not substitute a flat picture or HTML/CSS imitation for the model.",
    },
  ].map((type) =>
    Object.freeze({
      ...type,
      tools: Object.freeze(type.tools),
      labelKey: `agent.creationType.${type.id}`,
      placeholderKey: `agent.creationType.${type.id}Placeholder`,
    }),
  ),
);

export function getCreationType(id) {
  if (id == null) return null;
  const type = CREATION_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new TypeError(`Unknown creation type: ${id}`);
  return type;
}

/** Saved with this user turn so API, CLI and resumed sessions keep its intent. */
export function withCreationTypeContext(message, id) {
  const type = getCreationType(id);
  if (!type) return message;
  const layoutAssets =
    type.generationKind === "layout"
      ? `\n${DESIGN_CREATION_WORKFLOW}\nDo not flatten the entire deliverable into a generated image.`
      : "";
  return `${message}\n\n[Creation type: ${type.id}]\nThe user explicitly selected this output type for this request. ${type.instruction}${layoutAssets} Keep the configured model/provider routes. A later explicit output selection supersedes this turn's choice.`;
}
