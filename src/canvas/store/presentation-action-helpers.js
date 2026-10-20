import { NODE_TYPE } from "../nodes/types.js";

export function requirePresentationOwner(nodes, ownerId) {
  const owner = nodes.find((node) => node.id === ownerId);
  if (!owner) throw new Error(`Presentation owner not found: ${ownerId}`);
  if (owner.type !== NODE_TYPE.GROUP && owner.type !== NODE_TYPE.IMAGE_EDITOR) {
    throw new TypeError("Presentation owner must be a Group or Design node");
  }
  return owner;
}

export function updatedPresentationNode(node, data) {
  return { ...node, rev: (node.rev ?? 0) + 1, data: { ...node.data, ...data } };
}
