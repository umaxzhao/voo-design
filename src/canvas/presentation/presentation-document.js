/** Page type of an image-editor page in a presentation document. */
const IMAGE_EDITOR_PAGE_TYPE = "imageAsset";

const PRESENTATION_VERSION = 1;

function requireSize(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Invalid presentation ${label}`);
  }
  return value;
}

export function validatePresentationMetadata(presentation) {
  if (!presentation || presentation.version !== PRESENTATION_VERSION) {
    throw new TypeError("Unsupported presentation metadata");
  }
  if (
    !Array.isArray(presentation.pageIds) ||
    presentation.pageIds.length === 0
  ) {
    throw new TypeError("Presentation must contain at least one page");
  }
  const pageIds = presentation.pageIds;
  if (pageIds.some((id) => typeof id !== "string" || !id)) {
    throw new TypeError("Presentation page IDs must be nonempty strings");
  }
  if (new Set(pageIds).size !== pageIds.length) {
    throw new TypeError("Presentation contains duplicate page IDs");
  }
  requireSize(presentation.width, "width");
  requireSize(presentation.height, "height");
  return presentation;
}

/** A page points at one owner; an owner never points at itself as a page. */
export function getPresentationOwner(nodes, nodeId) {
  if (!Array.isArray(nodes) || !nodeId) return null;
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;
  if (node.data?.presentation) return node;
  const ownerId = node.data?.presentationOwnerId;
  if (!ownerId || ownerId === nodeId) return null;
  return (
    nodes.find(
      (candidate) =>
        candidate.id === ownerId &&
        candidate.data?.presentation?.pageIds?.includes(nodeId),
    ) ?? null
  );
}

/** Explicit metadata order is authoritative; corrupt references fail visibly. */
export function getPresentationPages(nodes, ownerId) {
  if (!Array.isArray(nodes))
    throw new TypeError("Presentation nodes must be an array");
  const owner = nodes.find((node) => node.id === ownerId);
  if (!owner) throw new Error(`Presentation owner not found: ${ownerId}`);
  const { pageIds } = validatePresentationMetadata(owner.data?.presentation);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pages = pageIds.map((pageId) => {
    if (pageId === ownerId)
      throw new Error("Presentation owner cannot be a page");
    const page = byId.get(pageId);
    if (!page) throw new Error(`Presentation page not found: ${pageId}`);
    if (page.type !== IMAGE_EDITOR_PAGE_TYPE) {
      throw new Error(`Presentation page is not a Design node: ${pageId}`);
    }
    if (page.data?.presentationOwnerId !== ownerId) {
      throw new Error(`Presentation page owner mismatch: ${pageId}`);
    }
    return page;
  });
  const listedIds = new Set(pageIds);
  const unlisted = nodes.find(
    (node) =>
      node.data?.presentationOwnerId === ownerId && !listedIds.has(node.id),
  );
  if (unlisted)
    throw new Error(`Presentation has unlisted page: ${unlisted.id}`);
  return pages;
}

/** Coordinates are local to the presentation canvas, never workflow positions. */
export function layoutPresentationPages(
  entries,
  { padding = 0, gap = 0 } = {},
) {
  if (!Array.isArray(entries))
    throw new TypeError("Presentation entries must be an array");
  if (
    !Number.isFinite(padding) ||
    padding < 0 ||
    !Number.isFinite(gap) ||
    gap < 0
  ) {
    throw new TypeError("Presentation padding and gap must be nonnegative");
  }
  const ids = new Set();
  const sizes = entries.map((entry) => {
    if (
      !entry ||
      typeof entry.nodeId !== "string" ||
      !entry.nodeId ||
      ids.has(entry.nodeId)
    ) {
      throw new TypeError("Presentation layout requires unique node IDs");
    }
    ids.add(entry.nodeId);
    return {
      nodeId: entry.nodeId,
      width: requireSize(entry.width, "page width"),
      height: requireSize(entry.height, "page height"),
    };
  });
  const widest = Math.max(0, ...sizes.map((entry) => entry.width));
  let y = padding;
  return sizes.map((entry) => {
    const placed = { ...entry, x: padding + (widest - entry.width) / 2, y };
    y += entry.height + gap;
    return placed;
  });
}
