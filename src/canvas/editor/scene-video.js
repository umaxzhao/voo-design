import { getBaseDefaults, newId, NODE_KIND } from "./scene_doc_factory.js";

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);

export function isVideoNode(node) {
  return node?.kind === NODE_KIND.VIDEO;
}

/** A video layer is a boxed rectangle that shows the clip's current frame. */
export function normalizeVideoNode(node) {
  const media = node.media ?? {};
  return {
    ...node,
    assetId: typeof node.assetId === "string" ? node.assetId : null,
    src: typeof node.src === "string" ? node.src : null,
    media: {
      inPoint: Math.max(0, finite(media.inPoint, 0)),
      outPoint: Number.isFinite(media.outPoint) ? Math.max(0, media.outPoint) : null,
      volume: Math.min(1, Math.max(0, finite(media.volume, 1))),
      muted: Boolean(media.muted),
      loop: media.loop !== false,
    },
  };
}

export function createVideoNode(options = {}) {
  const box = options.box ?? options;
  return normalizeVideoNode({
    ...getBaseDefaults(),
    id: options.id ?? newId(),
    kind: NODE_KIND.VIDEO,
    x: finite(box.x, 0),
    y: finite(box.y, 0),
    width: Math.max(1, finite(box.width, 320)),
    height: Math.max(1, finite(box.height, 180)),
    assetId: options.assetId ?? null,
    src: options.src ?? null,
    ...(options.name ? { name: options.name } : {}),
    media: options.media ?? {},
  });
}
