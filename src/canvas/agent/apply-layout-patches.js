import { isContainerNode } from "../editor/scene_model.js";
import { updateNodes } from "../editor/doc_ops_nodes.js";

/** Move absolute-coordinate subtrees atomically, just like the canvas layout UI. */
export function applyLayoutPatches(editor, patches, message) {
  const doc = editor.getDoc?.() ?? editor.getDocument?.();
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const targets = new Map(patches.map(({ id, patch }) => [id, patch]));
  const updates = [];
  for (const node of doc.nodes) {
    let target = targets.has(node.id) ? node : null;
    let ancestor = byId.get(node.parentId);
    const seen = new Set([node.id]);
    while (ancestor && !seen.has(ancestor.id)) {
      seen.add(ancestor.id);
      // An explicitly selected ancestor owns the whole subtree translation.
      if (targets.has(ancestor.id) && isContainerNode(ancestor)) target = ancestor;
      ancestor = byId.get(ancestor.parentId);
    }
    if (!target) continue;
    const patch = targets.get(target.id);
    const dx = (patch.x ?? target.x) - target.x;
    const dy = (patch.y ?? target.y) - target.y;
    if (dx || dy) updates.push({ id: node.id, x: node.x + dx, y: node.y + dy });
  }
  if (!updates.length) return 0;
  // A single document commit prevents each moved object becoming a separate undo.
  if (typeof editor.setDoc === "function") {
    editor.setDoc(updateNodes(doc, updates), { name: message });
  } else if (typeof editor.updateNodes === "function") {
    editor.updateNodes(updates, { name: message });
  } else {
    for (const { id, ...patch } of updates) editor.updateNode(id, patch, { commit: false });
    editor.commitEditorDocument?.({ message });
  }
  return patches.filter(({ id }) => updates.some((update) => update.id === id)).length;
}
