import { create } from "zustand";
import { createDocument, CANVAS_TYPE } from "../canvas/editor/scene_doc_factory.js";

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
      sceneDoc: createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#171717", {
        canvasType,
        canvasId: id,
      }),
    },
  };
}

let pageCounter = 0;

export const useDesignStore = create((set, get) => ({
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
  filePath: null,
  fileHandle: null,
  fileName: "Untitled.voo",
  isDirty: false,

  // Page / Artboard actions
  focusEditorPage: (id) => {
    if (!id) return;
    set({ editingNodeId: id });
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
        sceneDoc: createDocument(width, height, "#171717", { canvasType, canvasId: id }),
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
        sceneDoc: JSON.parse(JSON.stringify(sourceNode.data?.sceneDoc || {})),
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
    set((state) => ({
      editorCamera: {
        ...state.editorCamera,
        ...(typeof camera === "function" ? camera(state.editorCamera) : camera),
      },
    }));
  },

  panEditorCamera: ({ dx = 0, dy = 0 }) => {
    set((state) => ({
      editorCamera: {
        ...state.editorCamera,
        panX: (state.editorCamera?.panX || 0) + dx,
        panY: (state.editorCamera?.panY || 0) + dy,
      },
    }));
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
    set((state) => ({
      editorArtboardLayouts: {
        ...state.editorArtboardLayouts,
        [id]: { ...(state.editorArtboardLayouts[id] || {}), ...layout },
      },
    }));
  },

  setEditorArtboardLayouts: (layouts) => {
    set({ editorArtboardLayouts: layouts });
  },

  moveEditorArtboard: (id, { dx = 0, dy = 0 }) => {
    set((state) => {
      const current = state.editorArtboardLayouts[id] || { x: 0, y: 0 };
      return {
        editorArtboardLayouts: {
          ...state.editorArtboardLayouts,
          [id]: { ...current, x: (current.x || 0) + dx, y: (current.y || 0) + dy },
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

  // Standalone app: no-op for draft autosave
  saveEditorDrafts: async () => {},

  loadVooProject: ({ vooData, filePath = null, fileName = "Untitled.voo", fileHandle = null }) => {
    const doc = vooData?.document;
    if (!doc) return;

    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const nextNodes = doc.pages.map((page, idx) => ({
        id: page.id || `page-${Date.now().toString(36)}-${idx}`,
        type: "imageEditor",
        position: { x: 0, y: 0 },
        data: {
          label: page.label || `Design ${idx + 1}`,
          canvasType: page.canvasType || CANVAS_TYPE.DESIGN,
          sceneDoc: page.sceneDoc || page.document || createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#171717"),
        },
      }));
      const nextIds = nextNodes.map((n) => n.id);
      const nextFocused = doc.editingNodeId && nextIds.includes(doc.editingNodeId) ? doc.editingNodeId : nextIds[0];
      set({
        nodes: nextNodes,
        editingNodeIds: nextIds,
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
          sceneDoc: doc,
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
        sceneDoc: createDocument(width, height, "#171717", { canvasType, canvasId: pageId }),
      },
    };
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
      fileName: `${label}.voo`,
      isDirty: false,
      welcomeOpen: false,
    });
  },

  closeImageEditor: () => {
    // Window/Editor close hook
  },

  applyImageEdits: () => {
    set({ isDirty: false });
  },

  materializeEditorGeneratedOutput: () => {},
}));

export default useDesignStore;
