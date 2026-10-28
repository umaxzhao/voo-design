/** Returns only frames that do not live inside another frame on a canvas root. */
export function visibleCanvasFrameLabels(doc) {
  if (!doc?.isCanvasRoot || !Array.isArray(doc.nodes)) return [];

  const nodesById = new Map(doc.nodes.map((node) => [node.id, node]));
  return doc.nodes.filter((node) => {
    if (!node?.isFrame) return false;

    const visited = new Set([node.id]);
    let ancestorId = node.parentId;
    while (ancestorId) {
      if (visited.has(ancestorId)) return false;
      visited.add(ancestorId);

      const ancestor = nodesById.get(ancestorId);
      if (!ancestor) break;
      if (ancestor.isFrame) return false;
      ancestorId = ancestor.parentId;
    }
    return true;
  });
}
