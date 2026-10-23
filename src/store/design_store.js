import { createCameraRafBatcher } from "../canvas/camera_raf.js";
import { create } from "zustand";
import { createDocument, CANVAS_TYPE } from "../canvas/editor/scene_doc_factory.js";
import { addRecentFile } from "../canvas/store/recent_files.js";
import { guessCategory } from "../services/workspace_storage.js";
import { saveCrashDraft } from "../shared/crash_recovery.js";

const DEFAULT_PAGE_ID = "page-1";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

function createDefaultPage(id = DEFAULT_PAGE_ID, label = "Design 1", canvasType = CANVAS_TYPE.DESIGN) {
  return {
    id,
    type: "imageEditor",
    position: { x: 0, y: 0 },
    data: {
      label,
      canvasType,
      editorDoc: createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#171717", {
        canvasType,
        canvasId: id,
      }),
    },
  };
}

let pageCounter = 0;

export const useDesignStore = create((set, get) => {
  const cameraBatcher = createCameraRafBatcher({
    getCamera: () => get().editorCamera,
    setCamera: (editorCamera) => set({ editorCamera }),
    requestAnimationFrame: (callback) => typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(callback) : callback(),
  });
  return {
  // Core state
  editingNodeId: DEFAULT_PAGE_ID,
  editingNodeIds: [DEFAULT_PAGE_ID],
  editingGroupId: null,
  nodes: [createDefaultPage()],
  edges: [],
  images: {},
  editorCamera: { panX: 0, panY: 0, zoom: 1 },
  editorArtboardLayouts: {
    [DEFAULT_PAGE_ID]: { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  },
  streamingPreview: null,
  streamingPreviewNodeId: null,
  welcomeOpen: true,
  // Label of the document being opened, or null. While set, the whole app sits
  // behind a loading overlay so a half-imported document never shows.
  documentLoading: null,
  filePath: null,
  fileHandle: null,
  fileName: "Untitled.voo",
  canvasBackgroundColor: "#1e1e1e",
  setCanvasBackgroundColor: (color) => set({ canvasBackgroundColor: color, isDirty: true }),
  /** The Figma envelope a `.fig` was opened from; saving writes back in the same schema. */
  figSource: null,
  isDirty: false,

  // Agent Panel & Hybrid Architecture State
  agentPanelOpen: false,
  pendingAgentIntent: null,

  // Page / Artboard actions
  focusEditorPage: (id) => {
    if (!id) return;
    set((state) => ({
      editingNodeId: id,
      // A page the canvas does not show yet replaces what is on it, so the switcher brings it in.
      editingNodeIds: state.editingNodeIds.includes(id) ? state.editingNodeIds : [id],
    }));
  },

  addEditorPage: ({ label = "Untitled", canvasType = CANVAS_TYPE.DESIGN, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) => {
    const id = `page-${Date.now().toString(36)}-${(++pageCounter).toString(36)}`;
    const newPage = {
      id,
      type: "imageEditor",
      position: { x: 0, y: 0 },
      data: {
        label,
        canvasType,
        editorDoc: createDocument(width, height, "#171717", { canvasType, canvasId: id }),
      },
    };
    set((state) => ({
      nodes: [...state.nodes, newPage],
      editingNodeIds: [...state.editingNodeIds, id],
      editingNodeId: id,
      isDirty: true,
    }));
    return id;
  },

  deleteEditorPage: (id) => {
    set((state) => {
      const nextIds = state.editingNodeIds.filter((pId) => pId !== id);
      const nextNodes = state.nodes.filter((n) => n.id !== id);
      const nextFocused = state.editingNodeId === id ? (nextIds[0] || null) : state.editingNodeId;
      return {
        editingNodeIds: nextIds,
        nodes: nextNodes,
        editingNodeId: nextFocused,
        isDirty: true,
      };
    });
  },

  duplicateEditorPage: (sourceId) => {
    const state = get();
    const sourceNode = state.nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return null;
    const newId = `page-${Date.now().toString(36)}`;
    const duplicatedNode = {
      ...sourceNode,
      id: newId,
      data: {
        ...sourceNode.data,
        label: `${sourceNode.data?.label || "Page"} Copy`,
        editorDoc: JSON.parse(JSON.stringify(sourceNode.data?.editorDoc ?? sourceNode.data?.sceneDoc ?? {})),
      },
    };
    set((s) => ({
      nodes: [...s.nodes, duplicatedNode],
      editingNodeIds: [...s.editingNodeIds, newId],
      editingNodeId: newId,
      isDirty: true,
    }));
    return newId;
  },

  renameEditorPage: (id, name) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: name } } : n
      ),
      isDirty: true,
    }));
  },

  updateNodeData: (id, partialData) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...partialData } } : n
      ),
      isDirty: true,
    }));
  },

  // Viewport / Camera actions
  setEditorCamera: (camera) => {
    cameraBatcher.flush();
    set((state) => ({
      editorCamera: {
        ...state.editorCamera,
        ...(typeof camera === "function" ? camera(state.editorCamera) : camera),
      },
    }));
  },

  panEditorCamera: (arg1, arg2) => {
    const { dx, dy } =
      typeof arg1 === "object" && arg1 !== null
        ? { dx: Number(arg1.dx) || 0, dy: Number(arg2?.dy ?? arg1.dy) || 0 }
        : { dx: Number(arg1) || 0, dy: Number(arg2) || 0 };
    cameraBatcher.pan(dx, dy);
  },

  setEditorViewport: ({ panX, panY, zoom }) => {
    set((state) => ({
      editorCamera: {
        panX: panX !== undefined ? panX : state.editorCamera.panX,
        panY: panY !== undefined ? panY : state.editorCamera.panY,
        zoom: zoom !== undefined ? zoom : state.editorCamera.zoom,
      },
    }));
  },

  setEditorArtboardLayout: (id, layout) => {
    set((state) => {
      const current = (state.editorArtboardLayouts instanceof Map
        ? state.editorArtboardLayouts.get(id)
        : state.editorArtboardLayouts?.[id]) || {};
      const layoutsObj = state.editorArtboardLayouts instanceof Map
        ? Object.fromEntries(state.editorArtboardLayouts)
        : { ...(state.editorArtboardLayouts || {}) };
      return {
        editorArtboardLayouts: {
          ...layoutsObj,
          [id]: { ...current, ...layout },
        },
      };
    });
  },

  setEditorArtboardLayouts: (layouts) => {
    const layoutObj = layouts instanceof Map ? Object.fromEntries(layouts) : layouts;
    set({ editorArtboardLayouts: layoutObj });
  },

  moveEditorArtboard: (id, payload = {}) => {
    set((state) => {
      const current = (state.editorArtboardLayouts instanceof Map
        ? state.editorArtboardLayouts.get(id)
        : state.editorArtboardLayouts?.[id]) || { x: 0, y: 0 };
      const nextX = payload.x !== undefined ? payload.x : (current.x || 0) + (payload.dx || 0);
      const nextY = payload.y !== undefined ? payload.y : (current.y || 0) + (payload.dy || 0);
      const layoutsObj = state.editorArtboardLayouts instanceof Map
        ? Object.fromEntries(state.editorArtboardLayouts)
        : { ...(state.editorArtboardLayouts || {}) };
      return {
        editorArtboardLayouts: {
          ...layoutsObj,
          [id]: { ...current, x: Math.round(nextX), y: Math.round(nextY) },
        },
      };
    });
  },

  getGroupCamera: () => get().editorCamera,
  saveGroupCamera: (_, camera) => set({ editorCamera: camera }),

  // Image storage in memory state
  putImageState: (id, dataUrl) => {
    set((state) => ({
      images: { ...state.images, [id]: dataUrl },
    }));
  },

  // Document file & dirty state
  setFileName: (fileName) => set({ fileName }),
  setFilePath: (filePath) => set({ filePath }),
  setFileHandle: (fileHandle) => set({ fileHandle }),
  setIsDirty: (isDirty) => set({ isDirty }),
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  setDocumentLoading: (documentLoading) => set({ documentLoading }),

  // Structure-only crash draft (no image bytes) for unexpected-exit recovery.
  saveEditorDrafts: async () => {
    const state = get();
    const focused = state.editingNodeId;
    const node = (state.nodes || []).find((n) => n.id === focused);
    const doc = node?.data?.editorDoc;
    if (!focused || !doc) return;
    const { images: _images, ...safeDoc } = doc;
    await saveCrashDraft(focused, safeDoc, {
      label: state.fileName || node?.data?.label || "",
    });
  },

  loadVooProject: ({ vooData, filePath = null, fileName = "Untitled.voo", fileHandle = null, figSource = null }) => {
    const doc = vooData?.document;
    if (!doc) return;
    set({ figSource });

    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const nextNodes = doc.pages.map((page, idx) => ({
        id: page.id || `page-${Date.now().toString(36)}-${idx}`,
        type: "imageEditor",
        position: { x: 0, y: 0 },
        data: {
          label: page.label || `Design ${idx + 1}`,
          canvasType: page.canvasType || CANVAS_TYPE.DESIGN,
          editorDoc: page.sceneDoc || page.document || createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#171717"),
        },
      }));
      const nextIds = nextNodes.map((n) => n.id);
      const nextFocused = doc.editingNodeId && nextIds.includes(doc.editingNodeId) ? doc.editingNodeId : nextIds[0];
      set({
        nodes: nextNodes,
        // Only the focused page is on the canvas; the page switcher brings the others in.
        editingNodeIds: [nextFocused],
        editingNodeId: nextFocused,
        editorArtboardLayouts: doc.editorArtboardLayouts || {},
        editorCamera: doc.editorCamera || { panX: 0, panY: 0, zoom: 1 },
        filePath,
        fileName,
        fileHandle,
        isDirty: false,
        welcomeOpen: false,
      });
    } else {
      const pageId = `page-${Date.now().toString(36)}`;
      const singleNode = {
        id: pageId,
        type: "imageEditor",
        position: { x: 0, y: 0 },
        data: {
          label: doc.label || "Design 1",
          canvasType: vooData.kind || CANVAS_TYPE.DESIGN,
          editorDoc: doc,
        },
      };
      set({
        nodes: [singleNode],
        editingNodeIds: [pageId],
        editingNodeId: pageId,
        editorArtboardLayouts: {
          [pageId]: { x: 0, y: 0, width: doc.width || DEFAULT_WIDTH, height: doc.height || DEFAULT_HEIGHT },
        },
        editorCamera: { panX: 0, panY: 0, zoom: 1 },
        filePath,
        fileName,
        fileHandle,
        isDirty: false,
        welcomeOpen: false,
      });
    }
  },

  newVooProject: ({ label = "Design 1", width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, canvasType = CANVAS_TYPE.DESIGN } = {}) => {
    const pageId = `page-${Date.now().toString(36)}`;
    const page = {
      id: pageId,
      type: "imageEditor",
      position: { x: 0, y: 0 },
      data: {
        label,
        canvasType,
        editorDoc: createDocument(width, height, "#171717", { canvasType, canvasId: pageId }),
      },
    };
    const fileName = label.endsWith(".voo") ? label : `${label}.voo`;
    try {
      addRecentFile({
        name: fileName,
        path: null,
        isDraft: true,
        category: guessCategory(fileName),
      });
    } catch {
      // non-critical fallback
    }
    set({
      editingNodeId: pageId,
      editingNodeIds: [pageId],
      editingGroupId: null,
      nodes: [page],
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      editorArtboardLayouts: {
        [pageId]: { x: 0, y: 0, width, height },
      },
      filePath: null,
      fileHandle: null,
      fileName,
      isDirty: false,
      welcomeOpen: false,
    });
  },

  closeProject: () => {
    set({
      welcomeOpen: true,
      fileName: null,
      filePath: null,
      fileHandle: null,
      isDirty: false,
      nodes: [],
      editingNodeId: null,
      editingNodeIds: [],
      editingGroupId: null,
    });
  },

  closeImageEditor: () => {
    set({ welcomeOpen: true });
  },

  applyImageEdits: () => {
    set({ isDirty: false });
  },

  materializeEditorGeneratedOutput: () => {},

  // Agent Panel & Hybrid Architecture Actions
  setAgentPanelOpen: (agentPanelOpen) =>
    set({ agentPanelOpen: Boolean(agentPanelOpen) }),
  setAgentOpen: (agentOpen) =>
    set({ agentPanelOpen: Boolean(agentOpen) }),
  dispatchAgentIntent: ({
    prompt = "",
    action = "custom",
    node = null,
  } = {}) => {
    set({
      agentPanelOpen: true,
      pendingAgentIntent: {
        prompt: (prompt || "").trim(),
        action,
        node,
        timestamp: Date.now(),
      },
    });
  },
  dispatchToAgent: (payload) => {
    const prompt = (payload?.prompt || payload?.intent || "").trim();
    const action = payload?.tool || payload?.intent || "custom";
    const node = payload?.context || null;
    set({
      agentPanelOpen: true,
      pendingAgentIntent: {
        prompt,
        action,
        node,
        timestamp: Date.now(),
      },
    });
  },
  clearPendingAgentIntent: () => set({ pendingAgentIntent: null }),
  };
});

export default useDesignStore;
