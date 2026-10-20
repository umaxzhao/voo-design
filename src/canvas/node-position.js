import { getNodeTypeDefinition } from "./nodes/registry.js";

const FALLBACK_NODE_SIZE = { width: 245, height: 169 };
const FALLBACK_VIEWPORT_CENTER = { x: 240, y: 180 };

/** Stable canvas anchor for agent-created nodes when no position is supplied. */
export const DEFAULT_NODE_POSITION = Object.freeze({ x: 250, y: 150 });

const registrySize = (type) =>
  getNodeTypeDefinition(type)?.size ?? FALLBACK_NODE_SIZE;

/** Returns a node origin whose visual centre matches the current canvas centre. */
export function getViewportCenteredNodePosition({
  pane,
  screenToFlowPosition,
  type,
  nodes = [],
}) {
  const bounds = pane?.getBoundingClientRect();
  const screenCenter = bounds
    ? {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      }
    : FALLBACK_VIEWPORT_CENTER;
  const flowCenter = screenToFlowPosition(screenCenter);
  const size = registrySize(type);

  return findAvailableNodePosition({
    type,
    nodes,
    position: {
      x: flowCenter.x - size.width / 2,
      y: flowCenter.y - size.height / 2,
    },
  });
}

/**
 * Room above a card for its label row (NodeShell's eyebrow, h-6 + mb-1).
 * Resizable cards such as Prompt draw it outside their box, so spacing the
 * boxes alone let a new card land on another card's title (CANVAS-2).
 */
export const NODE_LABEL_BAND = 28;

/** Keep palette/template additions clear of existing cards without moving them. */
export function findAvailableNodePosition({ type, position, nodes = [] }) {
  const size = registrySize(type);
  const gap = 48;
  const band = NODE_LABEL_BAND;
  const occupied = nodes.filter((node) => !node.hidden && !node.parentNode);
  // Every footprint starts `band` above its box, the new card's included.
  const isFree = (candidate) =>
    occupied.every((node) => {
      const other = getNodeVisualSize(node);
      return (
        candidate.x + size.width + gap <= node.position.x ||
        candidate.x >= node.position.x + other.width + gap ||
        candidate.y + size.height + gap <= node.position.y - band ||
        candidate.y - band >= node.position.y + other.height + gap
      );
    });
  if (isFree(position)) return { ...position };

  // Candidate edges preserve proximity even when existing nodes were resized.
  const candidates = occupied.flatMap((node) => {
    const other = getNodeVisualSize(node);
    return [
      { x: node.position.x + other.width + gap, y: position.y },
      { x: node.position.x - size.width - gap, y: position.y },
      { x: position.x, y: node.position.y + other.height + gap + band },
      { x: position.x, y: node.position.y - band - size.height - gap },
    ];
  });
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - position.x, a.y - position.y) -
      Math.hypot(b.x - position.x, b.y - position.y),
  );
  // The outermost edge always supplies at least one collision-free candidate.
  return candidates.find(isFree) ?? { ...position };
}

/** Uses ReactFlow measurements/resizes when present, then the visual defaults. */
export function getNodeVisualSize(node) {
  const numeric = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const fallback = registrySize(node?.type);
  return {
    width:
      numeric(node.width) ??
      numeric(node.measured?.width) ??
      numeric(node.style?.width) ??
      fallback.width,
    height:
      numeric(node.height) ??
      numeric(node.measured?.height) ??
      numeric(node.style?.height) ??
      fallback.height,
  };
}
