import { getImageDataUrl } from "../../store/db.js";
import { ensureThumbnailSize, extractObjectSummary } from "./observer.js";

const MAX_REFERENCE_IMAGES = 4;

/** Read workflow assets independently of viewport zoom or an open editor. */
export async function observeWorkflowImages(args, context) {
  const store = context.getStore?.() ?? context.store;
  const ids = args.targetIds?.length
    ? args.targetIds
    : args.scope === "selection"
      ? (store?.selectedNodeIds ??
        (store?.selectedNodeId ? [store.selectedNodeId] : []))
      : [];
  const targets = (store?.nodes ?? []).filter((node) => ids.includes(node.id));
  const references = targets.flatMap((node) => {
    const data = node.data ?? {};
    const imageId = data.imageId || data.results?.[data.selectedIndex ?? 0];
    return imageId ? [{ node, imageId }] : [];
  });
  if (!references.length) return null;
  if (references.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `Observe at most ${MAX_REFERENCE_IMAGES} image nodes per call.`,
    );
  }
  const images = [];
  for (const { node, imageId } of references) {
    const source = await getImageDataUrl(imageId);
    if (!source)
      throw new Error(
        `Image bytes unavailable for node ${node.id}: ${imageId}`,
      );
    images.push({
      nodeId: node.id,
      imageId,
      dataUrl: await ensureThumbnailSize(source, 1024, context.downscaleFn),
    });
  }
  return {
    scope: args.scope,
    source: "workflow-assets",
    objects: targets.map(extractObjectSummary),
    count: targets.length,
    images,
  };
}
