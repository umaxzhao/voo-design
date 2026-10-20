import { NODE_TYPE } from "../nodes/types.js";

/** Keep the workflow representation of a multi-page editor session together. */
export function groupEditorSessionPages(state) {
  if (state.editingPresentationId) return null;
  const pageIds = [...new Set(state.editingNodeIds ?? [])];
  if (pageIds.length < 2) return null;

  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const pages = pageIds.map((id) => byId.get(id));
  if (pages.some((node) => !node || node.type === NODE_TYPE.GROUP)) {
    throw new Error("EDITOR_PAGE_GROUP_TARGET_MISSING");
  }

  const activeGroup = byId.get(state.editingGroupId);
  const commonParentId = pages[0].parentNode;
  const commonParent =
    commonParentId && pages.every((page) => page.parentNode === commonParentId)
      ? byId.get(commonParentId)
      : null;
  const firstParentGroup = pages
    .map((page) => byId.get(page.parentNode))
    .find((parent) => parent?.type === NODE_TYPE.GROUP);
  const group =
    activeGroup?.type === NODE_TYPE.GROUP
      ? activeGroup
      : commonParent?.type === NODE_TYPE.GROUP
        ? commonParent
        : firstParentGroup;

  if (group) {
    const additions = pages
      .filter((page) => page.parentNode !== group.id)
      .map((page) => ({ existingNodeId: page.id }));
    if (additions.length)
      state.applyGroupMutation({ groupId: group.id, additions });
    return group.id;
  }

  return state.groupNodesAsLayout(pageIds);
}
