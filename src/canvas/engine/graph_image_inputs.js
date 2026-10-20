import { HANDLE, NODE_TYPE } from "../nodes/types.js";
import { computeAnnotationsHash } from "../annotations/image_annotations.js";

function indexNodes(nodes) {
  return new Map(nodes.map((node) => [node.id, node]));
}

function incomingEdges(edges, nodeId, handle) {
  return edges.filter(
    (edge) =>
      edge.target === nodeId &&
      (!handle ||
        edge.targetHandle === handle ||
        edge.targetHandle === "in" ||
        (!edge.targetHandle &&
          (!edge.sourceHandle ||
            edge.sourceHandle === handle ||
            edge.sourceHandle === HANDLE.MEDIA)) ||
        (edge.targetHandle === HANDLE.MEDIA &&
          (!edge.sourceHandle ||
            edge.sourceHandle === handle ||
            edge.sourceHandle === HANDLE.MEDIA))),
  );
}

/**
 * Gathers the images feeding a node, tagging where each one came from.
 *
 * `origin: 'local'` means the picture only exists in the extension and the chat
 * has never seen it, so it must be uploaded. `origin: 'generated'` means the
 * model produced it earlier in this conversation and may already remember it.
 */
function collectImageInputsInternal(
  nodeId,
  nodes,
  edges,
  includeAllResults,
  seen,
) {
  const byId = indexNodes(nodes);
  if (seen.has(nodeId)) return [];
  seen.add(nodeId);

  return (
    incomingEdges(edges, nodeId, HANDLE.IMAGE)
      .flatMap((edge) => {
        const source = byId.get(edge.source);
        if (!source) return [];

        const common = {
          nodeId: source.id,
          position: source.position ?? { x: 0, y: 0 },
        };

        if (
          source.type === NODE_TYPE.IMAGE_EDITOR ||
          (source.type === NODE_TYPE.PREVIEW &&
            (!source.data?.mediaType || source.data?.mediaType === "image"))
        ) {
          const out = [];
          const effectiveImageId = source.data?.imageId || source.data?.assetId;
          if (effectiveImageId) {
            out.push({
              ...common,
              imageId: effectiveImageId,
              origin: source.data.origin ?? "local",
              annotatedImage: source.data.annotatedImage ?? null,
              annotations: source.data.annotations ?? [],
            });
          }

          // Annotated layers ride along as reference pictures. A canvas holding
          // several images is the reason to build one, so the generator should
          // see them rather than the user re-attaching each by hand — and the
          // annotation is what says a layer was meant to be seen at all.
          for (const reference of source.data?.referenceImages ?? []) {
            if (reference?.imageId) {
              out.push({
                ...common,
                imageId: reference.imageId,
                origin: "reference",
                prompt: reference.prompt,
              });
            }
          }
          return out;
        }

        if (
          source.type === NODE_TYPE.GENERATE ||
          source.type === NODE_TYPE.API_IMAGE ||
          source.type === NODE_TYPE.VIDEO ||
          source.type === NODE_TYPE.COMBINE_VIDEO ||
          source.type === NODE_TYPE.API_VIDEO
        ) {
          const results = source.data?.results ?? [];
          if (includeAllResults) {
            return results.map((imageId) => ({
              ...common,
              imageId,
              origin: "generated",
            }));
          }
          const index = source.data?.selectedIndex ?? 0;
          const imageId = results[index] ?? results[0];
          return imageId ? [{ ...common, imageId, origin: "generated" }] : [];
        }

        return [];
      })
      .filter(Boolean)
      // Attachment order decides which picture the model calls "the first image",
      // so order by the sources' layout: top to bottom, then left to right.
      .sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      )
  );
}

/** Returns the selected image from each connected generation source. */
export function collectImageInputs(nodeId, nodes, edges) {
  return collectImageInputsInternal(nodeId, nodes, edges, false, new Set());
}

/**
 * Narrows collected image inputs to the ones the prompt still refers to.
 *
 * `data.mentions` only exists once the @ list has been touched. While it is
 * absent every connected picture is attached, which is what an untouched graph
 * means; once it exists it is the authority, because taking a chip off the
 * prompt is exactly the request to stop sending that picture. A node wired up
 * afterwards is not in the list, and the prompt's chip row says so too, so what
 * runs matches what the editor shows.
 */
export function filterMentionedInputs(inputs, data) {
  const mentions = data?.mentions;
  const isMidjourney =
    data?.platform === "midjourney" || data?.platform === "mj";

  let filtered = inputs;
  if (Array.isArray(mentions) && mentions.length > 0) {
    const referencedNodeIds = new Set();
    for (const m of mentions) {
      if (typeof m !== "string") continue;
      const hashIndex = m.indexOf("#");
      if (hashIndex !== -1) {
        referencedNodeIds.add(m.slice(0, hashIndex));
      } else {
        referencedNodeIds.add(m);
      }
    }
    const matched = inputs.filter((input) =>
      referencedNodeIds.has(input.nodeId),
    );
    if (matched.length > 0) {
      filtered = matched;
    }
  }

  // Midjourney rule: keep original image (markers would be imitated in output)
  if (isMidjourney || !Array.isArray(mentions) || mentions.length === 0) {
    return filtered;
  }

  // Substitute imageId with current annotated copy if markers are mentioned
  return filtered.map((input) => {
    const prefix = `${input.nodeId}#`;
    const hasMarkerMention = mentions.some(
      (m) => typeof m === "string" && m.startsWith(prefix),
    );
    if (!hasMarkerMention) return input;

    const annImg = input.annotatedImage;
    if (!annImg || !annImg.id) return input;
    if (annImg.sourceImageId !== input.imageId) return input; // Stale source image

    const currentHash = computeAnnotationsHash(input.annotations);
    if (!currentHash || annImg.annotationsHash !== currentHash) return input; // Stale annotations

    return {
      ...input,
      imageId: annImg.id,
      originalImageId: input.imageId,
    };
  });
}

/** Returns every connected variant so a Gallery can render a contact sheet. */
export function collectImageBatchInputs(nodeId, nodes, edges) {
  return collectImageInputsInternal(nodeId, nodes, edges, true, new Set());
}

/**
 * What a Gallery shows: everything past runs put into it, plus whatever is
 * connected right now, minus the tiles removed by hand.
 *
 * The history is what makes the collection additive — a re-run clears its
 * source node's results, and only the history still holds them. The live
 * inputs are still consulted so a newly wired node, or one feeding the Gallery
 * through an editor, shows up before it has generated anything.
 */
export function resolveGalleryImageIds(data, liveImageIds) {
  const history = Array.isArray(data?.imageIds) ? data.imageIds : [];
  const removed = new Set(data?.removedImageIds ?? []);
  const ordered = [...liveImageIds, ...history];
  return ordered.filter(
    (imageId, index) =>
      ordered.indexOf(imageId) === index && !removed.has(imageId),
  );
}
