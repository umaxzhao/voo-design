import { HANDLE, NODE_TYPE } from "../nodes/types.js";
import { compileDocumentPrompt } from "./region_prompt.js";
import { buildAnnotationLegend } from "../annotations/annotation_reference.js";
import {
  collectImageInputs,
  filterMentionedInputs,
} from "./graph_image_inputs.js";

/**
 * Node types that contribute prompt text to whatever they feed.
 *
 * A reference editor is in here as well as in the image sources: it hands over
 * its picture on one port and, on another, the layout instructions the user
 * drew on top of that picture.
 */
const TEXT_SOURCE_TYPES = new Set([
  NODE_TYPE.PROMPT,
  NODE_TYPE.IMAGE_EDITOR,
  NODE_TYPE.PREVIEW,
]);

/** Renders one text source into the block it contributes. */
function compileTextSource(node) {
  switch (node.type) {
    case NODE_TYPE.PREVIEW: {
      if (node.data?.mediaType === "markdown" && node.data?.markdown) {
        return node.data.markdown.trim();
      }
      if (node.data?.mediaType === "mindmap" && node.data?.outline) {
        return node.data.outline.trim();
      }
      if (node.data?.text) {
        return node.data.text.trim();
      }
      const stored = node.data?.editorDoc;
      if (stored) {
        const doc = typeof stored === "string" ? JSON.parse(stored) : stored;
        return compileDocumentPrompt({
          regions: node.data?.regions,
          layers: node.data?.promptLayers,
          doc,
        });
      }
      return "";
    }
    case NODE_TYPE.IMAGE_EDITOR: {
      // The stored editor document carries the host images the regions live
      // on; the compiler needs it to map their local boxes back to page
      // coordinates. Persisted as an object, but tolerate a string form.
      const stored = node.data?.editorDoc;
      const doc = typeof stored === "string" ? JSON.parse(stored) : stored;
      return compileDocumentPrompt({
        regions: node.data?.regions,
        layers: node.data?.promptLayers,
        doc,
      });
    }
    default:
      return node.data?.text?.trim() ?? "";
  }
}

function indexNodes(nodes) {
  return new Map(nodes.map((node) => [node.id, node]));
}

function incomingEdges(edges, nodeId, handle) {
  return edges.filter(
    (edge) =>
      edge.target === nodeId &&
      (!handle ||
        edge.targetHandle === handle ||
        // A target on the merged media input carries its type on the source
        // handle (the In node fans out per-type), so match that too.
        edge.sourceHandle === handle ||
        (edge.sourceHandle === HANDLE.MEDIA &&
          (edge.targetHandle === HANDLE.MEDIA ||
            edge.targetHandle === HANDLE.TEXT ||
            !edge.targetHandle))),
  );
}

/**
 * Builds prompt legends for any upstream image annotations mentioned in the target node.
 * Kept consistent with the attachment order produced by collectImageInputs (top-to-bottom, left-to-right).
 */
export function collectAnnotationLegends(nodeId, nodes, edges) {
  const byId = indexNodes(nodes);
  const target = byId.get(nodeId);
  const mentions = target?.data?.mentions;
  if (!Array.isArray(mentions) || mentions.length === 0) return [];

  const rawImages = collectImageInputs(nodeId, nodes, edges);
  const filteredImages = filterMentionedInputs(rawImages, target.data);
  if (filteredImages.length === 0) return [];

  const groups = [];
  filteredImages.forEach((imgInput, idx) => {
    const prefix = `${imgInput.nodeId}#`;
    const mentionedIds = new Set(
      mentions
        .filter((m) => typeof m === "string" && m.startsWith(prefix))
        .map((m) => m.slice(prefix.length)),
    );
    if (mentionedIds.size === 0) return;

    const sourceNode = byId.get(imgInput.nodeId);
    const annotations = sourceNode?.data?.annotations;
    if (!Array.isArray(annotations) || annotations.length === 0) return;

    const matchedMarkers = [];
    annotations.forEach((ann, annIdx) => {
      if (mentionedIds.has(ann.id)) {
        matchedMarkers.push({
          index: annIdx + 1,
          x: ann.x,
          y: ann.y,
          note: ann.note,
        });
      }
    });

    if (matchedMarkers.length > 0) {
      groups.push({
        imageIndex: idx + 1,
        annotations: matchedMarkers,
      });
    }
  });

  const legend = buildAnnotationLegend(groups);
  return legend ? [legend] : [];
}

/**
 * Gathers the prompt text feeding a node.
 *
 * Traversal only walks back through prompt nodes, so a chain of prompt nodes
 * composes into one instruction while an upstream generate node contributes its
 * picture, not its wording.
 */
export function collectTextInputs(nodeId, nodes, edges) {
  const byId = indexNodes(nodes);
  const target = byId.get(nodeId);
  const role = target?.data?.workflowRole;
  const inputMode =
    target?.data?.textInputMode ??
    (role === "scene"
      ? "current-only"
      : role === "storyboard" || role === "sceneVideo"
        ? "direct"
        : null);
  const legends = collectAnnotationLegends(nodeId, nodes, edges);
  if (inputMode === "current-only") return legends;
  const collected = [];
  const visited = new Set();

  if (inputMode === "direct") {
    const directTexts = collectDirectTextSources(nodeId, nodes, edges).map(
      (source) => source.text,
    );
    return [...directTexts, ...legends];
  }

  const walk = (currentId) => {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const sources = incomingEdges(edges, currentId, HANDLE.TEXT)
      .map((edge) => byId.get(edge.source))
      .filter((node) => node && TEXT_SOURCE_TYPES.has(node.type));

    // Depth first so the furthest upstream prompt lands first in the result.
    sources.forEach((source) => walk(source.id));
    sources.forEach((source) => {
      const text = compileTextSource(source);
      if (text) collected.push(text);
    });
  };

  walk(nodeId);
  return [...collected, ...legends];
}

/** Direct workflow context with roles preserved so requests can label sections. */
export function collectDirectTextSources(nodeId, nodes, edges) {
  const byId = indexNodes(nodes);
  const roleOrder = { story: 0, characters: 1, screenplay: 2, scene: 3 };
  return incomingEdges(edges, nodeId, HANDLE.TEXT)
    .map((item) => byId.get(item.source))
    .filter((node) => node && TEXT_SOURCE_TYPES.has(node.type))
    .map((node) => ({
      nodeId: node.id,
      role: node.data?.workflowRole ?? "other",
      text: compileTextSource(node),
    }))
    .filter((source) => Boolean(source.text))
    .sort((a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99));
}
