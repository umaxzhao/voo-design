const plans = new WeakMap();
const isolatedPaints = new WeakMap();

/** Containers isolate their subtree before applying alpha, as one paint layer. */
export function containerOpacity(node) {
  if (node?.kind !== "group") return 1;
  return Number.isFinite(node.opacity) ? Math.max(0, Math.min(1, node.opacity)) : 1;
}

export function containerBlendMode(node) {
  const mode = node.blendMode;
  return !mode || mode === "normal" || mode === "pass-through" ? "source-over" : mode;
}

/**
 * Preserve member paint order while making an isolated subtree atomic at its
 * first member. Normal document groups are contiguous. For malformed interleaved
 * groups this explicit rule leaves intervening external siblings above the unit.
 * Opaque containers do not create units and retain their original flat ordering.
 */
export function createContainerOpacityPlan(allNodes) {
  if (plans.has(allNodes)) return plans.get(allNodes);
  const byId = new Map(allNodes.map((node) => [node.id, node]));
  const positions = new Map(allNodes.map((node, index) => [node.id, index]));
  const paths = new Map();
  const pathOf = (node) => {
    if (paths.has(node.id)) return paths.get(node.id);
    const path = [];
    const visited = new Set();
    let current = node;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (containerOpacity(current) !== 1 || (current.kind === "group" && current.clipTo)) path.push(current);
      current = byId.get(current.parentId);
    }
    path.reverse();
    paths.set(node.id, path);
    return path;
  };
  const entryCache = new WeakMap();
  const plan = {
    nodeOf: (id) => byId.get(id),
    positionOf: (node) => positions.get(node.id),
    inheritedOpacityOf: (node, isolated) => pathOf(node)
      .filter((container) => container.id !== node.id && !isolated.has(container.id))
      .reduce((opacity, container) => opacity * containerOpacity(container), 1),
    entries(nodes, isolated = new Set()) {
      const key = JSON.stringify([...isolated]);
      let cached = entryCache.get(nodes);
      if (cached?.has(key)) return cached.get(key);
      const entries = [], units = new Map();
      for (const node of nodes) {
        const owner = pathOf(node).find((container) => !isolated.has(container.id));
        if (!owner) { entries.push({ node }); continue; }
        let unit = units.get(owner.id);
        if (!unit) {
          unit = { container: owner, nodes: [] };
          units.set(owner.id, unit);
          entries.push(unit);
        }
        unit.nodes.push(node);
      }
      if (!cached) { cached = new Map(); entryCache.set(nodes, cached); }
      cached.set(key, entries);
      return entries;
    },
  };
  plans.set(allNodes, plan);
  return plan;
}

/** The container's own paint participates at full alpha inside its isolated unit. */
export function containerPaintNode(node, isolated) {
  if (!isolated.has(node.id)) return node;
  // Stable immutable paint objects keep per-node effect caches alive during navigation.
  let paint = isolatedPaints.get(node);
  if (!paint) {
    paint = { ...node, opacity: 1, blendMode: "source-over", ...(node.clipTo ? { clipTo: null } : {}) };
    isolatedPaints.set(node, paint);
  }
  return paint;
}

/** A cross-container mask inherits only alpha not already applied by this unit. */
export function containerMaskNode(node, isolated, plan) {
  const paint = containerPaintNode(node, isolated);
  const inherited = plan.inheritedOpacityOf(node, isolated);
  return inherited === 1 ? paint : { ...paint, opacity: (paint.opacity ?? 1) * inherited };
}
