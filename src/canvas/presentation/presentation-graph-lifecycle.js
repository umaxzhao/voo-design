import { NODE_TYPE } from "../nodes/types.js";
import { getPresentationPages } from "./presentation-document.js";

/** Hidden pages belong to the owner even when they have no Group parent. */
export function presentationRemovalIds(nodes, nodeIds) {
  const removedIds = new Set(nodeIds);
  for (const node of nodes) {
    if (!removedIds.has(node.id) || !node.data?.presentation) continue;
    for (const pageId of node.data.presentation.pageIds) removedIds.add(pageId);
  }
  for (const node of nodes) {
    if (removedIds.has(node.data?.presentationOwnerId)) removedIds.add(node.id);
  }
  return removedIds;
}

/** Repair surviving owners after a generic graph delete. */
export function reconcilePresentationRemoval(nodes, removedIds) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const presentation = node.data?.presentation;
    if (!presentation) return node;
    const pageIds = presentation.pageIds.filter((id) => !removedIds.has(id));
    if (pageIds.length === presentation.pageIds.length) return node;
    const nextPresentation = pageIds.length
      ? { ...presentation, pageIds }
      : null;
    const firstPage = byId.get(pageIds[0]);
    return {
      ...node,
      rev: (node.rev ?? 0) + 1,
      data: {
        ...node.data,
        presentation: nextPresentation,
        imageId: firstPage?.data?.imageId ?? null,
        ...(node.type === NODE_TYPE.GROUP
          ? {
              memberOrder: (node.data?.memberOrder ?? []).filter(
                (id) => !removedIds.has(id),
              ),
            }
          : {}),
      },
    };
  });
}

/** Include a deck's pages in a normal owner duplicate without other children. */
export function presentationDuplicateSources(nodes, sources) {
  const selectedIds = new Set(sources.map((node) => node.id));
  const expanded = [...sources];
  for (const owner of sources) {
    if (!owner.data?.presentation) continue;
    for (const page of getPresentationPages(nodes, owner.id)) {
      if (selectedIds.has(page.id)) continue;
      selectedIds.add(page.id);
      expanded.push(page);
    }
  }
  return expanded;
}

/** Rewrite references after all duplicate IDs exist; a lone page becomes ordinary. */
export function reconcilePresentationDuplicates(sources, copies, idMap) {
  const copyById = new Map(copies.map((copy) => [copy.id, copy]));
  return copies.map((copy, index) => {
    const source = sources[index];
    const sourceData = source.data ?? {};
    if (sourceData.presentation) {
      const pageIds = sourceData.presentation.pageIds.map((id) => {
        const mapped = idMap.get(id);
        if (!mapped)
          throw new Error(`Presentation duplicate missing page: ${id}`);
        return mapped;
      });
      return {
        ...copy,
        data: {
          ...copy.data,
          presentation: { ...sourceData.presentation, pageIds },
          imageId: copyById.get(pageIds[0])?.data?.imageId ?? null,
          ...(source.type === NODE_TYPE.GROUP
            ? {
                memberOrder: (sourceData.memberOrder ?? [])
                  .map((id) => idMap.get(id))
                  .filter(Boolean),
              }
            : {}),
        },
      };
    }
    if (!sourceData.presentationOwnerId) return copy;
    const ownerId = idMap.get(sourceData.presentationOwnerId);
    if (ownerId) {
      return { ...copy, data: { ...copy.data, presentationOwnerId: ownerId } };
    }
    const data = { ...copy.data };
    delete data.presentationOwnerId;
    delete data.presentationNotes;
    const detached = { ...copy, data };
    delete detached.hidden;
    return detached;
  });
}

/** An undo can replace or remove the owner while its editor stays mounted. */
export function reconcilePresentationSession(state, nodes) {
  const ownerId = state.editingPresentationId;
  if (!ownerId) return {};
  const owner = nodes.find((node) => node.id === ownerId);
  if (!owner?.data?.presentation) {
    return {
      editingPresentationId: null,
      editingNodeIds: [],
      editingNodeId: null,
      editingGroupId: null,
      editorBridge: null,
      editorSurface: "workflow",
      editorRememberCamera: false,
    };
  }
  const pageIds = getPresentationPages(nodes, ownerId).map((page) => page.id);
  const focusedId = pageIds.includes(state.editingNodeId)
    ? state.editingNodeId
    : pageIds[0];
  return {
    editingNodeIds: pageIds,
    editingNodeId: focusedId,
    editingGroupId: owner.type === NODE_TYPE.GROUP ? ownerId : null,
    editorRememberCamera: owner.type === NODE_TYPE.GROUP,
    editorBridge: state.editorBridges?.[focusedId] ?? null,
  };
}
