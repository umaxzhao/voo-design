/** Keeps neighboring 3D objects in one depth-tested pass between 2D layers. */
export function mixedRenderSegments(nodes) {
  const segments = [];
  for (const node of nodes) {
    if (node.visible === false) continue;
    if (node.kind === "mesh3d" || node.kind === "model3d") {
      const previous = segments.at(-1);
      if (previous?.kind === "3d") previous.nodes.push(node);
      else segments.push({ kind: "3d", nodes: [node] });
      continue;
    }
    segments.push({ kind: "node", node });
  }
  return segments;
}
