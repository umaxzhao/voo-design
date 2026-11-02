// Pure: the engine's prompt assembly imports this module (graph_text_inputs),
// so it must not reach storage. Storing marked copies lives in
// annotated_image_sync.js.
import { parseMentionId } from "./image_annotations.js";

/**
 * Calculates marker center and radius in pixels given image dimensions.
 * Radius scales with image dimensions with a minimum floor.
 */
export function calculateMarkerGeometry({ width, height, x, y }) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cx = Math.round(x * w);
  const cy = Math.round(y * h);
  const minDim = Math.min(w, h);
  const radius = Math.max(14, Math.round(minDim * 0.035));
  return { cx, cy, radius };
}

/**
 * Builds legend text for annotations grouped by reference image.
 *
 * Format:
 * "Markers on reference image 1: [1] at (32%, 18%) — make the helmet gold; [2] at (70%, 55%)"
 *
 * @param {Array<{ imageIndex: number, annotations: Array<{ index: number, x: number, y: number, note?: string }> }>} referenceGroups
 * @returns {string}
 */
export function buildAnnotationLegend(referenceGroups) {
  if (!Array.isArray(referenceGroups) || referenceGroups.length === 0) {
    return "";
  }

  const lines = referenceGroups
    .filter(
      (group) =>
        Array.isArray(group?.annotations) && group.annotations.length > 0,
    )
    .map((group) => {
      const parts = group.annotations.map((ann) => {
        const isBox = ann.type === "box" || (ann.width != null && ann.height != null);
        const note = ann.note ? ` — ${ann.note.trim()}` : "";
        if (isBox) {
          const xPct = Math.round(ann.x * 100);
          const yPct = Math.round(ann.y * 100);
          const wPct = Math.round((ann.width || 0) * 100);
          const hPct = Math.round((ann.height || 0) * 100);
          return `[${ann.index}] Box [left: ${xPct}%, top: ${yPct}%, width: ${wPct}%, height: ${hPct}%]${note}`;
        }
        const xPct = Math.round(ann.x * 100);
        const yPct = Math.round(ann.y * 100);
        return `[${ann.index}] at (${xPct}%, ${yPct}%)${note}`;
      });
      return `Markers on reference image ${group.imageIndex}: ${parts.join("; ")}`;
    });

  return lines.join("\n");
}

/**
 * Appends prompt legend to user prompt.
 */
export function appendPromptLegend(userPrompt, legend) {
  if (!legend || !legend.trim()) return userPrompt ?? "";
  const trimmed = typeof userPrompt === "string" ? userPrompt.trim() : "";
  if (!trimmed) return legend.trim();
  return `${trimmed}\n\n${legend.trim()}`;
}

/**
 * Platform rule:
 * Midjourney gets the ORIGINAL image + legend only (markers would be imitated in output).
 * Web platforms (ChatGPT / Gemini / 即梦) and API providers get marked copy + legend.
 */
export function shouldUseMarkedImage(isMidjourney) {
  return !isMidjourney;
}

/**
 * Renders numbered circles onto an image data URL via Canvas API.
 * In a non-browser environment, falls back cleanly or calls an injected canvas factory.
 *
 * @param {string} imageDataUrl
 * @param {Array<{ index: number, x: number, y: number }>} annotations
 * @param {object} [options]
 * @returns {Promise<string>} Marked image data URL
 */
export async function renderMarkedImage(imageDataUrl, annotations, options = {}) {
  if (!Array.isArray(annotations) || annotations.length === 0) {
    return imageDataUrl;
  }
  if (!imageDataUrl) return imageDataUrl;

  const canvasFactory =
    options.createCanvas ||
    (typeof document !== "undefined"
      ? () => document.createElement("canvas")
      : null);

  const imageLoader =
    options.loadImage ||
    (typeof Image !== "undefined"
      ? (src) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);
            img.src = src;
          })
      : null);

  if (!canvasFactory || !imageLoader) {
    // If no canvas/image runtime available (e.g. pure Node unit test without DOM),
    // mark string representation for test traceability.
    return `${imageDataUrl}#marked[${annotations.map((a) => a.index).join(",")}]`;
  }

  const img = await imageLoader(imageDataUrl);
  const width = img.naturalWidth || img.width || 512;
  const height = img.naturalHeight || img.height || 512;

  const canvas = canvasFactory();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageDataUrl;

  ctx.drawImage(img, 0, 0, width, height);

  for (const ann of annotations) {
    const isBox = ann.type === "box" || (ann.width != null && ann.height != null);
    if (isBox) {
      const bx = Math.round(ann.x * width);
      const by = Math.round(ann.y * height);
      const bw = Math.round((ann.width || 0.1) * width);
      const bh = Math.round((ann.height || 0.1) * height);
      const minDim = Math.min(width, height);
      const lineWidth = Math.max(2, Math.round(minDim * 0.005));

      // Semi-transparent box wash: rgba(229, 178, 255, 0.15)
      ctx.fillStyle = "rgba(229, 178, 255, 0.15)";
      ctx.fillRect(bx, by, bw, bh);

      // Contrast outer outline (white) + inner bright purple border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = lineWidth + 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.strokeStyle = "#E5B2FF";
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(bx, by, bw, bh);

      // Badge at top-left corner
      const radius = Math.max(12, Math.round(minDim * 0.03));
      const badgeX = bx;
      const badgeY = by;

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#E5B2FF";
      ctx.fill();

      ctx.fillStyle = "#111111";
      ctx.font = `bold ${Math.round(radius * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ann.index), badgeX, badgeY);
    } else {
      const { cx, cy, radius } = calculateMarkerGeometry({
        width,
        height,
        x: ann.x,
        y: ann.y,
      });

      // White border ring for high contrast against any background
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Purple circle: #E5B2FF (AI accent)
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#E5B2FF";
      ctx.fill();

      // Dark number centered inside
      ctx.fillStyle = "#111111";
      ctx.font = `bold ${Math.round(radius * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ann.index), cx, cy);
    }
  }

  return canvas.toDataURL("image/png");
}

/**
 * Resolves mentioned annotations for connected image inputs.
 * Returns:
 * - legend text
 * - marked images (or original images if Midjourney or no annotations mentioned)
 * - transformed prompt
 */
export async function applyAnnotationReferences({
  prompt,
  images = [],
  node,
  nodes = [],
  _edges = [],
  isMidjourney = false,
  renderOptions = {},
}) {
  const mentions = Array.isArray(node?.data?.mentions)
    ? node.data.mentions
    : [];
  if (mentions.length === 0) {
    return { prompt, images };
  }

  // Parse composite mentions: nodeId#annotationId
  const compositeMentions = mentions
    .map(parseMentionId)
    .filter(Boolean);

  if (compositeMentions.length === 0) {
    return { prompt, images };
  }

  // Map incoming image nodes
  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const mentionedByNode = new Map();
  for (const { nodeId, annotationId } of compositeMentions) {
    if (!mentionedByNode.has(nodeId)) {
      mentionedByNode.set(nodeId, new Set());
    }
    mentionedByNode.get(nodeId).add(annotationId);
  }

  const referenceGroups = [];
  const useMarked = shouldUseMarkedImage(isMidjourney);
  const updatedImages = [...images];

  // Match each occurrence in `images` to upstream nodes
  for (let i = 0; i < images.length; i += 1) {
    const occurrence = images[i];
    const imageIndex = i + 1;

    // Find the node corresponding to this image occurrence
    // An occurrence might have nodeId or we find the matching node in nodes
    let matchingNode = null;
    if (occurrence.nodeId && nodesById.has(occurrence.nodeId)) {
      matchingNode = nodesById.get(occurrence.nodeId);
    } else {
      // Look through nodes that have mentions
      for (const [nId] of mentionedByNode) {
        const candidate = nodesById.get(nId);
        if (candidate?.data?.imageId && (occurrence.imageId === candidate.data.imageId || occurrence.dataUrl)) {
          matchingNode = candidate;
          break;
        }
      }
    }

    if (!matchingNode) {
      // Fallback: match by order of mentioned nodes
      const mentionedNodeIds = [...mentionedByNode.keys()];
      if (mentionedNodeIds[i]) {
        matchingNode = nodesById.get(mentionedNodeIds[i]);
      }
    }

    if (matchingNode && mentionedByNode.has(matchingNode.id)) {
      const allowedIds = mentionedByNode.get(matchingNode.id);
      const allAnnotations = Array.isArray(matchingNode.data?.annotations)
        ? matchingNode.data.annotations
        : [];

      const activeAnnotations = [];
      allAnnotations.forEach((ann, idx) => {
        if (allowedIds.has(ann.id)) {
          activeAnnotations.push({
            ...ann,
            index: idx + 1, // 1-based array index
          });
        }
      });

      if (activeAnnotations.length > 0) {
        referenceGroups.push({
          imageIndex,
          annotations: activeAnnotations,
        });

        if (useMarked && occurrence.dataUrl) {
          const markedUrl = await renderMarkedImage(
            occurrence.dataUrl,
            activeAnnotations,
            renderOptions,
          );
          updatedImages[i] = {
            ...occurrence,
            dataUrl: markedUrl,
          };
        }
      }
    }
  }

  const legend = buildAnnotationLegend(referenceGroups);
  const finalPrompt = appendPromptLegend(prompt, legend);

  return {
    prompt: finalPrompt,
    images: updatedImages,
    legend,
    referenceGroups,
  };
}



