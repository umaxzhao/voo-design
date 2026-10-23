// Resolve an insertion edge to adjacent moves in the existing page model.
export function movePageToEdge(actions, nodes, sourceId, targetId, edge) {
  const source = nodes.findIndex(node => node.id === sourceId);
  const target = nodes.findIndex(node => node.id === targetId);
  if (source < 0 || target < 0 || source === target) return;
  const destination = target + (edge === "after" ? 1 : 0) - (source < target ? 1 : 0);
  const direction = Math.sign(destination - source);
  for (let step = 0; step < Math.abs(destination - source); step++) {
    actions.reorderEditorPage(sourceId, direction);
  }
}

// Consume the edit before unmounting: a later blur cannot commit an Escape.
export function finishPageRename(edit, actions, value, cancel = false) {
  const id = edit.current;
  edit.current = null;
  const name = String(value ?? "").trim();
  if (id !== null && !cancel && name) actions.renameEditorPage(id, name);
}
