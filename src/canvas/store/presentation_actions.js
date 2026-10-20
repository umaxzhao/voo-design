import {
  createDocument,
  createImageNode,
} from "../editor/scene_doc_factory.js";
import { NODE_TYPE, createNode, createNodeId } from "../nodes/types.js";
import {
  getPresentationPages,
  validatePresentationMetadata,
} from "../presentation/presentation-document.js";
import { prepareSlidesPreviewConversion } from "../presentation/presentation-conversion.js";
import { commitWorkflowHistory } from "../undo-action-contracts.js";
import { reflowAutoLayoutGroups } from "./workflow_group_reflow.js";
import { scheduleSave } from "./persistence.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";
import { createPresentationImportActions } from "./presentation-import-actions.js";
import {
  requirePresentationOwner as requireOwner,
  updatedPresentationNode as updatedNode,
} from "./presentation-action-helpers.js";

function metadata(pageIds, width, height) {
  if (!Array.isArray(pageIds)) {
    throw new TypeError("Presentation page IDs must be an array");
  }
  const value = { version: 1, pageIds: [...pageIds], width, height };
  validatePresentationMetadata(value);
  return value;
}

function memberOrder(owner, pageIds) {
  const oldPages = new Set(owner.data?.presentation?.pageIds ?? []);
  const otherMembers = (owner.data?.memberOrder ?? []).filter(
    (id) => !oldPages.has(id) && !pageIds.includes(id),
  );
  return [...pageIds, ...otherMembers];
}

function withPageOrder(nodes, ownerId, pageIds, width, height) {
  const firstPage = nodes.find((node) => node.id === pageIds[0]);
  return nodes.map((node) => {
    if (node.id !== ownerId) return node;
    return updatedNode(node, {
      presentation: metadata(pageIds, width, height),
      imageId: firstPage?.data?.imageId ?? null,
      ...(node.type === NODE_TYPE.GROUP
        ? { memberOrder: memberOrder(node, pageIds) }
        : {}),
    });
  });
}

function commit(set, get, patch, historyMeta = {}) {
  const before = get();
  const rollback = {
    nodes: before.nodes,
    edges: before.edges,
    undoStack: before.undoStack,
    redoStack: before.redoStack,
    editingNodeIds: before.editingNodeIds,
    editingNodeId: before.editingNodeId,
    editingPresentationId: before.editingPresentationId,
    editorBridge: before.editorBridge,
  };
  try {
    commitWorkflowHistory(get, "workflow.presentation.edit", {
      ...historyMeta,
      timestamp: Date.now(),
    });
    set(patch);
    scheduleSave(get);
  } catch (error) {
    set(rollback);
    throw error;
  }
}

function updateGroupLayout(nodes, owner) {
  return owner.type === NODE_TYPE.GROUP
    ? reflowAutoLayoutGroups(nodes, [owner.id])
    : nodes;
}

function requirePage(pages, pageId) {
  const index = pages.findIndex((page) => page.id === pageId);
  if (index < 0) throw new Error(`Presentation page not found: ${pageId}`);
  return { page: pages[index], index };
}

function insertionIndex(operation, pages) {
  if (operation.index != null) {
    if (
      !Number.isInteger(operation.index) ||
      operation.index < 0 ||
      operation.index > pages.length
    ) {
      throw new RangeError("Presentation insertion index out of range");
    }
    return operation.index;
  }
  return operation.pageId
    ? requirePage(pages, operation.pageId).index + 1
    : pages.length;
}

function newPage(owner, page, data, { duplicate = false } = {}) {
  const position = page?.position ? { ...page.position } : { x: 0, y: 0 };
  const next = duplicate
    ? { ...page, id: createNodeId(NODE_TYPE.IMAGE_EDITOR), position, data }
    : createNode(NODE_TYPE.IMAGE_EDITOR, position, data);
  next.rev = 1;
  next.selected = false;
  if (owner.type === NODE_TYPE.GROUP) next.parentNode = owner.id;
  else delete next.parentNode;
  if (owner.type !== NODE_TYPE.GROUP) next.hidden = true;
  else delete next.hidden;
  return next;
}

function updateEditorSession(state, ownerId, pageIds, nextFocusId) {
  if (state.editingPresentationId !== ownerId) return {};
  const focusedId = pageIds.includes(nextFocusId) ? nextFocusId : pageIds[0];
  return {
    editingNodeIds: pageIds,
    editingNodeId: focusedId,
    editorBridge: state.editorBridges?.[focusedId] ?? null,
  };
}

/** One owner and ordered page references are written in a single workflow transaction. */
export function createPresentationActions(set, get) {
  return {
    createPresentation(nodeIds, { ownerId, width, height } = {}) {
      if (isWorkflowReadOnly(get())) return null;
      const nodes = get().nodes;
      const owner = requireOwner(nodes, ownerId);
      const value = metadata(nodeIds, width, height);
      if (nodeIds.includes(ownerId))
        throw new Error("Presentation owner cannot be a page");
      if (owner.data?.presentation) {
        const existing = validatePresentationMetadata(owner.data.presentation);
        if (JSON.stringify(existing) === JSON.stringify(value)) return ownerId;
        throw new Error("Presentation owner already has a deck");
      }
      const byId = new Map(nodes.map((node) => [node.id, node]));
      for (const pageId of nodeIds) {
        const page = byId.get(pageId);
        if (!page || page.type !== NODE_TYPE.IMAGE_EDITOR) {
          throw new Error(`Presentation page is not a Design node: ${pageId}`);
        }
        if (page.data?.presentationOwnerId || page.data?.presentation) {
          throw new Error(`Presentation page is already owned: ${pageId}`);
        }
        if (owner.type === NODE_TYPE.GROUP && page.parentNode !== ownerId) {
          throw new Error(
            `Presentation page is outside owner Group: ${pageId}`,
          );
        }
      }
      const nextNodes = withPageOrder(
        nodes.map((node) =>
          nodeIds.includes(node.id)
            ? updatedNode(node, {
                presentationOwnerId: ownerId,
                presentationNotes: "",
                ...(!node.data?.editorDoc
                  ? {
                      layoutWidth: width,
                      layoutHeight: height,
                      ...(!node.data?.imageId
                        ? { editorDoc: createDocument(width, height) }
                        : {}),
                    }
                  : {}),
              })
            : node,
        ),
        ownerId,
        nodeIds,
        width,
        height,
      );
      commit(set, get, { nodes: nextNodes });
      return ownerId;
    },

    openPresentationEditor(ownerId) {
      const state = get();
      const owner = requireOwner(state.nodes, ownerId);
      const pages = getPresentationPages(state.nodes, ownerId);
      const pageIds = pages.map((page) => page.id);
      const focusedId =
        state.editingPresentationId === ownerId &&
        pageIds.includes(state.editingNodeId)
          ? state.editingNodeId
          : pageIds[0];
      const groupId = owner.type === NODE_TYPE.GROUP ? ownerId : null;
      set({
        editingNodeIds: pageIds,
        editingNodeId: focusedId,
        editingPresentationId: ownerId,
        editorSurface: "editor",
        editingGroupId: groupId,
        editorRememberCamera: Boolean(groupId),
        editorBridge: state.editorBridges?.[focusedId] ?? null,
      });
      return true;
    },

    editPresentationPage(ownerId, operation) {
      if (isWorkflowReadOnly(get())) return null;
      if (!operation || typeof operation !== "object") {
        throw new TypeError("Presentation operation is required");
      }
      const state = get();
      const owner = requireOwner(state.nodes, ownerId);
      const pages = getPresentationPages(state.nodes, ownerId);
      const { width, height } = owner.data.presentation;
      const pageIds = pages.map((page) => page.id);
      let nextNodes = state.nodes;
      let nextEdges = state.edges;
      let pageId = operation.pageId ?? null;
      let nextFocusId = state.editingNodeId;

      if (operation.type === "add" || operation.type === "duplicate") {
        const targetIndex = insertionIndex(operation, pages);
        const reference = pages[Math.max(0, targetIndex - 1)] ?? pages[0];
        let data;
        let template = reference;
        if (operation.type === "add") {
          data = {
            editorDoc: createDocument(width, height),
            layoutWidth: width,
            layoutHeight: height,
            presentationOwnerId: ownerId,
            presentationNotes: "",
          };
        } else {
          const source = requirePage(pages, operation.pageId).page;
          template = source;
          const sourceDoc =
            operation.doc ??
            source.data?.editorDoc ??
            createDocument(width, height);
          if (
            !operation.doc &&
            !source.data?.editorDoc &&
            source.data?.imageId
          ) {
            sourceDoc.nodes.push(
              createImageNode({
                imageId: source.data.imageId,
                x: 0,
                y: 0,
                width,
                height,
              }),
            );
          }
          if (!sourceDoc || !Array.isArray(sourceDoc.nodes)) {
            throw new TypeError("Duplicate requires a valid page document");
          }
          // Layer IDs are scoped by page. Keeping them preserves masks, groups,
          // clipping and other internal references in the cloned scene.
          data = structuredClone(source.data ?? {});
          data.editorDoc = structuredClone(sourceDoc);
          data.presentationOwnerId = ownerId;
          data.presentationNotes = source.data?.presentationNotes ?? "";
        }
        const nextPage = newPage(owner, template, data, {
          duplicate: operation.type === "duplicate",
        });
        pageId = nextPage.id;
        pageIds.splice(targetIndex, 0, pageId);
        nextNodes = [...state.nodes, nextPage];
        nextFocusId = pageId;
      } else if (operation.type === "move") {
        const { index } = requirePage(pages, pageId);
        const destination = operation.index;
        if (
          !Number.isInteger(destination) ||
          destination < 0 ||
          destination >= pages.length
        ) {
          throw new RangeError("Presentation move index out of range");
        }
        if (index === destination) return { pageId, pageIds };
        pageIds.splice(index, 1);
        pageIds.splice(destination, 0, pageId);
        nextNodes = nextNodes.map((node) => {
          if (!pageIds.includes(node.id) || !node.data?.editorCanvasPosition) {
            return node;
          }
          const nextData = { ...node.data };
          delete nextData.editorCanvasPosition;
          return { ...node, rev: (node.rev ?? 0) + 1, data: nextData };
        });
      } else if (operation.type === "delete") {
        const { index } = requirePage(pages, pageId);
        if (pages.length === 1)
          throw new Error("Cannot delete the last presentation page");
        pageIds.splice(index, 1);
        nextNodes = state.nodes.filter((node) => node.id !== pageId);
        nextEdges = state.edges.filter(
          (edge) => edge.source !== pageId && edge.target !== pageId,
        );
        if (state.editingNodeId === pageId) {
          nextFocusId = pageIds[Math.min(index, pageIds.length - 1)];
        }
      } else if (
        operation.type === "rename" ||
        operation.type === "notes" ||
        operation.type === "transition"
      ) {
        const { page } = requirePage(pages, pageId);
        const key =
          operation.type === "rename"
            ? "label"
            : operation.type === "notes"
              ? "presentationNotes"
              : "presentationTransition";
        const value =
          operation.type === "rename"
            ? operation.title
            : operation.type === "notes"
              ? operation.notes
              : operation.transition;
        if (typeof value !== "string" || (key === "label" && !value.trim())) {
          throw new TypeError(`Presentation ${operation.type} requires text`);
        }
        if (page.data?.[key] === value) return { pageId, pageIds };
        nextNodes = state.nodes.map((node) =>
          node.id === pageId ? updatedNode(node, { [key]: value }) : node,
        );
      } else {
        throw new TypeError(
          `Unsupported presentation operation: ${operation.type}`,
        );
      }

      nextNodes = withPageOrder(nextNodes, ownerId, pageIds, width, height);
      nextNodes = updateGroupLayout(nextNodes, owner);
      commit(
        set,
        get,
        {
          nodes: nextNodes,
          edges: nextEdges,
          ...updateEditorSession(state, ownerId, pageIds, nextFocusId),
        },
        { presentationOwnerId: ownerId },
      );
      return { pageId, pageIds };
    },

    convertSlidesPreview(nodeId) {
      if (isWorkflowReadOnly(get())) return false;
      const state = get();
      const owner = state.nodes.find((node) => node.id === nodeId);
      const prepared = prepareSlidesPreviewConversion(owner);
      if (!prepared) return false;
      const pageNodes = prepared.pages.map((page) =>
        newPage({ ...owner, type: NODE_TYPE.IMAGE_EDITOR }, owner, {
          editorDoc: page.doc,
          imageId: page.imageId,
          layoutWidth: page.width,
          layoutHeight: page.height,
          label: page.title,
          presentationNotes: page.notes,
          presentationOwnerId: nodeId,
          editorSource: page.source,
        }),
      );
      const pageIds = pageNodes.map((page) => page.id);
      const nextOwner = {
        ...updatedNode(owner, {
          editorSource: {
            mediaType: "slides",
            assetId: owner.data?.assetId ?? null,
            url: owner.data?.url ?? owner.data?.src ?? null,
          },
          presentation: metadata(pageIds, prepared.width, prepared.height),
          layoutWidth: prepared.width,
          layoutHeight: prepared.height,
          imageId: pageNodes[0].data.imageId ?? null,
        }),
        type: NODE_TYPE.IMAGE_EDITOR,
      };
      commit(set, get, {
        nodes: state.nodes
          .map((node) => (node.id === nodeId ? nextOwner : node))
          .concat(pageNodes),
      });
      return nodeId;
    },

    ...createPresentationImportActions(set, get),
  };
}
