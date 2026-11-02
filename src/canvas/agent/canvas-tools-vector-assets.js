import { commitAssetExpansion } from "./agent-asset-transaction.js";
import { parseSvgToNodes } from "./svg_to_nodes.js";
import { TOOL_ERROR, assetTargetGuard, requireEditor, invalidArgs, toolError, finiteOrNull, placementFor, createVectorNodes, groupNodes } from "./canvas-asset-shared.js";
/* ------------------------------------------------------------------ generate_vector */

export const GENERATE_VECTOR_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "generate_vector",
    description: "Generate original vector artwork (logo, icon, illustration, abstract mark) for a prompt and " + "place it on the canvas as editable paths. Requires an API agent model (local CLI models cannot " + "run nested text completions). Returns {layerIds, groupId, width, height, warnings}.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "What to draw: subject, style, palette, composition."
        },
        width: {
          type: "number",
          description: "Target width in px (default 400)."
        },
        height: {
          type: "number",
          description: "Target height in px (default 400)."
        },
        x: {
          type: "number",
          description: "Optional canvas x for the artwork origin."
        },
        y: {
          type: "number",
          description: "Optional canvas y for the artwork origin."
        },
        name: {
          type: "string",
          description: "Optional group/layer name."
        }
      },
      required: ["prompt"]
    }
  }
});
const VECTOR_SYSTEM_PROMPT = ["You are a vector illustrator. Reply with ONE complete SVG document and nothing else.", "Rules:", "- Root: <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 W H\">.", "- Only <path>, <rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline> and <g> elements.", "- Flat vector style, at most 6 colors plus transparent, at most 60 elements.", "- No text, no images, no gradients, no filters, no scripts, no external references.", "- Geometry must fit inside the viewBox with a small margin."].join("\n");
function extractSvg(text) {
  const raw = String(text ?? "").trim();
  const fenced = /```(?:svg|xml)?\s*([\s\S]*?)```/i.exec(raw);
  const source = fenced ? fenced[1] : raw;
  const start = source.indexOf("<svg");
  const end = source.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 6);
}
export async function generateVector(args = {}, context = {}) {
  const editor = requireEditor();
  const assertTarget = assetTargetGuard(editor, context.signal);
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) invalidArgs(TOOL_ERROR.INVALID_ARGS, "prompt is required.");
  if (!context.llm?.complete) {
    throw toolError(TOOL_ERROR.VECTOR_NEEDS_API_MODEL, "Vector generation needs an in-app API agent model. Switch to an API provider, or use build_layout path nodes with SVG d data to create editable vectors from an external MCP client; vectorize_image can trace a flat raster layer.");
  }
  const width = Math.max(16, Math.min(2048, finiteOrNull(args.width) ?? 400));
  const height = Math.max(16, Math.min(2048, finiteOrNull(args.height) ?? 400));
  const text = await context.llm.complete({
    system: VECTOR_SYSTEM_PROMPT,
    user: `Draw this as vector artwork: ${prompt}\nCanvas: ${width}x${height}. Use viewBox="0 0 ${width} ${height}".`,
    signal: context.signal
  });
  assertTarget();
  const svg = extractSvg(text);
  if (!svg) throw toolError(TOOL_ERROR.VECTOR_EMPTY, "The model did not return an SVG document.");
  const parsed = parseSvgToNodes(svg, {
    targetWidth: width,
    targetHeight: height
  });
  if (!parsed.nodes.length) throw toolError(TOOL_ERROR.VECTOR_EMPTY, parsed.warnings.join("; ") || "SVG had no drawable elements.");
  const origin = {
    x: finiteOrNull(args.x) ?? placementFor(editor, width, height).x,
    y: finiteOrNull(args.y) ?? 0
  };
  return commitAssetExpansion(editor, () => {
    const layerIds = createVectorNodes(editor, parsed.nodes, origin);
    if (!layerIds.length) throw toolError(TOOL_ERROR.VECTOR_EMPTY, "Could not create any vector layer.");
    const groupId = groupNodes(editor, layerIds, args.name ?? "Vector art");
    return {
      ok: true,
      layerIds,
      groupId,
      x: origin.x,
      y: origin.y,
      width,
      height,
      warnings: parsed.warnings
    };
  }, "AI: Generate vector");
}
