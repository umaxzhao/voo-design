const SPATIAL_KINDS = new Set(["mesh3d", "model3d"]);

/** Group adjacent paint kinds without changing the document's stacking order. */
export function mixedLayerSegments(nodes) {
  const segments = [];
  let pending = null;
  const flush = () => {
    if (!pending) return;
    segments.push(pending);
    pending = null;
  };
  for (const node of nodes ?? []) {
    if (node.visible === false) continue;
    if (node.kind === "canvasInstance") {
      flush();
      segments.push({ kind: "canvasInstance", id: node.id });
      continue;
    }
    const kind = SPATIAL_KINDS.has(node.kind) ? "3d" : "2d";
    if (pending?.kind !== kind) flush();
    if (!pending) pending = { kind, ids: [] };
    pending.ids.push(node.id);
  }
  flush();
  return segments;
}
