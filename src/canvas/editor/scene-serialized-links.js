import { NODE_KIND } from "./scene_model_core.js";
import { isGroupNode, isRegionNode } from "./scene_model_groups.js";

/** Validate links on freshly normalized nodes owned by the document reader. */
export function restoreSerializedNodeLinks(readable) {
  // Container membership survives only when it is sound: the parent must be a
  // group or Boolean that survived the read, and following the chain from any
  // node must reach the root without cycling. Anything else flattens to the
  // top level, which is what a document written before groups existed reads
  // as anyway.
  const containerIds = new Set(readable.filter((node) => isGroupNode(node) || node.kind === NODE_KIND.BOOLEAN).map((node) => node.id));
  // A region's host is different: it names the image the annotation sits
  // on, and any surviving image is a legal host regardless of groups.
  const imageIds = new Set(
    readable
      .filter((node) => node.kind === NODE_KIND.IMAGE)
      .map((node) => node.id),
  );
  // Cycle detection reads the original links, so one node's clean-up cannot
  // hide another node's cycle behind it.
  const originalParent = new Map(
    readable.map((node) => [node.id, node.parentId]),
  );
  for (const node of readable) {
    // A region's group link is checked like anyone else's, but its host
    // image link survives on its own.
    if (
      isRegionNode(node) &&
      typeof node.hostId === "string" &&
      !imageIds.has(node.hostId)
    ) {
      delete node.hostId;
    }
    if (typeof node.parentId !== "string" || !containerIds.has(node.parentId)) {
      delete node.parentId;
      continue;
    }
    const seen = new Set([node.id]);
    let cursor = node.parentId;
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true;
        break;
      }
      seen.add(cursor);
      cursor = originalParent.get(cursor);
    }
    if (cyclic) delete node.parentId;
  }
  // A clipping mask is only valid when the target layer survived the read.
  // The base must paint (no group rows or regions) and must sit below the
  // clipped layer, or the mask would clip into itself or into thin air.
  const allIds = new Set(readable.map((node) => node.id));
  const paintOrder = new Map(readable.map((node, index) => [node.id, index]));
  for (const node of readable) {
    if (typeof node.clipTo !== "string" || !allIds.has(node.clipTo)) {
      delete node.clipTo;
      continue;
    }
    const base = readable.find((candidate) => candidate.id === node.clipTo);
    const baseIndex = paintOrder.get(node.clipTo);
    const nodeIndex = paintOrder.get(node.id);
    if (
      !base ||
      isGroupNode(base) ||
      isRegionNode(base) ||
      baseIndex >= nodeIndex
    ) {
      delete node.clipTo;
    }
  }
}
