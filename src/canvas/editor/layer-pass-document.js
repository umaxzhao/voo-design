const passes = new WeakMap();

/** Keep immutable paint snapshots stable so render caches survive camera moves. */
export function layerPassDocument(doc, nodeIds) {
  let cached = passes.get(doc);
  if (!cached) { cached = {}; passes.set(doc, cached); }
  const all = nodeIds.length === doc.nodes.length && nodeIds.every((id, index) => doc.nodes[index].id === id);
  if (all && cached.all) return cached.all;
  if (!all && cached.subset?.ids.length === nodeIds.length && cached.subset.ids.every((id, index) => id === nodeIds[index])) return cached.subset;
  const paintNodeIds = new Set(nodeIds);
  const nodes = all ? doc.nodes : doc.nodes
    .filter(node => paintNodeIds.has(node.id) || node.kind === "group" || node.kind === "boolean")
    .map(node => node.kind === "boolean" && !paintNodeIds.has(node.id) ? { ...node, visible: false } : node);
  const pass = { doc: { ...doc, nodes, backgroundColor: "transparent" }, paintNodeIds, ids: [...nodeIds] };
  if (all) cached.all = pass;
  else cached.subset = pass;
  return pass;
}
