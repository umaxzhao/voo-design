const topologies = new WeakMap();

/** Immutable scene arrays share hierarchy across selection and search renders. */
export function layerTopology(objects) {
  const cached = topologies.get(objects);
  if (cached?.length === objects.length) return cached;
  const docIndexOf = new Map(objects.map((object, index) => [object.id, index]));
  const byId = new Map(objects.map(object => [object.id, object]));
  const clipTargets = new Map();
  for (const object of objects) {
    const base = byId.get(object.clipTo);
    if (!base || base.id === object.id || (base.parentId ?? null) !== (object.parentId ?? null)) continue;
    const seen = new Set([object.id]);
    let current = base;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.clipTo);
    }
    if (!current) clipTargets.set(object.id, base.id);
  }
  const childrenMap = new Map();
  const clipMap = new Map();
  for (const object of objects) {
    if (object.parentId && !clipTargets.has(object.id)) {
      if (!childrenMap.has(object.parentId)) childrenMap.set(object.parentId, []);
      childrenMap.get(object.parentId).push(object);
    }
    const baseId = clipTargets.get(object.id);
    if (baseId) {
      if (!clipMap.has(baseId)) clipMap.set(baseId, []);
      clipMap.get(baseId).push(object);
    }
  }
  const result = { length: objects.length, docIndexOf, byId, clipTargets, childrenMap,
    clipMap, units: objects.filter(object => !object.parentId),
    hasInstances: objects.some(object => object.kind === "canvasInstance") };
  topologies.set(objects, result);
  return result;
}
