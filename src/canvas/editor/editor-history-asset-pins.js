/** Keep bitmap retention proportional to changed immutable scenes, not history size. */
export function createHistoryAssetPins() {
  const assetsByNodes = new WeakMap();
  const references = new Map();
  let retainedSources = new Map();
  let legacySnapshots = new Map();

  function assetsFor(nodes) {
    const cached = assetsByNodes.get(nodes);
    if (cached?.length === nodes.length) return cached.ids;
    const ids = new Set();
    for (const node of nodes) {
      const { imageId, maskId } = node;
      if (imageId) ids.add(imageId);
      if (maskId) ids.add(maskId);
    }
    assetsByNodes.set(nodes, { length: nodes.length, ids });
    return ids;
  }

  function updateReferences(ids, delta) {
    for (const id of ids) {
      const count = (references.get(id) ?? 0) + delta;
      if (count === 0) references.delete(id);
      else references.set(id, count);
    }
  }

  function parseLegacy(snapshot) {
    if (legacySnapshots.has(snapshot)) return legacySnapshots.get(snapshot);
    try {
      return JSON.parse(snapshot);
    } catch {
      // Preserve the existing history reader's handling of malformed legacy entries.
      return null;
    }
  }

  return function collectPinnedAssets(doc, snapshots) {
    const nextSources = new Map();
    const nextLegacy = new Map();
    const retain = (candidate) => {
      const nodes = candidate?.nodes;
      if (Array.isArray(nodes) && !nextSources.has(nodes)) {
        nextSources.set(nodes, assetsFor(nodes));
      }
    };
    retain(doc);
    for (const snapshot of snapshots) {
      let raw = snapshot;
      if (typeof snapshot === "string") {
        raw = parseLegacy(snapshot);
        nextLegacy.set(snapshot, raw);
      }
      retain(raw?.doc ?? raw);
    }
    // Count each distinct node array once, including future redo entries and
    // the live uncommitted scene. Drop strong references when history drops it.
    for (const [nodes, ids] of retainedSources) {
      if (nextSources.get(nodes) !== ids) updateReferences(ids, -1);
    }
    for (const [nodes, ids] of nextSources) {
      if (retainedSources.get(nodes) !== ids) updateReferences(ids, 1);
    }
    retainedSources = nextSources;
    legacySnapshots = nextLegacy;
    return new Set(references.keys());
  };
}
